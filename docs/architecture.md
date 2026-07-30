# System Architecture

> "Let us make sure history never forgets the name Enterprise."
> -- Captain Jean-Luc Picard

This document describes how Starfleet Claude Code's components interact: skills, hooks, instincts, rules, and the identity manifest that binds them together.

## Component Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| Identity Manifest | `~/.claude/IDENTITY.md` | Load order, priority rules, behavioral constants |
| Global Instructions | `~/.claude/CLAUDE.md` | Default workflow, quality gates, task management |
| Rules | `~/.claude/rules/*.md` | Always-on or path-scoped behavioral constraints |
| Skills | `~/.claude/skills/{name}/SKILL.md` | On-demand capabilities invoked via slash commands |
| Hooks | `~/.claude/hooks/*.js` | Event-driven scripts that fire on agent lifecycle events |
| Instincts | `~/.claude/instincts/*.md` | Confidence-scored behavioral patterns, injected into subagents |
| Memory | `MEMORY.md` + topic files | Cross-session knowledge, loaded on demand by intent |
| Annotations | `~/.claude/annotations/*.md` | Per-library gotchas, auto-injected with Context7 doc fetches |
| Friction Log | `~/.claude/cache/friction-log.jsonl` | Auto-detected friction patterns, used in context bundle assembly |
| Shared Libraries | `~/.claude/hooks/lib/*.js` | Reusable modules: circuit-breaker, intent-classifier, fragility-scoring, redact-secrets |

## Load Order and Priority

The Identity Manifest (`IDENTITY.md`) defines the exact loading sequence. Lower numbers load first; higher numbers override on conflict:

```
1. IDENTITY.md          -- behavioral constants (never shed)
2. ~/.claude/CLAUDE.md   -- global defaults
3. ~/.claude/rules/*.md  -- global rules (always-on + path-scoped)
4. {project}/CLAUDE.md   -- project instructions
5. {project}/CLAUDE.local.md -- local overrides (gitignored)
6. ~/.claude/instincts/*.md  -- confidence-scored patterns (subagents only)
7. MEMORY.md             -- auto-memory index
8. Topic files           -- on-demand via intent routing
```

**Priority resolution**: Project overrides global. Local overrides project. Instincts are sorted by effective confidence (highest first). Path-scoped rules only fire when the active file path matches.

## Data Flow

```
                    SESSION START
                         |
            +------------+------------+
            |            |            |
     instinct-decay  measurer   fragility-cache
     (compute conf)  (count      (score files
      for instincts)  instruction  via git history)
                      surface)
                         |
                    AGENT ACTIVE
                         |
            +------------+------------+
            |                         |
       PreToolUse                PostToolUse
            |                         |
    +-------+-------+--------+  +-------+-------+
    |               |        |  |               |
 intent-context  fragility  annotation  action-logger  context-monitor
 (load relevant  (assess    -injector   (record to     (track hull
  memory topic)  file risk) (inject     circular       integrity,
                             library    buffer)        metabolic state)
                             gotchas)
            |
       SubagentStart
            |
    instinct-injector
    (inject behavioral
     patterns into
     spawned agents)
```

## Event Lifecycle

1. **SessionStart**: Three hooks fire to initialize caches.
   - `instinct-decay.js` computes effective confidence for all instinct files
   - `instruction-surface-measurer.js` counts instruction lines, checks hook health, generates priority tiers
   - `fragility-cache-builder.js` pre-computes per-file fragility scores using git history

2. **PreToolUse**: Before each tool invocation (Edit, Write, Bash, etc.)
   - `intent-context.js` classifies the agent's intent and loads the relevant memory topic
   - `fragility-hook.js` checks the fragility score for the target file and emits warnings for Station 1+ files
   - `annotation-injector.js` injects per-library gotchas when Context7 fetches documentation (fires on `mcp__context7__query-docs`)

3. **PostToolUse**: After each tool invocation completes
   - `action-logger.js` records the action to a 50-entry circular buffer (JSONL), detects friction patterns (consecutive failures, edit churn, tool oscillation) and logs them to `friction-log.jsonl`
   - `context-threshold-monitor.js` checks hull integrity (context usage %), computes metabolic state, triggers warnings
   - `auto-fix-diagnostics.js` runs lightweight quality checks (JSON validation, Python syntax via py_compile + ruff) with circuit breaker protection and dedup cache

4. **SubagentStart**: When the agent spawns a subagent (via Task tool)
   - `instinct-injector.js` reads instinct files, validates them, and injects them as additional context

5. **Stop**: When the session ends
   - `captain-log.js` generates a HANDOFF.md with session summary, completed actions, active tasks, and recommended next steps

## How Skills Interact with Hooks

Skills are invoked explicitly by the user (e.g., `/klingon-review`). Hooks fire automatically on lifecycle events. Skills often spawn subagents, which triggers the SubagentStart hooks:

```
User invokes /fleet-command standard "topic"
  |
  +--> fleet-command SKILL.md orchestrates (6 factions available)
         |
         +--> Spawns /klingon-review subagent
         |      +--> SubagentStart: instinct-injector fires
         |      +--> Warriors use tools: PreToolUse/PostToolUse hooks fire
         |
         +--> Spawns /ferengi-audit subagent
         |      +--> SubagentStart: instinct-injector fires
         |      +--> Merchants use tools: hooks fire
         |
         +--> Spawns /bridge-briefing subagent
         |      +--> (same pattern)
         |
         +--> Spawns /holodeck subagent (full mode / --holodeck mode)
                +--> Expert persona(s) loaded from experts/{slug}.md
                +--> Context bundle includes friction from friction-log.jsonl
```

## Behavioral Constants

These invariants are defined in `IDENTITY.md` and enforced across all hooks:

- **Always exit 0** from hooks (a non-zero exit crashes the hook pipeline)
- **Atomic writes**: temp file + rename (never partial writes that could corrupt state)
- **Circuit breaker**: 3 consecutive failures = hook disabled for 30 minutes, then auto-retried
- **50ms budget** for PreToolUse hooks, filesystem operations only
- **32KB cap** on any single cache file write
- **No network calls** in SessionStart hooks

## Related Documentation

- [Hook Lifecycle](hook-lifecycle.md) -- detailed hook event flow
- [Quality Gates](quality-gates.md) -- the 8-level review ladder
- [Metabolic States](metabolic-states.md) -- adaptive context management
- [Fragility System](fragility-system.md) -- per-file risk scoring
- [Instinct System](instinct-system.md) -- self-calibrating behaviors
- [Intent Classification](intent-classification.md) -- context routing
- [Annotation System](annotation-system.md) -- per-library gotcha injection
- [Persona Guide](persona-guide.md) -- how to create faction and expert personas
