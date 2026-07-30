# Metabolic States -- Adaptive Context Management

> "Things are only impossible until they are not."
> -- Captain Jean-Luc Picard

The metabolic state machine adaptively manages what gets loaded into the agent's context based on usage pressure and behavioral patterns. It prevents context bloat during deep work and conserves tokens during emergencies.

## Hull Integrity Tiers

The system uses Star Trek hull integrity theming to track context window usage. "Hull integrity" is the percentage of context remaining; the tiers are measured by percentage **used**.

| Tier | Context Used | Hull Status | Behavior |
|------|-------------|-------------|----------|
| **Green** | 0-39% | Nominal | All context loaded normally |
| **Amber** | 40-54% | Strained | Checkpoint saved, learning capture suggested |
| **Red** | 55-69% | Compromised | Full checkpoint, instruction shedding active, wrap current task |
| **Critical** | 70-79% | Failing | Run `/compact` NOW, 10% buffer before autocompact |
| **Autocompact** | 80%+ | System override | Claude Code fires compaction automatically |

### Tier Crossing Behavior

Warnings only trigger when a threshold is **first crossed** within a session. Rate limits prevent spam:

| Tier | Rate Limit |
|------|-----------|
| Amber | Once per 5 minutes |
| Red | Once per 3 minutes |
| Critical | Once per 2 minutes |

Each tier crossing saves a session checkpoint to `~/.claude/cache/session-checkpoint.json` containing the timestamp, hull percentage, recent files, and current task.

## The Four Metabolic States

Metabolic states layer on top of hull tiers to control context injection behavior:

```
NORMAL --[5 same-intent actions]--> FOCUS --[intent changes or 10min]--> NORMAL
NORMAL --[hull Red + 3 failures]--> CRISIS --[hull drops below Red]--> RECOVERY --[5min]--> NORMAL
FOCUS  --[hull Red + 3 failures]--> CRISIS
```

### NORMAL

The default state. All context injection operates normally:
- `intent-context.js` loads relevant memory topics based on tool usage
- `instinct-injector.js` injects all validated instincts into subagents
- All memory topic files are available for loading

### FOCUS

Activates when 5 consecutive tool actions share the same intent (e.g., 5 consecutive `hook-engineering` actions while editing hook files).

**What changes**:
- `intent-context.js` only injects context that matches the current focus intent
- Non-matching memory topics are suppressed
- Saves hundreds of tokens per tool call during sustained work on a single topic

**Self-healing**: FOCUS times out after 10 minutes. If the intent changes (user switches tasks), it drops back to NORMAL immediately.

**Excluded intents**: Some intents are too broad to trigger FOCUS: `research`, `unknown`, `bash-generic`, `code-generic`, `version-control`, `planning`. Only specific, topic-bearing intents qualify.

### CRISIS

Activates when hull integrity is Red or Critical AND the agent has hit 3+ consecutive tool failures. This combination indicates a spiraling situation.

**What changes**:
- `intent-context.js` stops all context injection (no memory topics loaded)
- `instinct-injector.js` stops all instinct injection into subagents
- The agent operates with minimal context to maximize available tokens for problem-solving

**Exit condition**: Hull integrity drops below Red (typically after a `/compact` operation).

### RECOVERY

Activates after CRISIS when hull drops below Red. Provides a grace period before returning to full context loading.

**What changes**:
- Context injection gradually resumes
- Instruction priority tiers restore in stages (Tier 0+1 immediately, Tier 2 after 5 minutes)
- MEMORY.md auto-restores from shed context if it was trimmed during the crisis

**Duration**: 5 minutes, then transitions to NORMAL.

## Instruction Shedding

At Red and Critical hull tiers, the instruction-surface-measurer applies dynamic shedding based on priority tiers:

| Tier | Contents | When shed |
|------|----------|-----------|
| **Tier 0** | IDENTITY.md, global CLAUDE.md, non-scoped rules | Never |
| **Tier 1** | Project CLAUDE.md, CLAUDE.local.md, MEMORY.md | Critical tier |
| **Tier 2** | Path-scoped rules, memory topic files | Red tier |

When MEMORY.md is shed, its original content is backed up to `~/.claude/cache/shed-context.json`. On the next fresh session (when hull is below Red), the measurer auto-restores the original MEMORY.md.

## Session Checkpoints

At Amber, Red, and Critical tiers, the monitor writes a checkpoint:

```json
{
  "schema_version": 2,
  "timestamp": "2026-03-01T14:30:00.000Z",
  "sessionId": "abc123",
  "usedPct": 58,
  "hullIntegrity": "Red",
  "currentTask": "Implementing fragility system",
  "recentFiles": ["hooks/fragility-hook.js", "hooks/lib/fragility-scoring.js"],
  "projectPath": "/path/to/project"
}
```

At Red and Critical tiers, the monitor can optionally invoke a pre-compact retention step to preserve active task state and context in preparation for potential compaction. This hook is not included in the repository; implement your own if needed.

## Implementation Details

The metabolic state is computed by `context-threshold-monitor.js` (PostToolUse hook) and stored at `~/.claude/cache/metabolic-state.json`:

```json
{
  "state": "FOCUS",
  "enteredAt": 1709300000000,
  "focusIntent": "hook-engineering",
  "sessionId": "abc123",
  "transitions": [
    { "from": "NORMAL", "to": "FOCUS", "at": 1709300000000 }
  ]
}
```

The state file includes a transition log (last 10 transitions) for debugging.

**Session binding**: If the session ID changes (new session), the metabolic state resets to NORMAL. This prevents stale CRISIS states from persisting across sessions.

## Active Task Awareness

At Red and Critical tiers, the monitor attempts to display active task information in the warning message. It checks two sources:

1. `~/.claude/cache/task-snapshot.json` -- team task state (< 30 min old)
2. `~/.claude/cache/session-checkpoint.json` -- session-level current task

This ensures the user sees what is at risk before compaction.

## Related Documentation

- [Architecture](architecture.md) -- where metabolic states fit in the system
- [Hook Lifecycle](hook-lifecycle.md) -- which hooks read and write metabolic state
- [Intent Classification](intent-classification.md) -- how FOCUS mode determines the active intent
