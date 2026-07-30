# Hook Event Flow

> "The first duty of every Starfleet officer is to the truth."
> -- Captain Jean-Luc Picard

Hooks are event-driven scripts that fire automatically during the agent's lifecycle. They extend the agent's behavior without modifying its core instructions.

## Hook Events

Claude Code supports five hook events:

| Event | When it fires | Typical budget |
|-------|--------------|----------------|
| **SessionStart** | Once when a session begins | <700ms combined |
| **PreToolUse** | Before each tool invocation | <50ms per hook |
| **PostToolUse** | After each tool invocation completes | <50ms per hook |
| **SubagentStart** | When the agent spawns a subagent | <50ms per hook |
| **Stop** | When the session ends | <1000ms |

## Hooks by Event

### SessionStart

Fires once at the start of every session. Used for initialization and cache building.

| Hook | Purpose | Output |
|------|---------|--------|
| `instruction-surface-measurer.js` | Counts instruction lines, generates priority tiers, checks hook health | JSON with `result: "continue"` and budget report |
| `instinct-decay.js` | Computes effective confidence for all instinct files using time-based decay | Advisory noting how many instincts are decayed |
| `fragility-cache-builder.js` | Pre-computes fragility scores for all tracked files using git history | Cache file at `~/.claude/cache/fragility-scores.json` |

**Constraints**: No network calls. Filesystem and git operations only. The fragility cache builder is the most expensive (~600ms) because it queries git history for every tracked file.

### PreToolUse

Fires before Edit, Write, Bash, Read, Glob, Grep, and other tools. Used for context injection and risk assessment.

| Hook | Fires on | Purpose | Output |
|------|----------|---------|--------|
| `intent-context.js` | Edit, Write, Bash | Classifies intent, loads relevant memory topic file | `additionalContext` with topic content |
| `fragility-hook.js` | Edit, Write | Looks up file fragility score, warns on risky files | `additionalContext` with fragility advisory |
| `annotation-injector.js` | `mcp__context7__query-docs` | Injects per-library gotchas alongside Context7 documentation | `additionalContext` with annotation content |

**Constraints**: Must complete in <50ms. Pure filesystem (no git calls on the hot path -- the fragility hook uses a pre-built cache). Intent context and annotation injector are suppressed during CRISIS metabolic state. Fragility hook is protected by a circuit breaker. Annotation injector is rate-limited to 5 injections per session and deduped per library within 60-minute TTL.

### PostToolUse

Fires after every tool invocation completes. Used for logging and monitoring.

| Hook | Purpose | Output |
|------|---------|--------|
| `action-logger.js` | Records action to 50-entry circular buffer, tracks instinct outcomes | Writes to `~/.claude/cache/recent-actions.jsonl` |
| `context-threshold-monitor.js` | Tracks hull integrity (context usage %), computes metabolic state, triggers tier warnings | Console warnings at Amber/Red/Critical thresholds |

**Constraints**: Must complete in <50ms. The context monitor reads `remaining_percentage` from the hook input's `context_window` field. Both hooks classify intent inline to avoid race conditions with each other.

### SubagentStart

Fires when the agent spawns a subagent via the Task tool.

| Hook | Purpose | Output |
|------|---------|--------|
| `instinct-injector.js` | Reads validated instinct files, injects them as additional context for the subagent | `additionalContext` with instinct text |

**Constraints**: <50ms. Suppressed during CRISIS metabolic state. Validates instinct content against prompt injection patterns. Caps total injection at 16KB.

### Stop

Fires when the session ends.

No Stop hooks ship with this repository. The event is available for custom implementations such as capturing corrections, saving session state, or flushing learning queues.

## How Hooks Communicate

Hooks communicate through two mechanisms:

### 1. Stdout JSON

Hooks write JSON to stdout to inject information into the agent's context:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "File fragility: 0.65 (moderate). Top signal: churn."
  }
}
```

The `additionalContext` string is added to the agent's context for the current tool invocation.

For SessionStart hooks, the output format uses `result` and `reason`:

```json
{
  "result": "continue",
  "reason": "Instruction surface: 126 always-on lines (budget: 150). Status: OK."
}
```

### 2. Cache Files

Hooks share state through JSON files in `~/.claude/cache/`:

| File | Written by | Read by |
|------|-----------|---------|
| `recent-actions.jsonl` | action-logger | context-threshold-monitor (metabolic state) |
| `metabolic-state.json` | context-threshold-monitor | intent-context, instinct-injector |
| `fragility-scores.json` | fragility-cache-builder | fragility-hook |
| `instinct-effective-scores.json` | instinct-decay | instinct-injector |
| `session-checkpoint.json` | context-threshold-monitor | instruction-surface-measurer |
| `hook-circuit-breaker.json` | circuit-breaker (lib) | all hooks that use circuit-breaker |
| `annotation-rate.json` | annotation-injector | annotation-injector (rate limit: max 5/session) |
| `intent-context-dedup.json` | intent-context, annotation-injector | intent-context, annotation-injector (dedup with `annotation:` namespace) |

All cache writes use the **atomic write pattern**: write to a `.tmp` file, then rename to the final path. This prevents corrupt reads if the process is interrupted.

## Exit Code Requirements

**All hooks must exit with code 0, regardless of errors.**

A non-zero exit code crashes the hook pipeline and blocks the agent. Every hook wraps its logic in try/catch and calls `process.exit(0)` at the end.

```javascript
function main() {
  try {
    // Hook logic here
  } catch (e) {
    // Log error if needed, but never throw
  }
  process.exit(0);
}
```

## Circuit Breaker

The shared circuit breaker (`~/.claude/hooks/lib/circuit-breaker.js`) protects hooks from cascading failures:

- After **3 consecutive failures**, a hook is disabled (circuit open)
- After **30 minutes**, the circuit resets and the hook is retried
- On success, the failure counter resets to 0

Usage in hooks:

```javascript
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');

if (!shouldRun('my-hook-name')) process.exit(0);

try {
  // ... hook logic ...
  recordSuccess('my-hook-name');
} catch (e) {
  recordFailure('my-hook-name');
}
process.exit(0);
```

## Performance Budget

| Event | Hooks | Combined overhead |
|-------|-------|-------------------|
| SessionStart | measurer + fragility-cache + instinct-decay | ~700ms (once per session) |
| PreToolUse | intent-context + fragility-hook + annotation-injector | ~18ms |
| PostToolUse | action-logger + context-monitor | ~20ms |
| SubagentStart | instinct-injector | ~5ms |

The per-action overhead (PreToolUse + PostToolUse) is ~38ms total -- imperceptible to the user. The annotation injector adds ~3ms but only fires on `mcp__context7__query-docs` calls (infrequent).

## Related Documentation

- [Architecture](architecture.md) -- system overview
- [Fragility System](fragility-system.md) -- how fragility-hook and fragility-scoring work
- [Intent Classification](intent-classification.md) -- how intent-context routes memory
- [Instinct System](instinct-system.md) -- how instinct-injector and instinct-decay interact
- [Annotation System](annotation-system.md) -- how annotation-injector auto-injects library gotchas
- [Metabolic States](metabolic-states.md) -- how context-threshold-monitor drives state transitions
