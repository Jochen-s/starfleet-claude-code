#!/usr/bin/env python3
"""
K-LEAN Utility Score Updater (Q-value)

Updates utility_score for K-LEAN entries based on task outcomes.
Implements exponential moving average: Q_new = Q_old + alpha * (reward - Q_old)

Usage:
  # After successful task that used entry "fix-20260312-tts-overlap-v2":
  python klean-utility-update.py --entry-id fix-20260312-tts-overlap-v2 --reward 1.0

  # After task failure despite using an entry:
  python klean-utility-update.py --entry-id fix-20260312-tts-overlap-v2 --reward 0.0

  # Batch update from session outcomes file:
  python klean-utility-update.py --batch session-outcomes.json

  # Decay all unretrieved entries (run periodically):
  python klean-utility-update.py --decay

Assimilated from MemRL Q-value pattern (2026-03-28).
Paper reference: Dupoux, LeCun, Malik (arXiv:2603.15381) -- episodic memory with value-weighted retrieval.
"""

import sys
import json
import argparse
import os
from collections import defaultdict
from pathlib import Path
from datetime import datetime


# EMA learning rate: how quickly utility adapts to new signals
# 0.1 = slow adaptation (stable over many sessions)
# 0.3 = moderate adaptation (responds to recent outcomes)
ALPHA = 0.2

# Default utility for new/unscored entries
DEFAULT_UTILITY = 0.5

# Decay rate for entries not retrieved (per decay cycle)
# Entries that aren't being used slowly drift toward 0.3 (not zero -- they may still be relevant)
DECAY_RATE = 0.05
DECAY_FLOOR = 0.3

# Time-based confidence decay (SNARC-inspired: knowledge has a half-life)
# Entries not validated within STALENESS_DAYS lose confidence at CONFIDENCE_DECAY_RATE per cycle
# decay_class overrides: permanent=never, stable=2x threshold, volatile=0.5x threshold
STALENESS_DAYS = 30
CONFIDENCE_DECAY_RATE = 0.03
CONFIDENCE_FLOOR = 0.4


def get_kb_path():
    """Find the knowledge database."""
    # Try project-local first
    local = Path(".knowledge-db/entries.jsonl")
    if local.exists():
        return local
    # Fallback to LocalAgent
    fallback = Path("C:/LocalAgent/.knowledge-db/entries.jsonl")
    if fallback.exists():
        return fallback
    return None


def load_entries(kb_path):
    """Load all entries from JSONL."""
    entries = []
    with open(kb_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    entries.append(None)  # preserve line position
    return entries


def save_entries(kb_path, entries):
    """Write entries back to JSONL atomically."""
    import shutil
    import tempfile

    # Backup
    backup = str(kb_path) + f".backup-pre-utility-{datetime.now().strftime('%Y%m%dT%H%M%S')}"
    shutil.copy2(kb_path, backup)

    # Atomic write
    fd, tmp = tempfile.mkstemp(dir=str(kb_path.parent), suffix=".jsonl")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            for entry in entries:
                if entry is None:
                    continue
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        os.replace(tmp, str(kb_path))
    except Exception:
        os.unlink(tmp)
        raise

    return backup


def update_single(entries, entry_id, reward):
    """Update utility_score for a single entry using EMA."""
    # Clamp reward to valid range
    reward = max(0.0, min(1.0, reward))
    for entry in entries:
        if entry is None:
            continue
        if entry.get("id") == entry_id:
            old_q = entry.get("utility_score")
            if old_q is None:
                old_q = DEFAULT_UTILITY
            new_q = old_q + ALPHA * (reward - old_q)
            entry["utility_score"] = round(max(0.0, min(1.0, new_q)), 4)

            # Increment retrieval count
            rc = entry.get("retrieval_count") or 0
            entry["retrieval_count"] = rc + 1

            return old_q, entry["utility_score"]
    return None, None


def decay_unretrieved(entries):
    """Decay utility of entries that haven't been retrieved recently."""
    decayed = 0
    for entry in entries:
        if entry is None:
            continue
        score = entry.get("utility_score")
        if score is None:
            continue  # Never scored, skip
        if score <= DECAY_FLOOR:
            continue  # Already at floor

        # Only decay if retrieval_count is 0 or entry has been around a while
        rc = entry.get("retrieval_count") or 0
        if rc == 0:
            new_score = max(DECAY_FLOOR, score - DECAY_RATE)
            if new_score != score:
                entry["utility_score"] = round(new_score, 4)
                decayed += 1
    return decayed


def age_decay_confidence(entries):
    """Decay confidence of entries that haven't been validated recently.

    SNARC-inspired: knowledge has a half-life. Entries not re-validated
    within STALENESS_DAYS lose confidence gradually. decay_class controls
    the rate: permanent entries never decay, stable entries have 2x the
    staleness threshold, volatile entries have 0.5x.
    """
    today = datetime.now().date()
    decayed = 0
    for entry in entries:
        if entry is None:
            continue

        dc = entry.get("decay_class", "stable")
        if dc == "permanent":
            continue

        conf = entry.get("confidence")
        if conf is None:
            continue
        if conf <= CONFIDENCE_FLOOR:
            continue

        # Determine staleness threshold based on decay_class
        if dc == "volatile":
            threshold_days = STALENESS_DAYS * 0.5
        elif dc == "stable":
            threshold_days = STALENESS_DAYS * 2
        else:
            threshold_days = STALENESS_DAYS

        last_val = entry.get("last_validated")
        if last_val is None:
            # Use timestamp as fallback
            ts = entry.get("timestamp", "")
            if ts:
                try:
                    last_val = ts[:10]  # ISO date prefix
                except (IndexError, TypeError):
                    continue
            else:
                continue

        try:
            last_date = datetime.strptime(last_val[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        age_days = (today - last_date).days
        if age_days <= threshold_days:
            continue

        # Decay proportional to how far past threshold
        overage_factor = min((age_days - threshold_days) / threshold_days, 1.0)
        decay_amount = CONFIDENCE_DECAY_RATE * (1 + overage_factor)
        new_conf = max(CONFIDENCE_FLOOR, conf - decay_amount)
        if new_conf != conf:
            entry["confidence"] = round(new_conf, 4)
            decayed += 1

    return decayed


def batch_update(entries, outcomes_file):
    """Process a batch of outcomes from a JSON file.

    Expected format: [{"entry_id": "...", "reward": 1.0}, ...]
    """
    with open(outcomes_file, "r", encoding="utf-8") as f:
        outcomes = json.load(f)

    results = []
    for outcome in outcomes:
        eid = outcome.get("entry_id")
        reward = outcome.get("reward", 0.5)
        old_q, new_q = update_single(entries, eid, reward)
        if old_q is not None:
            results.append({"entry_id": eid, "old": old_q, "new": new_q})
    return results


def apply_causal_boost(entries):
    """Pass 2: Boost utility of entries referenced in causal_chain fields (V3.4).

    Entries that are cited by other decisions proved useful in real context;
    reward them with a gentle pull toward 0.8.
    """
    chain_refs = defaultdict(int)
    for entry in entries:
        if entry is None:
            continue
        for ref_id in entry.get("causal_chain", []):
            chain_refs[ref_id] += 1

    if not chain_refs:
        return 0

    boost_alpha = 0.1
    boosted = 0
    for entry in entries:
        if entry is None:
            continue
        eid = entry.get("id")
        if eid and eid in chain_refs:
            current = entry.get("utility_score") or 0.5
            entry["utility_score"] = round(current + boost_alpha * (0.8 - current), 4)
            boosted += 1
    return boosted


def main():
    parser = argparse.ArgumentParser(description="K-LEAN utility score updater (Q-value EMA)")
    parser.add_argument("--entry-id", help="ID of the entry to update")
    parser.add_argument("--reward", type=float, help="Reward signal: 1.0 = success, 0.0 = failure, 0.5 = neutral")
    parser.add_argument("--batch", help="Path to batch outcomes JSON file")
    parser.add_argument("--decay", action="store_true", help="Decay unretrieved entries")
    parser.add_argument("--age-decay", action="store_true", help="Decay confidence of stale entries (SNARC pattern)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")

    args = parser.parse_args()

    kb_path = get_kb_path()
    if not kb_path:
        print("ERROR: Knowledge DB not found", file=sys.stderr)
        return 1

    entries = load_entries(kb_path)

    if args.entry_id and args.reward is not None:
        old_q, new_q = update_single(entries, args.entry_id, args.reward)
        if old_q is None:
            print(f"Entry not found: {args.entry_id}", file=sys.stderr)
            return 1

        if not args.dry_run:
            apply_causal_boost(entries)
            save_entries(kb_path, entries)

        if args.json:
            print(json.dumps({"entry_id": args.entry_id, "old_utility": old_q, "new_utility": new_q}))
        else:
            direction = "+" if new_q > old_q else "-" if new_q < old_q else "="
            print(f"{args.entry_id}: {old_q:.4f} -> {new_q:.4f} ({direction})")

    elif args.batch:
        results = batch_update(entries, args.batch)
        if not args.dry_run:
            apply_causal_boost(entries)
            save_entries(kb_path, entries)

        if args.json:
            print(json.dumps({"updated": len(results), "results": results}))
        else:
            print(f"Updated {len(results)} entries")
            for r in results:
                print(f"  {r['entry_id']}: {r['old']:.4f} -> {r['new']:.4f}")

    elif args.decay:
        decayed = decay_unretrieved(entries)
        if not args.dry_run:
            apply_causal_boost(entries)
            save_entries(kb_path, entries)

        if args.json:
            print(json.dumps({"decayed": decayed}))
        else:
            print(f"Decayed {decayed} unretrieved entries (floor: {DECAY_FLOOR})")

    elif args.age_decay:
        decayed = age_decay_confidence(entries)
        if not args.dry_run:
            apply_causal_boost(entries)
            save_entries(kb_path, entries)

        if args.json:
            print(json.dumps({"age_decayed": decayed}))
        else:
            print(f"Age-decayed {decayed} stale entries (threshold: {STALENESS_DAYS}d, floor: {CONFIDENCE_FLOOR})")

    else:
        parser.print_help()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
