#!/usr/bin/env python3
"""
K-LEAN Sleep-Time Consolidation Script

Automates periodic knowledge base restructuring (what /borg-assimilate does manually).
Runs four analysis passes over entries.jsonl, writes a consolidation report, and
optionally applies safe automatic enrichments.

Passes:
  1 - Duplicate detection (>80% keyword overlap AND >60% title word overlap)
  2 - Staleness detection (>90 days since validated, low utility, zero retrievals)
  3 - Pattern abstraction candidates (3+ entries sharing same keyword cluster)
  4 - Relationship enrichment (auto-fill missing related_to via keyword overlap)

Only Pass 4 writes to entries.jsonl automatically. Passes 1-3 are report-only.
Use --apply-all to also apply duplicate supersession (Pass 1).

Usage:
  python klean-consolidate.py                 # Report + auto-enrich relationships
  python klean-consolidate.py --dry-run       # Report only, no writes
  python klean-consolidate.py --apply-all     # Report + enrich + supersede duplicates
  python klean-consolidate.py --json          # JSON output instead of human-readable
"""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from klean_shared import acquire_lock, release_lock, rotate_backups


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DUPLICATE_KEYWORD_THRESHOLD = 0.80   # >80% keyword overlap
DUPLICATE_TITLE_THRESHOLD   = 0.60   # >60% title word overlap
STALE_DAYS                  = 90     # days without validation = stale candidate
STALE_NO_RETRIEVAL_DAYS     = 30     # days with zero retrievals = stale candidate
STALE_UTILITY_FLOOR         = 0.30   # utility_score below this = stale candidate
ABSTRACTION_MIN_CLUSTER     = 3      # min entries per cluster for abstraction
RELATIONSHIP_MIN_SHARED     = 2      # min shared keyword+title terms
RELATIONSHIP_MAX_SUGGESTIONS = 3     # top N related_to suggestions per entry

# Common English stop words to exclude from title-word tokenization
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "be", "been", "has",
    "have", "had", "do", "does", "did", "not", "via", "uses", "use", "using",
    "how", "when", "where", "what", "why", "this", "that", "it", "its", "so",
}


# ---------------------------------------------------------------------------
# Database path resolution
# ---------------------------------------------------------------------------

def find_kb_path() -> Path:
    """Locate entries.jsonl: project-local first, then fallback."""
    from klean_shared import get_kb_path
    result = get_kb_path()
    if result is None:
        raise FileNotFoundError(
            "Cannot find .knowledge-db/entries.jsonl in CWD or C:/LocalAgent/"
        )
    return result


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_entries(kb_path: Path) -> list[dict]:
    """Load all valid entries from JSONL. Returns list preserving order."""
    entries = []
    with open(kb_path, "r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as exc:
                # Non-fatal: skip corrupted lines with a warning
                print(f"[WARN] Line {lineno} is not valid JSON: {exc}", file=sys.stderr)
    return entries


def backup_db(kb_path: Path) -> Path:
    """Create a timestamped backup. Returns the backup path."""
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    backup = Path(str(kb_path) + f".backup-pre-consolidate-{ts}")
    shutil.copy2(kb_path, backup)
    return backup


def save_entries(kb_path: Path, entries: list[dict]) -> None:
    """Atomic write: write to temp file then replace."""
    fd, tmp = tempfile.mkstemp(dir=str(kb_path.parent), suffix=".jsonl")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        os.replace(tmp, str(kb_path))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    rotate_backups(kb_path)


def write_report(report: dict, cache_dir: Path) -> Path:
    """Write consolidation report JSON atomically. Returns report path."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    report_path = cache_dir / "consolidation-report.json"

    fd, tmp = tempfile.mkstemp(dir=str(cache_dir), suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        os.replace(tmp, str(report_path))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

    return report_path


# ---------------------------------------------------------------------------
# Text tokenization helpers
# ---------------------------------------------------------------------------

def tokenize_title(title: str) -> set[str]:
    """Split title into lowercase words, strip stop words and short tokens."""
    words = re.split(r"[\s\-_/:.,()\[\]]+", title.lower())
    return {w for w in words if len(w) > 2 and w not in STOP_WORDS}


def keyword_set(entry: dict) -> set[str]:
    """Return the entry's keyword set (lowercase). Handles missing field."""
    raw = entry.get("keywords") or []
    return {str(k).lower() for k in raw if k}


def combined_terms(entry: dict) -> set[str]:
    """Union of keywords and title tokens — used for relationship matching."""
    return keyword_set(entry) | tokenize_title(entry.get("title", ""))


# ---------------------------------------------------------------------------
# Overlap calculation
# ---------------------------------------------------------------------------

def keyword_overlap(a: set, b: set) -> float:
    """
    Overlap coefficient based on the smaller set.
    More suitable than Jaccard for duplicate detection where one entry may
    be a strict subset of another (e.g., superseded entry with fewer keywords).
    """
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

def parse_date(entry: dict) -> datetime | None:
    """
    Return a timezone-aware UTC datetime from 'timestamp', 'last_validated',
    or 'date' fields. Returns None if none are parseable.
    """
    for field in ("timestamp", "last_validated", "date"):
        raw = entry.get(field)
        if not raw:
            continue
        try:
            # ISO format with or without time component
            if "T" in str(raw):
                dt = datetime.fromisoformat(str(raw).rstrip("Z"))
            else:
                dt = datetime.strptime(str(raw), "%Y-%m-%d")
            # Attach UTC if naive
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            continue
    return None


def parse_last_validated(entry: dict) -> datetime | None:
    """Parse last_validated field specifically."""
    raw = entry.get("last_validated")
    if not raw:
        return None
    try:
        if "T" in str(raw):
            dt = datetime.fromisoformat(str(raw).rstrip("Z"))
        else:
            dt = datetime.strptime(str(raw), "%Y-%m-%d")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Pass 1 — Duplicate Detection
# ---------------------------------------------------------------------------

def pass1_duplicate_detection(entries: list[dict]) -> list[dict]:
    """
    Find entries with >80% keyword overlap AND >60% title word overlap.
    Groups them into clusters. Within each cluster, keeps the most recent
    entry and marks others as superseded_by.

    Returns list of cluster dicts:
      {
        "keep_id": str,
        "keep_title": str,
        "supersede_ids": [str, ...],
        "keyword_overlap_min": float,
        "title_overlap_min": float,
      }
    """
    n = len(entries)
    # Build per-entry term sets once
    kw_sets    = [keyword_set(e) for e in entries]
    title_sets = [tokenize_title(e.get("title", "")) for e in entries]

    # Union-Find for clustering
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # Track overlap scores for each merged pair
    pair_kw_overlap    = {}
    pair_title_overlap = {}

    for i in range(n):
        for j in range(i + 1, n):
            kw_sim    = keyword_overlap(kw_sets[i], kw_sets[j])
            title_sim = keyword_overlap(title_sets[i], title_sets[j])

            if kw_sim > DUPLICATE_KEYWORD_THRESHOLD and title_sim > DUPLICATE_TITLE_THRESHOLD:
                union(i, j)
                pair_kw_overlap[(i, j)]    = kw_sim
                pair_title_overlap[(i, j)] = title_sim

    # Group by cluster root
    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        clusters[find(i)].append(i)

    results = []
    for root, members in clusters.items():
        if len(members) < 2:
            continue  # singleton — not a duplicate cluster

        # Pick most recent as the entry to keep
        def entry_date(idx):
            dt = parse_date(entries[idx])
            return dt if dt is not None else datetime.min.replace(tzinfo=timezone.utc)

        members_sorted = sorted(members, key=entry_date, reverse=True)
        keep_idx       = members_sorted[0]
        supersede_idxs = members_sorted[1:]

        keep_id    = entries[keep_idx].get("id", f"idx:{keep_idx}")
        keep_title = entries[keep_idx].get("title", "")

        # Collect overlap scores for this cluster (min across all intra-cluster pairs)
        cluster_kw_overlaps    = []
        cluster_title_overlaps = []
        for a in members:
            for b in members:
                if a >= b:
                    continue
                key = (a, b)
                if key in pair_kw_overlap:
                    cluster_kw_overlaps.append(pair_kw_overlap[key])
                    cluster_title_overlaps.append(pair_title_overlap[key])

        results.append({
            "keep_id":             keep_id,
            "keep_title":          keep_title,
            "supersede_ids":       [entries[i].get("id", f"idx:{i}") for i in supersede_idxs],
            "supersede_titles":    [entries[i].get("title", "") for i in supersede_idxs],
            "keyword_overlap_min": round(min(cluster_kw_overlaps), 3) if cluster_kw_overlaps else 0.0,
            "title_overlap_min":   round(min(cluster_title_overlaps), 3) if cluster_title_overlaps else 0.0,
        })

    return results


def apply_duplicate_supersession(entries: list[dict], clusters: list[dict]) -> tuple[list[dict], int]:
    """
    Apply Pass 1 results: mark superseded entries with superseded_by field.
    Does NOT delete entries. Returns (modified entries, count changed).
    """
    # Build lookup: supersede_id -> keep_id
    supersession_map = {}
    for cluster in clusters:
        for sid in cluster["supersede_ids"]:
            supersession_map[sid] = cluster["keep_id"]

    changed = 0
    for entry in entries:
        eid = entry.get("id")
        if eid in supersession_map:
            keep_id = supersession_map[eid]
            if entry.get("superseded_by") != keep_id:
                entry["superseded_by"] = keep_id
                changed += 1

    return entries, changed


# ---------------------------------------------------------------------------
# Pass 2 — Staleness Detection
# ---------------------------------------------------------------------------

def pass2_staleness_detection(entries: list[dict]) -> list[dict]:
    """
    Flag entries that are stale candidates. Returns list of:
      {
        "id": str,
        "title": str,
        "reason": str,    -- human-readable
        "reasons": [str], -- machine list
      }

    Staleness criteria (OR logic — any one triggers):
      A. last_validated is null AND entry date > STALE_DAYS old
      B. last_validated is non-null AND > STALE_DAYS old
      C. utility_score exists AND < STALE_UTILITY_FLOOR
      D. retrieval_count == 0 AND entry date > STALE_NO_RETRIEVAL_DAYS old
    """
    now     = datetime.now(tz=timezone.utc)
    stale   = timedelta(days=STALE_DAYS)
    no_retr = timedelta(days=STALE_NO_RETRIEVAL_DAYS)

    results = []
    for entry in entries:
        if entry.get("superseded_by"):
            # Already flagged as superseded — skip to avoid noise
            continue

        reasons = []
        entry_dt    = parse_date(entry)
        validated   = parse_last_validated(entry)
        utility     = entry.get("utility_score")
        retrieval   = entry.get("retrieval_count")

        # Criterion A/B: staleness by validation date
        if validated is None:
            if entry_dt is not None and (now - entry_dt) > stale:
                reasons.append(
                    f"no last_validated and entry is {(now - entry_dt).days} days old"
                )
        else:
            if (now - validated) > stale:
                reasons.append(
                    f"last_validated {(now - validated).days} days ago (threshold {STALE_DAYS})"
                )

        # Criterion C: low utility score
        if utility is not None and utility < STALE_UTILITY_FLOOR:
            reasons.append(
                f"utility_score {utility:.3f} < floor {STALE_UTILITY_FLOOR}"
            )

        # Criterion D: zero retrievals on old entry
        if retrieval is not None and retrieval == 0 and entry_dt is not None:
            age = now - entry_dt
            if age > no_retr:
                reasons.append(
                    f"retrieval_count=0 and entry is {age.days} days old"
                )

        # Criterion E: valid_until expiry (V3.4 decision provenance)
        valid_until = entry.get("valid_until")
        if valid_until:
            try:
                expiry = datetime.strptime(valid_until, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if now > expiry:
                    days_expired = (now - expiry).days
                    severity = "high" if days_expired > 30 else "medium"
                    reasons.append(
                        f"decision expired {days_expired}d ago (valid_until: {valid_until}, severity: {severity})"
                    )
            except ValueError:
                pass

        if reasons:
            results.append({
                "id":      entry.get("id", ""),
                "title":   entry.get("title", ""),
                "reasons": reasons,
                "reason":  "; ".join(reasons),
            })

    return results


# ---------------------------------------------------------------------------
# Pass 3 — Pattern Abstraction Candidates
# ---------------------------------------------------------------------------

def pass3_abstraction_candidates(entries: list[dict]) -> list[dict]:
    """
    Find clusters of 3+ entries sharing a dominant keyword.
    Generates a suggested abstract title for each cluster.

    Returns list of:
      {
        "cluster_keyword": str,
        "entry_ids": [str, ...],
        "entry_titles": [str, ...],
        "suggested_title": str,
        "cluster_size": int,
      }
    """
    # Group entries by each keyword they contain
    keyword_to_entries: dict[str, list[int]] = defaultdict(list)
    for idx, entry in enumerate(entries):
        if entry.get("superseded_by"):
            continue  # exclude superseded
        for kw in keyword_set(entry):
            keyword_to_entries[kw].append(idx)

    seen_clusters: set[frozenset] = set()
    results = []

    # Sort by cluster size descending so we report the most significant first
    sorted_kws = sorted(
        keyword_to_entries.items(),
        key=lambda kv: len(kv[1]),
        reverse=True,
    )

    for keyword, idxs in sorted_kws:
        if len(idxs) < ABSTRACTION_MIN_CLUSTER:
            continue

        # Deduplicate: skip clusters we've already seen with another keyword
        cluster_key = frozenset(idxs)
        if cluster_key in seen_clusters:
            continue
        seen_clusters.add(cluster_key)

        cluster_entries = [entries[i] for i in idxs]
        entry_ids    = [e.get("id", "") for e in cluster_entries]
        entry_titles = [e.get("title", "") for e in cluster_entries]

        # Generate suggested abstract title from the shared keyword and type distribution
        types = [e.get("type", "entry") for e in cluster_entries]
        dominant_type = max(set(types), key=types.count)
        # Collect all shared keywords across all cluster entries
        all_kw_sets = [keyword_set(e) for e in cluster_entries]
        shared_kws  = set.intersection(*all_kw_sets) if all_kw_sets else set()
        shared_str  = ", ".join(sorted(shared_kws)[:3]) if shared_kws else keyword

        suggested_title = f"[ABSTRACT] {shared_str} — {len(idxs)} {dominant_type} entries"

        results.append({
            "cluster_keyword":  keyword,
            "shared_keywords":  sorted(shared_kws),
            "entry_ids":        entry_ids,
            "entry_titles":     entry_titles,
            "suggested_title":  suggested_title,
            "cluster_size":     len(idxs),
        })

    return results


# ---------------------------------------------------------------------------
# Pass 4 — Relationship Enrichment
# ---------------------------------------------------------------------------

def pass4_relationship_enrichment(entries: list[dict]) -> tuple[list[dict], int]:
    """
    For entries with no related_to (or empty list), find top candidates by
    combined keyword+title term overlap. Updates entries in-place.

    Returns (entries, count_enriched).
    Requires at least RELATIONSHIP_MIN_SHARED shared terms.
    """
    # Pre-compute combined term sets
    term_sets = [combined_terms(e) for e in entries]
    id_list   = [e.get("id", "") for e in entries]

    enriched = 0

    for i, entry in enumerate(entries):
        existing = set(entry.get("related_to") or [])
        own_id   = id_list[i]

        # Skip entries that already have relationships
        if existing:
            continue

        candidates = []
        for j, other in enumerate(entries):
            if i == j:
                continue
            other_id = id_list[j]
            if other_id == own_id or other_id in existing:
                continue
            # Skip superseded entries (fleet review fix: don't link to dead entries)
            if other.get("superseded_by"):
                continue

            shared = term_sets[i] & term_sets[j]
            if len(shared) >= RELATIONSHIP_MIN_SHARED:
                score = len(shared)
                candidates.append((score, other_id, sorted(shared)))

        if not candidates:
            continue

        # Sort by shared term count descending, take top N
        candidates.sort(key=lambda x: x[0], reverse=True)
        top = candidates[:RELATIONSHIP_MAX_SUGGESTIONS]

        entry["related_to"] = [c[1] for c in top]
        enriched += 1

    # V3.4 Memory Layer Promotion (source: mnemory two-layer pattern, SKILL0 internalization)
    # Entries that survived all passes (not superseded, not stale) get promoted
    # from "raw" to "consolidated". This signals higher trust in auto-recall scoring.
    promoted = 0
    for entry in entries:
        layer = entry.get("memory_layer", "raw")
        superseded = entry.get("superseded_by")
        if layer == "raw" and not superseded:
            entry["memory_layer"] = "consolidated"
            promoted += 1

    return entries, enriched, promoted


# ---------------------------------------------------------------------------
# Human-readable report printer
# ---------------------------------------------------------------------------

def print_human_report(report: dict) -> None:
    """Print a structured human-readable summary to stdout."""
    meta = report["meta"]
    print(f"\nK-LEAN Consolidation Report")
    print(f"Generated:    {meta['timestamp']}")
    print(f"Database:     {meta['db_path']}")
    print(f"Total entries: {meta['total_entries']}")
    print(f"Dry run:      {meta['dry_run']}")
    print(f"Apply all:    {meta['apply_all']}")

    # Pass 1
    dups = report["pass1_duplicates"]
    print(f"\n--- Pass 1: Duplicate Detection ({len(dups)} clusters) ---")
    if dups:
        for cluster in dups:
            print(f"  KEEP:       {cluster['keep_id']}")
            print(f"              {cluster['keep_title']}")
            for sid, stitle in zip(cluster["supersede_ids"], cluster["supersede_titles"]):
                print(f"  SUPERSEDE:  {sid}")
                print(f"              {stitle}")
            print(f"  kw_overlap={cluster['keyword_overlap_min']:.2f}  "
                  f"title_overlap={cluster['title_overlap_min']:.2f}")
            print()
    else:
        print("  No duplicate clusters found.")

    # Pass 2
    stale = report["pass2_stale"]
    print(f"\n--- Pass 2: Staleness Candidates ({len(stale)} entries) ---")
    if stale:
        for s in stale[:20]:  # cap display at 20
            print(f"  {s['id']}")
            print(f"    {s['title']}")
            for r in s["reasons"]:
                print(f"    - {r}")
        if len(stale) > 20:
            print(f"  ... and {len(stale) - 20} more (see JSON report)")
    else:
        print("  No stale candidates found.")

    # Pass 3
    abstractions = report["pass3_abstractions"]
    print(f"\n--- Pass 3: Abstraction Candidates ({len(abstractions)} clusters) ---")
    if abstractions:
        for a in abstractions[:10]:  # cap display at 10
            print(f"  Cluster: {a['cluster_keyword']} ({a['cluster_size']} entries)")
            print(f"  Shared keywords: {', '.join(a['shared_keywords'][:5])}")
            print(f"  Suggested: {a['suggested_title']}")
            for title in a["entry_titles"][:3]:
                print(f"    - {title}")
            if len(a["entry_titles"]) > 3:
                print(f"    ... and {len(a['entry_titles']) - 3} more")
            print()
        if len(abstractions) > 10:
            print(f"  ... and {len(abstractions) - 10} more (see JSON report)")
    else:
        print("  No abstraction candidates found.")

    # Pass 4
    p4 = report["pass4_relationships"]
    print(f"\n--- Pass 4: Relationship Enrichment ---")
    print(f"  Entries enriched: {p4['entries_enriched']}")
    if p4["dry_run"]:
        print("  (dry-run: no writes performed)")
    else:
        print(f"  Backup: {p4.get('backup_path', 'n/a')}")
        print(f"  Written: {p4.get('written', False)}")

    # Summary
    summary = report["summary"]
    print(f"\n--- Summary ---")
    print(f"  Duplicates found:          {summary['duplicates_found']}")
    print(f"  Supersessions applied:     {summary['supersessions_applied']}")
    print(f"  Stale candidates:          {summary['stale_candidates']}")
    print(f"  Abstraction candidates:    {summary['abstraction_candidates']}")
    print(f"  Relationships added:       {summary['relationships_added']}")
    print(f"  Report:                    {report.get('report_path', 'n/a')}")
    print()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="K-LEAN sleep-time consolidation: dedup, stale, abstract, enrich."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report only — no writes to entries.jsonl",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output report as JSON to stdout",
    )
    parser.add_argument(
        "--apply-all",
        action="store_true",
        help="Apply Pass 1 duplicate supersession in addition to Pass 4 enrichment",
    )
    args = parser.parse_args()

    # Resolve paths
    try:
        kb_path = find_kb_path()
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    cache_dir = Path.home() / ".claude" / "cache"

    lock_path = kb_path.parent / ".entries.lock"
    if not acquire_lock(lock_path):
        print("ERROR: Could not acquire lock on entries.jsonl (timeout 10s)", file=sys.stderr)
        return 1

    # Load database
    try:
        entries = load_entries(kb_path)
    except OSError as exc:
        release_lock(lock_path)
        print(f"ERROR: Cannot read {kb_path}: {exc}", file=sys.stderr)
        return 1

    try:
        total = len(entries)
        timestamp = datetime.now(tz=timezone.utc).isoformat()

        # -------------------------------------------------------------------
        # Pass 1: Duplicate detection
        # -------------------------------------------------------------------
        dup_clusters = pass1_duplicate_detection(entries)

        supersessions_applied = 0
        backup_path_p1 = None

        if args.apply_all and not args.dry_run and dup_clusters:
            backup_path_p1 = str(backup_db(kb_path))
            entries, supersessions_applied = apply_duplicate_supersession(entries, dup_clusters)

        # -------------------------------------------------------------------
        # Pass 2: Staleness detection
        # -------------------------------------------------------------------
        stale_candidates = pass2_staleness_detection(entries)

        # -------------------------------------------------------------------
        # Pass 3: Pattern abstraction candidates
        # -------------------------------------------------------------------
        abstraction_candidates = pass3_abstraction_candidates(entries)

        # -------------------------------------------------------------------
        # Pass 4: Relationship enrichment
        # -------------------------------------------------------------------
        entries, enriched_count, promoted_count = pass4_relationship_enrichment(entries)

        backup_path_p4 = None
        written_p4     = False

        if not args.dry_run and (enriched_count > 0 or promoted_count > 0):
            # Only create a backup if we haven't already created one in Pass 1
            if backup_path_p1 is None:
                backup_path_p4 = str(backup_db(kb_path))
            else:
                backup_path_p4 = backup_path_p1  # reuse the same backup

            try:
                save_entries(kb_path, entries)
                written_p4 = True
            except OSError as exc:
                print(f"ERROR: Cannot write {kb_path}: {exc}", file=sys.stderr)
                return 1

        # -------------------------------------------------------------------
        # Assemble report
        # -------------------------------------------------------------------
        report = {
            "meta": {
                "timestamp":    timestamp,
                "db_path":      str(kb_path),
                "total_entries": total,
                "dry_run":      args.dry_run,
                "apply_all":    args.apply_all,
            },
            "pass1_duplicates": dup_clusters,
            "pass2_stale": stale_candidates,
            "pass3_abstractions": abstraction_candidates,
            "pass4_relationships": {
                "entries_enriched": enriched_count,
                "entries_promoted": promoted_count,
                "dry_run":          args.dry_run,
                "backup_path":      backup_path_p4 or backup_path_p1,
                "written":          written_p4,
            },
            "summary": {
                "duplicates_found":       len(dup_clusters),
                "supersessions_applied":  supersessions_applied,
                "stale_candidates":       len(stale_candidates),
                "abstraction_candidates": len(abstraction_candidates),
                "relationships_added":    enriched_count if not args.dry_run else 0,
                "layers_promoted":        promoted_count if not args.dry_run else 0,
            },
        }

        # Write report to cache
        try:
            report_path = write_report(report, cache_dir)
            report["report_path"] = str(report_path)
        except OSError as exc:
            print(f"[WARN] Cannot write report: {exc}", file=sys.stderr)
            report["report_path"] = None

        # -------------------------------------------------------------------
        # Output
        # -------------------------------------------------------------------
        if args.json_output:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            print_human_report(report)

        return 0

    finally:
        release_lock(lock_path)


if __name__ == "__main__":
    sys.exit(main())
