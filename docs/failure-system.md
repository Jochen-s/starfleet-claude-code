# Failure & Recovery System -- Learning From What Goes Wrong

> "Logic is the beginning of wisdom, not the end."
> -- Spock, *Star Trek VI: The Undiscovered Country*

The failure and recovery system does more than log errors. It classifies failures by type, generates structured reflections on root causes, aggregates patterns across sessions, routes the agent toward the right recovery strategy, and archives clean successes for contrast. Five components work in concert: a loop detector that maintains a sliding window of tool activity, a reflection generator that fires when repeated failures are confirmed, a pattern aggregator that surfaces systemic issues from historical data, a recovery router that escalates suggestions with each failure, and a success trace logger that captures what worked.

---

## 1. The Problem

Default agent behavior on failure: retry the exact same action, or give up. Neither is useful. The agent does not know *why* it failed, so it cannot choose the right recovery strategy.

`old_string not found in file` needs a different response than `ENOENT: no such file or directory`, which needs a different response than `Permission denied`. A generic "try again" loop just burns context and session budget.

The system solves this by:

1. Detecting that a failure is repeating (not just a single transient error)
2. Classifying the failure by type using pattern matching
3. Generating a specific hypothesis and avoidance strategy
4. Persisting that reflection so the agent can consult it before retrying
5. Aggregating reflections across sessions to identify platform-level issues

---

## 2. Component Map

```
Tool fails
    |
    v
loop-detector.js  (PostToolUse, all tools)
  - Maintains 10-entry sliding window
  - Tracks: repeated edits, repeated bash failures, repeated error sigs
  - Signals 3+ occurrences as a loop pattern
    |
    v
failure-recovery.js  (PostToolUseFailure, NEVER_GATE)
  - Tracks consecutive failures in failure-state.json
  - Writes per-failure dump to ~/.claude/cache/failures/
  - At 3+: surface /kln:rethink suggestion
  - At 5+: surface /relief-on-station suggestion
    |
    v
failure-reflection.js  (PostToolUseFailure, QUALITY)
  - Reads loop-detector-state.json to confirm 3+ pattern
  - Rate-limits: 1 per 5 min, max 5 per session
  - Classifies failure, generates hypothesis + avoidance
  - Appends to ~/.claude/cache/failure-reflections.jsonl
    |
    v
lib/failure-pattern-aggregator.js  (library, called on demand)
  - Reads all failure-reflections.jsonl entries
  - Groups by normalized error signature
  - Surfaces patterns with 3+ occurrences
    |
    v
instinct-decay.js  (SessionStart)
  - Loads aggregated patterns via getTopPatterns()
  - Injects top patterns into session start context
    |
    v
failure-reflection instinct  (SubagentStart, via instinct-injector)
  - Injected into subagents
  - Instructs: "Check failure-reflections.jsonl before retrying"
```

---

## 3. Loop Detector

**File**: `hooks/loop-detector.js`
**Event**: PostToolUse (matcher: `Bash|Edit|Write`)
**State**: `~/.claude/cache/loop-detector-state.json`

The loop detector runs on every tool action and maintains a sliding window of the last 10 operations. It fires an alert at most once every 3 minutes, with a session cap of 3 alerts.

### Four Detection Signals

**Signal 1 -- Repeated edit**: The same file appears in 3+ Edit or Write calls within the window.

**Signal 2 -- Repeated bash failure**: The same normalized command (timestamps and temp paths stripped) fails 3+ times.

**Signal 3 -- Repeated error signature**: The same error pattern (matched from tool output via regex) appears 3+ times.

**Signal 4 -- Consecutive identical calls**: The same tool with the same normalized input runs 3+ times consecutively. This catches doom-loops on passing tools too (e.g., reading the same file over and over).

### Window Entry Schema

```json
{
  "tool": "Edit",
  "time": 1712220000000,
  "file": "/path/to/file.ts",
  "errorSig": "old_string not found in file: /path/to/file.ts",
  "toolSig": "{\"file_path\":\"/path/to/file.ts\",\"old_string\":\"...",
  "failed": false
}
```

The `toolSig` field is capped at 120 characters to prevent file content from leaking into the state cache.

### Window State

```json
{
  "window": [],
  "lastAlertTime": 0,
  "alertCount": 0,
  "sessionId": "abc123"
}
```

State resets on session change.

---

## 4. Failure Recovery Router

**File**: `hooks/failure-recovery.js`
**Event**: PostToolUseFailure (matcher: `.*`, NEVER_GATE class -- always runs)
**State**: `~/.claude/cache/failure-state.json`
**Dumps**: `~/.claude/cache/failures/<timestamp>-<tool>.json`

This hook fires on every tool failure without exception (the NEVER_GATE class means it is not suppressed in quick mode). It tracks a simple consecutive-failure counter per session and escalates suggestions at two thresholds.

### Escalation Levels

| Failures | Action |
|----------|--------|
| 1-2 | Silent -- normal retry is appropriate |
| 3+ | Output: "Consider running /kln:rethink for a fresh debugging perspective." |
| 5+ | Output: "Recommended: /kln:rethink or /relief-on-station if context is exhausted." |

The suggestion is returned via `hookSpecificOutput.additionalContext`, which Claude Code surfaces as context on the next turn.

### Failure State Schema

```json
{
  "sessionId": "abc123",
  "failures": 4,
  "tools": ["Edit", "Edit", "Bash", "Edit"]
}
```

State resets on session change. The `tools` array is capped at the last 10 entries.

### Failure Dumps

Each failure writes a small metadata-only dump to `~/.claude/cache/failures/`:

```json
{
  "timestamp": "2026-04-04T10:30:00.000Z",
  "sessionId": "abc123",
  "toolName": "Edit",
  "errorType": "ENOENT",
  "errorSummary": "ENOENT: no such file or directory, open '/path/to/file.ts'",
  "consecutiveFailures": 3,
  "recentTools": ["Bash", "Edit", "Edit"]
}
```

The `errorSummary` is capped at 120 characters and run through `redact-secrets` before writing. No full tool payloads are stored.

**Rotation**: Dumps older than 30 days are deleted at session start. If the directory exceeds 10 MB, oldest files are deleted until under 7 MB.

---

## 5. Failure Reflection Generator

**File**: `hooks/failure-reflection.js`
**Event**: PostToolUseFailure (matcher: `.*`, QUALITY class -- gated in quick mode)
**Reads**: `~/.claude/cache/loop-detector-state.json`
**Writes**: `~/.claude/cache/failure-reflections.jsonl`
**Rate limit**: 1 reflection per 5 minutes; max 5 per session
**File rotation**: When `failure-reflections.jsonl` exceeds 256 KB, the oldest half of lines is discarded

### Trigger Condition

The reflection hook does not fire on every failure. It checks the loop-detector sliding window first. A reflection is only generated if:

- The same tool has failed 3+ times in the current window, **or**
- The same error signature appears 3+ times in the current window

This means the first and second failures of a pattern produce no reflection. The reflection fires on the third confirmed repetition. This prevents noise from transient one-off errors.

### Heuristic Reflection Generation

No LLM call is made. The hook uses a switch/case on `toolName` and keyword matching on `errorSignature` to generate structured hypothesis and avoidance text. This completes in under 5 ms.

### Tool-specific Logic

**Edit / Write**:
- `old_string not found` or `no match` -- hypothesis: file changed since last read; avoidance: re-read immediately before editing
- `ENOENT` / `no such file` -- hypothesis: file or parent directory does not exist
- `permission` / `EACCES` -- hypothesis: write permissions insufficient

**Bash**:
- `command not found` -- hypothesis: binary not on PATH
- `permission denied` -- hypothesis: script lacks execute permission
- `syntax error` -- hypothesis: shell syntax issue (check for Windows line endings)
- Other -- extracts exit code from error text if visible

**Read**:
- `ENOENT` -- use Glob to verify path before reading
- `permission` -- file exists but not readable

**Grep**: escaping of regex metacharacters

**Glob**: malformed pattern or nonexistent base directory

**Agent**: permission boundary (subagent-tool-guard) or context limit

### Reflection Entry Schema

```json
{
  "timestamp": "2026-04-04T10:30:00.000Z",
  "tool_name": "Edit",
  "error_signature": "old_string not found in file: /path/to/file.ts",
  "context": "Editing file.ts",
  "hypothesis": "Edit old_string did not match file content; file may have changed since last read.",
  "avoidance": "Read the file immediately before editing. Do not rely on stale in-context content."
}
```

Note: the schema uses `hypothesis` and `avoidance` fields. The `context` field describes what was being attempted (e.g., "Editing file.ts", "Running: npm test").

### Consulting Reflections Before Retrying

The `failure-reflection` instinct (confidence 0.80) is injected into subagents via the SubagentStart hook. Its instruction is:

> Before retrying a failed operation, check `~/.claude/cache/failure-reflections.jsonl` for matching error signatures. If a reflection exists for the same tool and similar error, apply the avoidance strategy instead of retrying blindly.

The lookup pattern is: read the file, find entries where `tool_name` matches and `error_signature` is similar, apply the `avoidance` field.

The instinct is backed by the Reflexion paper (Shinn et al., 2023), which showed 88% vs 67% pass rates on HumanEval when agents reflect on failures before retrying.

---

## 6. Cross-Session Pattern Aggregation

**File**: `hooks/lib/failure-pattern-aggregator.js`
**Type**: Library (called by instinct-decay.js at SessionStart)
**Reads**: `~/.claude/cache/failure-reflections.jsonl`
**File size limit**: 512 KB (returns empty set if exceeded)

### How It Works

1. Loads all reflection entries from `failure-reflections.jsonl`
2. Normalizes each `error_signature` (lowercase, collapsed whitespace)
3. Classifies each entry into a pattern type
4. Groups entries by `type:normalizedSignature` key
5. Discards buckets with fewer than 3 occurrences
6. Returns a `Map<key, PatternEntry>`

### Pattern Types (v8.2: 13 types in 2 tiers)

Tier 1 (operational, checked first):

| Type | Detection |
|------|-----------|
| `permission-blocked` | "permission denied", "access denied", "blocked by policy", EACCES, EPERM |
| `file-not-found` | "enoent", "no such file", "file not found" |
| `timeout` | "timeout", "etimedout" |
| `encoding-error` | "encoding", "decode", "charmap" |

Tier 2 (strategic, MCASP extension):

| Type | Detection |
|------|-----------|
| `context-overload` | "context window", "token limit", "output truncated" |
| `external-dependency` | ECONNREFUSED, ECONNRESET, 503, 502, 504, 429, "service unavailable", "rate limit" |
| `bad-decomposition` | "too many sub-tasks", "circular dependency", "max depth exceeded" |
| `missing-skill` | "skill not found", "no matching skill" |
| `missing-memory` | "no relevant entries", "memory retrieval returned 0" |
| `missing-eval` | "no eval coverage", "untested path" |
| `bad-requirements` | "ambiguous requirement", "contradictory spec" |
| `unsafe-autonomy` | "requires approval", "station violation", "budget exceeded" |

Fallback types:

| Type | Detection |
|------|-----------|
| `repeated-tool-failure` | same `tool_name` fails 3+ times with no more specific match |
| `generic` | everything else |

Classification is checked in tier order. Tier 1 always beats Tier 2: "504 Gateway Timeout" matches `timeout` (Tier 1), not `external-dependency` (Tier 2). This is correct: tier ordering means the most operationally specific match wins. `permission-blocked` is checked before `file-not-found` to prevent "permission denied: no such file" from misclassifying. `file-not-found` was narrowed (v8.2) to avoid catching "skill not found" before the Tier 2 `missing-skill` type.

If a tool's total failure count across all entries reaches 3+, generic entries for that tool are promoted to `repeated-tool-failure`.

### PatternEntry Shape

```json
{
  "type": "file-not-found",
  "count": 5,
  "lastSeen": "2026-04-04T10:30:00.000Z",
  "suggestedFix": "Use Glob to verify the file exists before reading. Check path separators.",
  "representative": { ...the most recent matching reflection entry... }
}
```

### Usage in SessionStart

`instinct-decay.js` calls `getTopPatterns(3)` during SessionStart to surface the top 3 patterns sorted by count (descending), then recency. These are injected into session context so the agent is aware of recurring issues before it starts work.

This is how individual incidents become systemic knowledge. If `encoding-error: cp1252` appears in 5 different sessions, it stops being a one-off and becomes a platform-level issue deserving an explicit instinct or CLAUDE.md entry.

---

## 7. Success Trace Archival

**File**: `hooks/success-trace-logger.js` (in `~/.claude/hooks/`)
**Event**: Stop (matcher: `.*`)
**Output**: `~/.claude/cache/success-traces.jsonl`
**Rotation**: Rotates at 100 entries, keeping newest 75

The inverse of failure tracking. At session end, if the session had no user corrections and at least 3 tool actions, a trace is archived.

### Correction Check

`correction-capture.js` writes entries to `~/.claude/cache/learnings-queue.json` when the user corrects the agent. The success trace logger reads this file (up to 512 KB) and skips tracing if any entry matches the current session ID with `type: "correction"`. This ensures only genuinely successful sessions are captured.

### Trace Entry Schema

```json
{
  "timestamp": "2026-04-04T11:00:00.000Z",
  "session_id": "abc123",
  "tool_sequence": ["Read", "Read", "Edit", "Edit", "Bash"],
  "tool_counts": { "Read": 2, "Edit": 2, "Bash": 1 },
  "files_modified": ["users.ts", "config.ts"],
  "tasks_completed": 2,
  "hull_at_end": "Green",
  "duration_actions": 5
}
```

`hull_at_end` comes from `~/.claude/cache/session-checkpoint.json` -- it records the hull integrity tier (Green, Amber, Red, Critical) at the time the session ended.

### Purpose

Over time, the success trace archive builds a dataset of what tool sequences lead to successful outcomes for what types of tasks. Specifically: which sequences produce task completions without corrections, and at what hull integrity. This is the foundation for future routing optimization -- if sessions that start with Read-heavy sequences consistently end at Green hull, that is a signal worth acting on.

---

## 8. Fatigue Signals in Hull Integrity Warnings

**File**: `hooks/context-threshold-monitor.js`
**Event**: PostToolUse

The context threshold monitor already reports hull integrity tiers (Green, Amber, Red, Critical) based on context window usage percentage. It also computes a metabolic state (NORMAL, FOCUS, CRISIS, RECOVERY) from action patterns and failure counts.

The CRISIS transition condition is directly tied to the failure system:

```
NORMAL -> CRISIS: hull is Red or Critical AND failure-state.json shows 3+ failures
CRISIS -> RECOVERY: hull drops below Red (typically after /compact)
```

This means a high context window plus repeated failures produces a CRISIS state, which surfaces in the hull integrity warning and signals to the agent that context exhaustion and tool failure are compounding.

---

## 9. Configuration

### Hook Registration (global `~/.claude/settings.json`)

| Hook | Event | Matcher | Class |
|------|-------|---------|-------|
| `failure-recovery.js` | PostToolUseFailure | `.*` | NEVER_GATE |
| `failure-reflection.js` | PostToolUseFailure | `.*` | QUALITY |
| `success-trace-logger.js` | Stop | `.*` | QUALITY |
| `loop-detector.js` | PostToolUse | `Bash\|Edit\|Write` | standard |

NEVER_GATE hooks run in all modes including quick mode. QUALITY hooks are suppressed in quick mode (controlled by `hooks/lib/hook-gate.js`).

Note: `failure-recovery.js` and `failure-reflection.js` are registered in the global `~/.claude/settings.json`, not in the project-level `.claude/settings.json`. The project settings only register `loop-detector.js` under PostToolUse.

### Tunable Constants

All rate limits and thresholds are hard-coded in the hook source files:

| Constant | Location | Value | Description |
|----------|----------|-------|-------------|
| `RETHINK_THRESHOLD` | `failure-recovery.js` | 3 | Failures before /kln:rethink suggestion |
| `RELIEF_THRESHOLD` | `failure-recovery.js` | 5 | Failures before /relief-on-station suggestion |
| `LOOP_REPEAT_THRESHOLD` | `failure-reflection.js` | 3 | Loop-detector window count to trigger reflection |
| `RATE_LIMIT_MS` | `failure-reflection.js` | 300000 (5 min) | Minimum time between reflections |
| `MAX_PER_SESSION` | `failure-reflection.js` | 5 | Session cap for reflection count |
| `ROTATION_SIZE` | `failure-reflection.js` | 262144 (256 KB) | Reflections file rotation threshold |
| `PATTERN_THRESHOLD` | `failure-pattern-aggregator.js` | 3 | Occurrences to surface a systemic pattern |
| `MAX_TRACES` | `success-trace-logger.js` | 100 | Success trace rotation threshold |
| `KEEP_TRACES` | `success-trace-logger.js` | 75 | Entries retained after rotation |
| `ROTATION_MAX_AGE_MS` | `failure-recovery.js` | 30 days | Age limit for failure dump files |
| `ROTATION_SIZE_HARD_CAP` | `failure-recovery.js` | 10 MB | Hard cap for failures/ directory |

To adjust any of these, edit the constant directly in the hook source file. There is no external configuration file for these values.

### Cache File Inventory

| File | Written by | Read by |
|------|-----------|---------|
| `~/.claude/cache/failure-state.json` | failure-recovery.js | failure-recovery.js, context-threshold-monitor.js |
| `~/.claude/cache/failures/*.json` | failure-recovery.js | manual inspection |
| `~/.claude/cache/failure-reflections.jsonl` | failure-reflection.js | failure-reflection instinct, failure-pattern-aggregator.js |
| `~/.claude/cache/failure-reflection-rate.json` | failure-reflection.js | failure-reflection.js |
| `~/.claude/cache/loop-detector-state.json` | loop-detector.js | failure-reflection.js |
| `~/.claude/cache/success-traces.jsonl` | success-trace-logger.js | manual inspection |

---

## 10. Related Documentation

- [Architecture](architecture.md) -- where the failure system fits in the overall hook stack
- [Hook Lifecycle](hook-lifecycle.md) -- PostToolUseFailure and Stop event flow
- [Instinct System](instinct-system.md) -- how failure-reflection instinct is injected into subagents
- [Metabolic States](metabolic-states.md) -- CRISIS state and its connection to failure counts
- [Quality Gates](quality-gates.md) -- NEVER_GATE and QUALITY hook classes
