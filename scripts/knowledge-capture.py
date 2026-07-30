#!/usr/bin/env python3
"""
K-LEAN Knowledge Capture Script

Saves lessons, findings, and insights to the knowledge database.
Supports both simple CLI input and structured JSON for Claude integration.

Usage:
  knowledge-capture.py <content> [--type TYPE] [--tags TAG1,TAG2] [--priority LEVEL] [--url URL]
  knowledge-capture.py --json-input '<json>' [--json]

Types: warning, solution, pattern, finding (auto-inferred if omitted)
Priority: critical, high, medium, low

JSON Input (V3.3 Schema):
  {
    "title": "Short descriptive title (max 80 chars)",
    "insight": "2-4 sentence explanation with actionable details",
    "type": "warning|solution|pattern|finding|decision|discovery",
    "priority": "critical|high|medium|low",
    "keywords": ["searchable", "terms"],
    "source": "https://url or file:path:line or git:hash or conv:YYYY-MM-DD",
    "memory_type": "semantic|procedural|episodic|preference",
    "related_to": ["entry-id-1"],
    "depends_on": ["decision-id"],
    "confidence": 0.85,
    "last_validated": "2026-03-10",
    "decay_class": "volatile|stable|permanent"
  }

Examples:
  knowledge-capture.py "Always validate user input" --type warning --tags security,validation
  knowledge-capture.py --json-input '{"title":"Input Validation","insight":"Always validate...","memory_type":"semantic"}' --json
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Import shared utilities
try:
    from kb_utils import (  # noqa: F401
        PYTHON_BIN,
        debug_log,
        find_project_root,
        get_socket_path,
        infer_type,
        is_server_running,
    )
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from kb_utils import (
        PYTHON_BIN,
        debug_log,
        infer_type,
        is_server_running,
    )


def _get_current_branch() -> str:
    """Get current git branch name."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return ""


# Result of initialization
class InitResult:
    def __init__(self, path, newly_created=False, server_started=False):
        self.path = path
        self.newly_created = newly_created
        self.server_started = server_started


def start_kb_server(project_path):
    """Start the KB server for a project."""
    # Import KB_SCRIPTS_DIR from kb_utils (set from environment)
    from kb_utils import KB_SCRIPTS_DIR

    server_script = KB_SCRIPTS_DIR / "knowledge-server.py"

    if not server_script.exists() or not PYTHON_BIN.exists():
        debug_log(f"Missing server script or Python: {server_script}, {PYTHON_BIN}")
        return False

    try:
        # Start server in background
        subprocess.Popen(
            [str(PYTHON_BIN), str(server_script), "start", str(project_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        # Wait briefly for server to start
        import time

        for _ in range(10):  # Wait up to 5 seconds
            time.sleep(0.5)
            if is_server_running(project_path):
                return True
        debug_log("KB server failed to start within timeout")
        return False
    except Exception as e:
        debug_log(f"Error starting KB server: {e}")
        return False


def get_knowledge_dir():
    """Get the knowledge database directory with auto-initialization.

    Returns an InitResult with:
    - path: Path to .knowledge-db
    - newly_created: True if directory was just created
    - server_started: True if KB server was just started
    """
    # Try CLAUDE_PROJECT_DIR first (set by Claude Code)
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    knowledge_db = Path(project_dir) / ".knowledge-db"

    # Check if it already exists
    newly_created = not knowledge_db.exists()

    # Create if doesn't exist
    knowledge_db.mkdir(parents=True, exist_ok=True)

    # Check if server needs to be started
    server_started = False
    if not is_server_running(project_dir):
        # Only try to start if we have an index or this is new
        index_dir = knowledge_db / "index"
        if index_dir.exists() or newly_created:
            server_started = start_kb_server(project_dir)

    return InitResult(knowledge_db, newly_created, server_started)


def create_entry(content, entry_type="finding", tags=None, priority="medium", url=None):
    """Create a knowledge database entry (simple mode, V3.2 schema)."""
    if tags is None:
        tags = []
    elif isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    # Normalize legacy types
    if entry_type in ("lesson", "best-practice"):
        entry_type = "finding"

    # Generate a unique ID
    entry_id = f"{entry_type}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # V3.4 Schema (added memory_layer)
    entry = {
        "id": entry_id,
        "title": content[:100] if len(content) <= 100 else content[:97] + "...",
        "insight": content,
        "type": entry_type,
        "priority": priority,
        "keywords": tags[:10],
        "source": url or f"conv:{datetime.now().strftime('%Y-%m-%d')}",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "timestamp": datetime.now().isoformat(),
        "branch": _get_current_branch(),
        "related_to": [],
        "memory_type": "semantic",
        "depends_on": [],
        "confidence": None,
        "last_validated": None,
        "decay_class": "stable",
        "memory_layer": "raw",
    }

    return entry


def create_entry_from_json(data: dict):
    """Create a knowledge database entry from structured JSON.

    Always outputs V3.2 schema, but accepts V2, V3, and V3.1 input field names.
    V3.2 Schema: id, title, insight, type, priority, keywords, source, date,
                 timestamp, branch, related_to, memory_type, depends_on,
                 confidence, last_validated
    """
    entry_type = data.get("type", "")

    # Normalize legacy types or infer from content
    if not entry_type or entry_type in ("lesson", "best-practice"):
        title = data.get("title", "")
        insight = data.get("insight") or data.get("atomic_insight") or data.get("summary") or ""
        entry_type = infer_type(title, insight)

    entry_id = data.get("id") or f"{entry_type}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # Merge insight sources: insight > atomic_insight > summary
    insight = data.get("insight") or data.get("atomic_insight") or data.get("summary") or ""

    # Merge keyword sources: keywords > tags + key_concepts
    keywords = data.get("keywords")
    if not keywords:
        tags = data.get("tags", [])
        concepts = data.get("key_concepts", [])
        keywords = list(dict.fromkeys(tags + concepts))  # Dedupe, preserve order

    # Merge source: source > url > source_path
    source = data.get("source", "")
    if not source or source in ("manual", "conversation", "review"):
        source = (
            data.get("url")
            or data.get("source_path")
            or f"conv:{datetime.now().strftime('%Y-%m-%d')}"
        )

    # Parse and validate V3.2 fields
    _valid_memory_types = {"semantic", "procedural", "episodic", "preference"}
    raw_memory_type = data.get("memory_type", "semantic")
    memory_type = raw_memory_type if raw_memory_type in _valid_memory_types else "semantic"

    raw_depends_on = data.get("depends_on", [])
    if isinstance(raw_depends_on, list):
        depends_on = [x for x in raw_depends_on if isinstance(x, str) and x]
    else:
        depends_on = []

    raw_confidence = data.get("confidence", None)
    if raw_confidence is None:
        confidence_val = None
    elif isinstance(raw_confidence, (int, float)) and not isinstance(raw_confidence, bool):
        confidence_val = max(0.0, min(1.0, float(raw_confidence)))
    elif isinstance(raw_confidence, str):
        try:
            confidence_val = max(0.0, min(1.0, float(raw_confidence)))
        except ValueError:
            confidence_val = None
    else:
        confidence_val = None

    raw_last_validated = data.get("last_validated")
    if isinstance(raw_last_validated, str) and len(raw_last_validated) == 10:
        try:
            datetime.strptime(raw_last_validated, "%Y-%m-%d")
            last_validated = raw_last_validated
        except ValueError:
            last_validated = None
    else:
        last_validated = None

    # Parse decay_class (V3.3)
    _valid_decay_classes = {"volatile", "stable", "permanent"}
    raw_decay_class = data.get("decay_class", "stable")
    decay_class = raw_decay_class if isinstance(raw_decay_class, str) and raw_decay_class in _valid_decay_classes else "stable"

    # V3.4 Schema output (added memory_layer)
    # memory_layer: "raw" for auto-captures, "consolidated" for user-intentional or post-consolidation
    _valid_layers = {"raw", "consolidated"}
    raw_layer = data.get("memory_layer", "consolidated")  # explicit /kln:learn = trusted = consolidated
    memory_layer = raw_layer if isinstance(raw_layer, str) and raw_layer in _valid_layers else "consolidated"

    entry = {
        "id": entry_id,
        "title": data.get("title", ""),
        "insight": insight,
        "type": entry_type,
        "priority": data.get("priority", "medium"),
        "keywords": keywords[:10],
        "source": source,
        "date": data.get("date") or datetime.now().strftime("%Y-%m-%d"),
        "timestamp": data.get("timestamp") or datetime.now().isoformat(),
        "branch": data.get("branch") or _get_current_branch(),
        "related_to": [x for x in data.get("related_to", []) if isinstance(x, str) and x]
            if isinstance(data.get("related_to", []), list) else [],
        "memory_type": memory_type,
        "depends_on": depends_on,
        "confidence": confidence_val,
        "last_validated": last_validated,
        "decay_class": decay_class,
        "memory_layer": memory_layer,
    }

    # Ensure title exists
    if not entry["title"] and entry["insight"]:
        entry["title"] = entry["insight"][:100]

    return entry


def send_entry_to_server(entry: dict, project_path: str) -> bool:
    """Send entry to running KB server via TCP.

    This is the preferred method - ensures entry is immediately searchable
    because the server's in-memory index is updated atomically.

    Args:
        entry: Knowledge entry dictionary.
        project_path: Path to project root.

    Returns:
        True if entry was added via server, False otherwise.
    """
    import socket

    try:
        from kb_utils import get_kb_port_file
    except ImportError:
        return False

    # Get server port
    port_file = get_kb_port_file(Path(project_path))
    if not port_file.exists():
        debug_log("KB server not running (no port file)")
        return False

    try:
        port = int(port_file.read_text().strip())
    except (ValueError, OSError):
        debug_log("Invalid port file")
        return False

    # Send to server
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect(("127.0.0.1", port))
        sock.sendall(json.dumps({"cmd": "add", "entry": entry}).encode("utf-8"))
        response = sock.recv(65536).decode("utf-8")
        sock.close()

        result = json.loads(response)
        if result.get("status") == "ok":
            debug_log(f"Entry added via server: {result.get('id')}")
            return True
        else:
            debug_log(f"Server rejected entry: {result.get('error')}")
            return False
    except Exception as e:
        debug_log(f"Failed to send to server: {e}")
        return False


def _notify_server_reload(project_path: str) -> None:
    """Send reload command to running KB server (best-effort)."""
    import socket

    try:
        from kb_utils import get_kb_port_file
    except ImportError:
        return

    port_file = get_kb_port_file(Path(project_path))
    if not port_file.exists():
        return

    try:
        port = int(port_file.read_text().strip())
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect(("127.0.0.1", port))
        sock.sendall(json.dumps({"cmd": "reload"}).encode("utf-8"))
        sock.recv(4096)  # Read response to complete handshake
        sock.close()
        debug_log("Notified server to reload index")
    except Exception as e:
        debug_log(f"Server reload notification failed (non-fatal): {e}")


def suggest_relationships(entry, knowledge_dir, max_suggestions=3):
    """Auto-suggest related_to IDs based on keyword + title overlap.

    Addresses kill condition: related_to >10% populated by 2026-05-01.
    Only suggests if entry has no related_to already set.
    Returns list of (entry_id, score, title) tuples.
    Assimilated pattern: ai-orchestrator strategy learner (2026-03-28).
    """
    if entry.get("related_to"):
        return []  # User already provided relationships

    entries_file = knowledge_dir / "entries.jsonl"
    if not entries_file.exists():
        return []

    # Build keyword set from new entry
    new_keywords = set(k.lower() for k in entry.get("keywords", []))
    new_title_words = set(w.lower() for w in entry.get("title", "").split() if len(w) > 3)
    new_terms = new_keywords | new_title_words
    if not new_terms:
        return []

    candidates = []
    try:
        with open(entries_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    existing = json.loads(line)
                except json.JSONDecodeError:
                    continue

                eid = existing.get("id", "")
                if eid == entry.get("id", ""):
                    continue  # Don't relate to self

                # Score: keyword overlap + title word overlap
                ex_keywords = set(k.lower() for k in existing.get("keywords", []))
                ex_title_words = set(w.lower() for w in existing.get("title", "").split() if len(w) > 3)
                ex_terms = ex_keywords | ex_title_words

                overlap = new_terms & ex_terms
                if len(overlap) >= 2:  # Minimum 2 shared terms
                    score = len(overlap) / max(len(new_terms), 1)
                    candidates.append((eid, round(score, 2), existing.get("title", "")[:60]))
    except Exception:
        return []

    # Sort by score descending, return top N
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[:max_suggestions]


def compute_salience(entry):
    """Pre-storage salience scoring (SNARC-inspired).

    Scores an entry on 5 dimensions before storage:
    - Specificity: Does the insight contain concrete details? (0-1)
    - Novelty: Is this different from generic advice? (0-1)
    - Actionability: Can someone act on this? (0-1)
    - Groundedness: Does it reference specific files/functions/errors? (0-1)
    - Priority signal: Higher priority = higher salience (0-1)

    Returns (score, signals) where score is 0.0-1.0 weighted composite.
    Entries scoring below 0.3 get a warning; below 0.2 are flagged as noise.
    """
    signals = {}
    insight = entry.get("insight", "")
    title = entry.get("title", "")
    source = entry.get("source", "")

    # Specificity: longer insights with numbers/paths/names score higher
    word_count = len(insight.split())
    has_numbers = any(c.isdigit() for c in insight)
    has_path = "/" in insight or "\\" in insight or ":" in source
    specificity = min(1.0, word_count / 40)  # 40+ words = max
    if has_numbers:
        specificity = min(1.0, specificity + 0.15)
    if has_path:
        specificity = min(1.0, specificity + 0.15)
    signals["specificity"] = round(specificity, 2)

    # Novelty: penalize generic phrases
    generic_phrases = [
        "always", "never forget", "best practice", "make sure",
        "be careful", "important to", "remember to", "don't forget"
    ]
    insight_lower = insight.lower()
    generic_count = sum(1 for p in generic_phrases if p in insight_lower)
    novelty = max(0.0, 1.0 - generic_count * 0.25)
    signals["novelty"] = round(novelty, 2)

    # Actionability: contains fix/workaround/use/avoid/set/change/add
    action_words = [
        "fix", "workaround", "use ", "avoid", "set ", "change",
        "add ", "remove", "replace", "configure", "install",
        "run ", "execute", "check ", "verify"
    ]
    action_count = sum(1 for w in action_words if w in insight_lower)
    actionability = min(1.0, action_count * 0.3)
    signals["actionability"] = round(actionability, 2)

    # Groundedness: references files, functions, error codes
    grounded_patterns = ["file:", "git:", "conv:", "http", ".py", ".js", ".ts", "line "]
    ground_count = sum(1 for p in grounded_patterns if p in source.lower() or p in insight_lower)
    groundedness = min(1.0, ground_count * 0.25)
    signals["groundedness"] = round(groundedness, 2)

    # Priority signal
    priority_map = {"critical": 1.0, "high": 0.8, "medium": 0.5, "low": 0.3}
    priority_signal = priority_map.get(entry.get("priority", "medium"), 0.5)
    signals["priority"] = priority_signal

    # Weighted composite (SNARC-inspired weights)
    score = (
        specificity * 0.25
        + novelty * 0.20
        + actionability * 0.20
        + groundedness * 0.25
        + priority_signal * 0.10
    )

    return round(score, 3), signals


def save_entry(entry, knowledge_dir):
    """Save entry to knowledge database with proper indexing.

    Preferred flow (txtai/Mem0 pattern):
    1. Try TCP to running server (immediate index sync)
    2. Fall back to direct KnowledgeDB.add() (new process, writes to file)
    3. Fall back to JSONL-only (searchable after server restart)
    """
    project_path = str(knowledge_dir.parent)

    # Method 1: Try server (best - immediate sync)
    if send_entry_to_server(entry, project_path):
        return True

    # Method 2: Direct KnowledgeDB (writes to file + index)
    try:
        from knowledge_db import KnowledgeDB

        db = KnowledgeDB(project_path)
        db.add(entry)
        debug_log("Entry added via direct KnowledgeDB")
        # Tell running server to reload so it picks up the new entry
        _notify_server_reload(project_path)
        return True
    except ImportError:
        debug_log("KnowledgeDB not available, falling back to JSONL-only")
    except Exception as e:
        debug_log(f"KnowledgeDB.add() failed: {e}, falling back to JSONL-only")

    # Method 3: JSONL-only fallback
    entries_file = knowledge_dir / "entries.jsonl"
    with open(entries_file, "a") as f:
        f.write(json.dumps(entry) + "\n")
    debug_log("Entry appended to JSONL")
    # Tell running server to reload so it indexes the new entry
    _notify_server_reload(project_path)

    return True


def log_to_timeline(content, entry_type, knowledge_dir):
    """Log to timeline for chronological tracking."""
    timeline_file = knowledge_dir / "timeline.txt"
    timestamp = datetime.now().strftime("%m-%d %H:%M")

    # Truncate content for timeline
    short_content = content[:80].replace("\n", " ")
    timeline_entry = f"{timestamp} | {entry_type} | {short_content}"

    with open(timeline_file, "a") as f:
        f.write(timeline_entry + "\n")


def run_schema_validation():
    """Validate all KB entries against V3.3 schema. Soft: warns on stderr, returns count."""
    import re

    schema_path = Path(__file__).parent / "klean-schema.json"
    if not schema_path.exists():
        print(f"[ERROR] Schema not found: {schema_path}", file=sys.stderr)
        return 1

    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    try:
        init_result = get_knowledge_dir()
        kb_path = init_result.path / "entries.jsonl"
    except Exception:
        kb_path = Path("C:/LocalAgent/.knowledge-db/entries.jsonl")

    if not kb_path.exists():
        print(f"[ERROR] KB not found: {kb_path}", file=sys.stderr)
        return 1

    entries = []
    with open(kb_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    required = schema.get("required", [])
    props = schema.get("properties", {})
    id_pattern = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
    valid_enums = {}
    for field, spec in props.items():
        if "enum" in spec:
            valid_enums[field] = set(spec["enum"])

    total = len(entries)
    warnings = []
    entries_with_issues = 0

    for i, entry in enumerate(entries):
        entry_warnings = []
        eid = entry.get("id", f"entry-{i}")

        # Required fields
        for field in required:
            if field not in entry or not entry[field]:
                entry_warnings.append(f"missing required field: {field}")

        # Enum validation
        for field, valid in valid_enums.items():
            val = entry.get(field)
            if val and val not in valid:
                entry_warnings.append(f"{field}='{val}' not in {sorted(valid)}")

        # Title length
        title = entry.get("title", "")
        if title and len(title) > 80:
            entry_warnings.append(f"title too long: {len(title)} chars (max 80)")

        # Insight length
        insight = entry.get("insight", "")
        if insight and len(insight) < 50:
            entry_warnings.append(f"insight too short: {len(insight)} chars (min 50)")

        # ID format in related_to / depends_on
        for field in ("related_to", "depends_on"):
            for rid in entry.get(field) or []:
                if not id_pattern.match(str(rid)):
                    entry_warnings.append(f"{field} contains unsafe ID: '{rid}'")

        # Confidence range
        conf = entry.get("confidence")
        if conf is not None and not (0.0 <= float(conf) <= 1.0):
            entry_warnings.append(f"confidence={conf} out of range [0.0, 1.0]")

        if entry_warnings:
            entries_with_issues += 1
            for w in entry_warnings:
                warnings.append(f"  [{eid}] {w}")

    # JSON output mode (for hook consumption)
    if "--json" in sys.argv:
        result = {
            "total": total,
            "entries_with_issues": entries_with_issues,
            "warning_count": len(warnings),
            "pct_clean": round((total - entries_with_issues) / total * 100, 1) if total > 0 else 100.0,
        }
        print(json.dumps(result))
        return 0

    # Output
    print(f"K-LEAN Schema Validation (V3.3)")
    print(f"Entries scanned: {total}")
    print(f"Entries with issues: {entries_with_issues}/{total} ({entries_with_issues/total*100:.1f}%)")
    print(f"Total warnings: {len(warnings)}")

    if warnings:
        print(f"\nWarnings (soft -- entries were NOT blocked):", file=sys.stderr)
        for w in warnings[:50]:  # Cap at 50 to avoid flooding
            print(w, file=sys.stderr)
        if len(warnings) > 50:
            print(f"  ... and {len(warnings) - 50} more", file=sys.stderr)

    # Write validation log for consumer (Ferengi F-003)
    log_dir = Path(os.environ.get("USERPROFILE", os.path.expanduser("~"))) / ".claude" / "hooks-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "klean-validation.log"
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"# K-LEAN Validation {datetime.now().isoformat()}\n")
        f.write(f"Entries: {total}, Issues: {entries_with_issues}, Warnings: {len(warnings)}\n")
        for w in warnings:
            f.write(w + "\n")

    print(f"\nValidation log: {log_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Capture knowledge to K-LEAN database (V3.2 schema)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "Always validate user input" --type warning --tags security
  %(prog)s "Memory leak in pools" --type finding --priority high
  %(prog)s "Use async/await for I/O" --type pattern --tags python,async
  %(prog)s --json-input '{"title":"...","insight":"...","keywords":[...]}' --json
        """,
    )
    parser.add_argument("content", nargs="?", default="", help="The content to capture")
    parser.add_argument(
        "--type",
        dest="entry_type",
        default="finding",
        choices=["finding", "solution", "pattern", "warning", "decision", "discovery"],
        help="Type of entry (default: finding, auto-inferred if omitted)",
    )
    parser.add_argument("--tags", default="", help="Comma-separated keywords")
    parser.add_argument(
        "--priority",
        default="medium",
        choices=["low", "medium", "high", "critical"],
        help="Priority level (default: medium)",
    )
    parser.add_argument("--url", default="", help="Source URL for the entry")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")
    parser.add_argument(
        "--json-input", dest="json_input", help="Add structured entry from JSON string (V3.2 schema)"
    )
    parser.add_argument(
        "--validate", action="store_true",
        help="Validate all entries in the KB against the V3.3 schema (soft: warns, does not block)"
    )

    args = parser.parse_args()

    # Validate mode: scan all entries against schema
    if args.validate:
        return run_schema_validation()

    # Validate: must have content or json-input
    if not args.content and not args.json_input:
        parser.error("Either content or --json-input is required")

    try:
        init_result = get_knowledge_dir()
        knowledge_dir = init_result.path

        # Silent init - only mention if both new dir AND server started (and not json mode)
        if init_result.newly_created and init_result.server_started and not args.json:
            print("[init: .knowledge-db + server]")

        # Create entry based on input mode
        if args.json_input:
            # Structured JSON input (accepts V2/V3/V3.1, outputs V3.2)
            try:
                data = json.loads(args.json_input)
            except json.JSONDecodeError as e:
                if args.json:
                    print(json.dumps({"error": f"Invalid JSON: {e}"}))
                else:
                    print(f"[ERROR] Invalid JSON input: {e}", file=sys.stderr)
                return 1

            entry = create_entry_from_json(data)
            content_display = entry.get("title", "")[:60]
            entry_type = entry.get("type", "lesson")
        else:
            # Simple content input
            entry = create_entry(
                content=args.content,
                entry_type=args.entry_type,
                tags=args.tags,
                priority=args.priority,
                url=args.url if args.url else None,
            )
            content_display = args.content[:60]
            entry_type = args.entry_type

        # Auto-suggest relationships if none provided (kill condition: >10% by 2026-05-01)
        suggestions = suggest_relationships(entry, knowledge_dir)
        if suggestions:
            entry["related_to"] = [s[0] for s in suggestions]
            if not args.json:
                print(f"  Auto-linked to {len(suggestions)} related entries:", file=sys.stderr)
                for eid, score, title in suggestions:
                    print(f"    -> {eid} ({score:.0%} overlap): {title}", file=sys.stderr)

        # Pre-storage salience scoring (SNARC pattern: filter at capture time)
        salience_score, salience_signals = compute_salience(entry)
        entry["salience_score"] = salience_score
        if salience_score < 0.2:
            if not args.json:
                print(f"  WARNING: Low salience ({salience_score:.2f}) -- this may be noise. Saving anyway.", file=sys.stderr)
                print(f"  Signals: {salience_signals}", file=sys.stderr)
        elif salience_score < 0.3:
            if not args.json:
                print(f"  Note: Moderate salience ({salience_score:.2f}). Consider adding more specifics.", file=sys.stderr)

        # Save to database
        save_entry(entry, knowledge_dir)

        # Log to timeline
        log_to_timeline(entry.get("insight", content_display), entry_type, knowledge_dir)

        # Output based on mode
        if args.json:
            print(
                json.dumps(
                    {
                        "status": "success",
                        "id": entry["id"],
                        "title": entry["title"],
                        "type": entry_type,
                        "related_to": entry.get("related_to", []),
                        "salience": salience_score,
                        "path": str(knowledge_dir / "entries.jsonl"),
                    }
                )
            )
        else:
            print(
                f"[OK] Captured {entry_type}: {content_display}{'...' if len(content_display) >= 60 else ''}"
            )
            print(f"  Saved to: {knowledge_dir}/entries.jsonl")
            if entry.get("keywords"):
                print(f"  Keywords: {', '.join(entry['keywords'])}")

        return 0

    except Exception as e:
        if args.json:
            print(json.dumps({"error": str(e)}))
        else:
            print(f"[ERROR] Error capturing knowledge: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
