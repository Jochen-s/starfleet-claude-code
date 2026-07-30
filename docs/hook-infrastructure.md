# Hook Infrastructure: Taxonomy, Gating, and Budget Coordination

> "Things are only impossible until they're not."
> -- Captain Jean-Luc Picard

## Summary

This repo ships 32 core hooks. The full taxonomy (`hooks/lib/hook-taxonomy.json`) classifies 65 hooks across a complete installation including companion projects (K-LEAN knowledge capture, voice, GSD project management). Without classification, every hook fires on every action regardless of task complexity: a variable rename pays the same overhead as a security audit. The taxonomy system classifies hooks into five classes (NEVER_GATE, QUALITY, OBSERVABILITY, INFRASTRUCTURE, KLEAN), and effort-based gating controls which classes fire. Three effort profiles (quick, standard, thorough) select the appropriate class subset. A shared injection budget prevents context flooding when multiple hooks inject context in the same turn.

---

## 1. The Problem: Undifferentiated Overhead

At 20+ hooks, overhead becomes noticeable. Two hooks fire on every PreToolUse event. In a full installation with 65 hooks across all events, a naively wired session runs hooks that have no bearing on the current task.

Two problems compound this:

**Safety vs. enhancement confusion.** `protect-secrets` must always fire; skipping it is a security violation. `execution-ratio-monitor` improves output quality over time but has zero impact on the current task. Without classification, there is no principled way to skip the latter without also risking the former.

**Injection flooding.** Multiple hooks inject context into the agent's attention window: `auto-recall` injects K-LEAN entries, `intent-context` injects memory topic files, `annotation-injector` injects library gotchas, `post-compact-enrichment` injects post-compact recovery hints. Without coordination, they compete for the same finite attention window and can collectively inject more context than the signal is worth.

The taxonomy and budget coordination solve both problems.

---

## 2. Hook Taxonomy: Five Classes

The taxonomy is defined in `hooks/lib/hook-taxonomy.json`. Every hook has a `class` field. The gating system uses this field to decide whether the hook runs under a given effort profile.

### NEVER_GATE (12 hooks)

Safety-critical hooks. Fire regardless of effort profile. Cannot be suppressed by gating.

| Hook | Event | Reason |
|------|-------|--------|
| `protect-secrets` | PreToolUse | Blocks access to SSH keys, .env files, AWS credentials |
| `subagent-tool-guard` | PreToolUse | Enforces per-agent tool allowlists |
| `fragility-hook` | PreToolUse | Risk assessment, Station escalation |
| `containment-field` | PreToolUse | Advisory warning for out-of-scope edits |
| `codex-mcp-guard` | PreToolUse | Cross-model MCP security |
| `instinct-injector` | SubagentStart | Security-hardened instinct injection |
| `permission-logger` | PermissionRequest | Security audit trail |
| `pre-compact-retention` | PreCompact | State preservation before compaction |
| `post-compact-reinjector` | SessionStart | State restoration after compact |
| `failure-recovery` | PostToolUseFailure | Recovery suggestions at 3+ consecutive failures |
| `stop-task-checker` | Stop | Prevents stopping with incomplete tasks |
| `loop-detector` | PostToolUse | Detects and breaks repetitive failure patterns |

Rationale: these hooks prevent security violations, data loss, and infinite loops. The cost of skipping any of them exceeds the overhead of running them.

### QUALITY (19 hooks)

Enhancement hooks that improve agent output quality. Fire in `standard` and `thorough` profiles, gated in `quick`.

Selected examples:

| Hook | Event | Reason |
|------|-------|--------|
| `intent-context` | PreToolUse | Memory topic injection by intent |
| `annotation-injector` | PreToolUse | Context7 annotation injection |
| `bash-output-limiter` | PreToolUse | Limits bash output for cache prefix stability |
| `context-threshold-monitor` | PostToolUse | Hull integrity monitoring |
| `auto-fix-diagnostics` | PostToolUse | Silent linting after Edit/Write |
| `execution-ratio-monitor` | PostToolUse | Planning-vs-execution ratio warning |
| `failure-reflection` | PostToolUseFailure | Reflexion pattern (Shinn et al., 2023) |
| `correction-capture` | Stop | Captures user corrections |
| `captain-log` | Stop | HANDOFF.md generation |
| `post-compact-enrichment` | PostCompact | K-LEAN re-injection (SNARC dream-cycle) |

Rationale: these hooks are valuable but not safety-critical. A quick variable rename does not benefit from knowledge injection or correction capture.

### OBSERVABILITY (10 hooks)

Metrics and analytics. Fire only in `thorough` profile.

| Hook | Event | Reason |
|------|-------|--------|
| `action-logger` | PostToolUse | Action logging and friction detection |
| `skill-usage-tracker` | PreToolUse | Skill usage metrics |
| `subagent-stop-tracker` | SubagentStop | Subagent lifecycle analytics |
| `notification-handler` | Notification | Notification routing |
| `config-change-handler` | ConfigChange | Config change warnings |
| `session-indexer` | SessionEnd | Session indexing |

Rationale: useful for understanding agent behavior over time, but have zero impact on current task quality. Running them during quick edits wastes cycles with no benefit.

### INFRASTRUCTURE (10 hooks)

Session lifecycle hooks. Always fire because they run on SessionStart or SessionEnd events: once per session, not per action.

| Hook | Event | Reason |
|------|-------|--------|
| `instruction-surface-measurer` | SessionStart | Measures instruction surface, reports budget |
| `fragility-cache-builder` | SessionStart | Pre-computes per-file fragility scores |
| `instinct-decay` | SessionStart | Decays instinct confidence scores |
| `skills-index-builder` | SessionStart | Builds keyword index from SKILL.md files |
| `project-state-loader` | SessionStart | Loads project state |
| `dotfiles-auto-backup` | SessionEnd | Dotfiles backup |
| `task-cleanup` | SessionEnd | Cleans up task list artifacts |

Rationale: the one-time session setup cost is fixed regardless of effort profile. These are not gated; they only fire once, and their caches are used throughout the session.

### KLEAN (5 hooks)

K-LEAN knowledge capture hooks with their own gating semantics. Always included as a class (present in all three profiles).

| Hook | Event | Reason |
|------|-------|--------|
| `kln-hook-session` | SessionStart | K-LEAN session init |
| `kln-hook-compact` | PreCompact | Compact capture |
| `kln-hook-bash` | PostToolUse | Bash output capture for learning |
| `kln-hook-web` | PostToolUse | Web and Context7 capture |
| `kln-prompt-guard` | UserPromptSubmit | Short-circuits processing for prompts under 15 chars |

Rationale: knowledge capture is a background concern orthogonal to task complexity. Even a quick rename can produce a learning worth capturing.

---

## 3. Effort-Based Gating: Three Profiles

Profiles are defined in the `gating_rules` section of `hook-taxonomy.json`.

### quick

Active classes: NEVER_GATE + INFRASTRUCTURE + KLEAN

Target overhead: ~15ms per-action (only hooks that cannot be skipped and session-lifecycle hooks).

Best for: renaming variables, simple questions, formatting changes, quick edits where the only requirement is safety and not enhancement.

### standard (default)

Active classes: NEVER_GATE + INFRASTRUCTURE + KLEAN + QUALITY

Target overhead: ~35ms per-action.

Best for: normal development, multi-file changes, feature implementation, debugging sessions.

### thorough

Active classes: all five classes (adds OBSERVABILITY)

Target overhead: ~40ms per-action.

Best for: security reviews, audits, complex refactoring, fleet deployments, sessions where long-term analytics and behavior data are valuable.

### Setting the profile

```
/effort quick
/effort standard
/effort thorough
```

The profile persists to `~/.claude/cache/current-effort-profile.json` between turns.

File structure:
```json
{ "profile": "standard", "set_at": "2026-04-04T10:00:00.000Z" }
```

---

## 4. Gating Implementation

The gating library lives at `hooks/lib/hook-gate.js`.

### How a hook opts into gating

Add three lines near the top of the hook, after `'use strict'`:

```javascript
let _gate;
try { _gate = require('./lib/hook-gate'); } catch { _gate = null; }
if (_gate && !_gate.shouldFire('my-hook-name')) process.exit(0);
```

The hook name passed to `shouldFire` must match the key in `hook-taxonomy.json`. The function strips path and file extension automatically, so passing `notification-handler` or `notification-handler.js` both work.

### shouldFire logic

```
1. Load hook-taxonomy.json (mtime-cached, <1ms on warm path)
2. Normalize hook name (strip path + extension)
3. Look up hooks[hookName].class
4. If not found: return true (fail-open)
5. If class is NEVER_GATE or INFRASTRUCTURE: return true
6. Load current-effort-profile.json
7. Load gating_rules[profile].active_classes
8. Return active_classes.includes(hookClass)
```

**Fail-open is mandatory.** A hook that does not appear in the taxonomy fires by default. This means a new hook that has not yet been classified will run, not silently disappear. Silent non-execution is extremely difficult to debug.

### Missing taxonomy file

If `hook-taxonomy.json` cannot be read (missing, corrupt, wrong path), `shouldFire` returns `true` for all hooks. The system degrades to "all hooks fire" rather than "no hooks fire."

---

## 5. Injection Budget Coordination

Multiple hooks produce `additionalContext` that gets injected into the agent's attention window. Without coordination, they can collectively inject more tokens than the signal is worth.

The shared budget lives in `hooks/lib/hook-gate.js` and stores state at `~/.claude/cache/injection-budget.json`.

### Budget parameters

| Parameter | Value |
|-----------|-------|
| Total budget per turn | 1000 tokens |
| TTL (reset between turns) | 30 seconds |
| Token estimation | `Math.ceil(text.length / 4)` |
| State file | `~/.claude/cache/injection-budget.json` |

### API

```javascript
const { getInjectionBudget, consumeInjectionBudget } = require('./lib/hook-gate');

// Check remaining budget before injecting
const remaining = getInjectionBudget();
if (remaining < 50) process.exit(0); // not worth injecting

// Consume budget atomically
const actual = consumeInjectionBudget(estimatedTokens);
// actual may be less than requested if budget is nearly exhausted
```

### Priority by execution order

The first hook to consume budget wins. Hook execution order within an event is determined by the order entries appear in `settings.json`. Hooks with higher-priority context (e.g., `fragility-hook` warning about a risky file) should be registered before lower-priority hooks (e.g., `annotation-injector` injecting library docs).

### Budget state schema

```json
{
  "consumed": 420,
  "timestamp": 1743761234567
}
```

If `Date.now() - timestamp > 30000`, the budget resets to 1000 for the new turn.

---

## 6. The hook-taxonomy.json File

Location: `hooks/lib/hook-taxonomy.json`

The file has four sections:

```json
{
  "_version": "1.0.0",
  "_description": "Hook classification for effort-based gating.",
  "_updated": "2026-04-04",
  "_budget": {
    "max_hooks_per_event": 15,
    "max_hooks_total": 70,
    "max_injection_tokens_per_turn": 1000,
    "current_total": 65
  },
  "hooks": {
    "protect-secrets": {
      "class": "NEVER_GATE",
      "event": "PreToolUse",
      "reason": "Blocks secrets access"
    },
    "intent-context": {
      "class": "QUALITY",
      "event": "PreToolUse",
      "reason": "Memory topic injection by intent"
    },
    "action-logger": {
      "class": "OBSERVABILITY",
      "event": "PostToolUse",
      "reason": "Action logging + friction detection"
    },
    "fragility-cache-builder": {
      "class": "INFRASTRUCTURE",
      "event": "SessionStart",
      "reason": "Builds fragility cache"
    },
    "kln-hook-session": {
      "class": "KLEAN",
      "event": "SessionStart",
      "reason": "K-LEAN session init"
    }
  },
  "gating_rules": {
    "quick": {
      "description": "Essential hooks only. QUALITY and OBSERVABILITY gated.",
      "active_classes": ["NEVER_GATE", "INFRASTRUCTURE", "KLEAN"]
    },
    "standard": {
      "description": "Most hooks fire. OBSERVABILITY gated.",
      "active_classes": ["NEVER_GATE", "INFRASTRUCTURE", "KLEAN", "QUALITY"]
    },
    "thorough": {
      "description": "All hooks fire.",
      "active_classes": ["NEVER_GATE", "INFRASTRUCTURE", "KLEAN", "QUALITY", "OBSERVABILITY"]
    }
  }
}
```

The `_budget` section is informational: it documents the design ceiling (70 hooks total, 15 per event) and the current count. Exceeding the per-event ceiling degrades performance noticeably; exceeding the total ceiling increases session startup cost.

---

## 7. Adding a New Hook

Follow this checklist to add a hook correctly:

### Step 1: Write the hook

Every hook must:

- Exit 0 unconditionally (a non-zero exit crashes the hook pipeline and blocks the agent)
- Wrap all logic in `try/catch`
- Use atomic writes for any state file: write to `.tmp`, then `fs.renameSync` to destination
- Complete within the event budget (PreToolUse: 50ms; PostToolUse: 50ms; SessionStart: 700ms combined)

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');

let _gate;
try { _gate = require('./lib/hook-gate'); } catch { _gate = null; }
if (_gate && !_gate.shouldFire('my-hook-name')) process.exit(0);

if (!shouldRun('my-hook-name')) process.exit(0);

try {
  // hook logic here
  recordSuccess('my-hook-name');
} catch (e) {
  recordFailure('my-hook-name');
}

process.exit(0);
```

### Step 2: Classify the hook

Ask three questions:

1. Would skipping this hook create a security or data-integrity risk? If yes: **NEVER_GATE**.
2. Does this hook improve agent output quality on the current task? If yes: **QUALITY**.
3. Does this hook produce metrics or analytics for future analysis, with no impact on the current task? If yes: **OBSERVABILITY**.
4. Does this hook only fire at SessionStart or SessionEnd? If yes: **INFRASTRUCTURE**.
5. Is this a K-LEAN capture hook? If yes: **KLEAN**.

When in doubt between QUALITY and OBSERVABILITY: ask whether skipping the hook for a quick rename would cause the user to notice a quality difference. If not, it belongs in OBSERVABILITY.

### Step 3: Add to hook-taxonomy.json

```json
"my-hook-name": {
  "class": "QUALITY",
  "event": "PostToolUse",
  "reason": "One sentence: what problem does this hook solve"
}
```

Update `_budget.current_total` to reflect the new count.

### Step 4: Add gating code

The three-line snippet at the top of the hook (shown in Step 1) is sufficient. No other changes are needed. The taxonomy lookup handles the rest.

### Step 5: Register in settings.json

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "node ~/.claude/hooks/my-hook-name.js"
      }]
    }]
  }
}
```

Hook registrations are read at session start only. Restart the session after editing `settings.json`.

### Step 6: Verify gating

```
/effort quick
```

Invoke a tool that matches the hook's matcher. The hook should not fire (confirm via `action-logger` output or by adding a temporary `console.error` that writes to stderr; stderr is visible in the Claude Code terminal but does not inject into agent context).

```
/effort standard
```

Invoke the same tool. A QUALITY hook should now fire.

---

## 8. Circuit Breaker

The circuit breaker (`hooks/lib/circuit-breaker.js`) protects the system from a misbehaving hook disabling the entire pipeline.

State file: `~/.claude/cache/hook-circuit-breaker.json`

Behavior:
- After **3 consecutive failures**, the hook's circuit opens
- While open, `shouldRun(hookName)` returns `false`; the hook exits immediately
- After **30 minutes**, the circuit auto-resets and the hook is retried
- On any successful run, the failure counter resets to zero

The circuit breaker is separate from the taxonomy gating. Both checks are typically included in hooks that have significant side effects. Order matters: check gating first (cheapest), then circuit breaker.

```javascript
if (_gate && !_gate.shouldFire('my-hook-name')) process.exit(0); // taxonomy gate
if (!shouldRun('my-hook-name')) process.exit(0);                 // circuit breaker
```

---

## 9. Monitoring Hook Health

### instruction-surface-measurer

Fires at SessionStart and reports the hook count and instruction surface to the agent's context. If the per-event ceiling (15) is approaching, it emits a warning.

### /test-hooks skill

Verifies that all hooks registered in `settings.json` are executable and respond to a minimal stdin payload. Run after adding or modifying hooks.

### action-logger (OBSERVABILITY class)

When running under the `thorough` profile, `action-logger` records every tool action to a 50-entry circular buffer at `~/.claude/cache/recent-actions.jsonl`. Each entry includes the tool name and timestamp, which enables rough hook overhead estimation.

### config-change-handler (OBSERVABILITY class)

Fires on `ConfigChange` events. When `settings.json` changes mid-session, it injects a warning into agent context reminding that hook registration changes require a session restart.

---

## 10. Design Decisions

**Why fail-open?**
Silent failure is the worst possible failure mode for a hook. If a hook does not appear in the taxonomy, or if the taxonomy file is missing, the hook fires. A hook that fires unnecessarily can be noticed and debugged. A hook that silently does nothing looks like everything is working while all its benefits are absent.

**Why 1000 tokens per turn for the injection budget?**
This was empirically determined. Below 1000 tokens, `auto-recall` can surface 3 K-LEAN entries (the sweet spot for usefulness without attention dilution) while leaving room for one additional hook injection. Above 1000 tokens, the injected context begins to compete with the agent's primary task context for attention, degrading response quality.

**Why three discrete profiles, not a continuous knob?**
Discrete profiles are easier to reason about and communicate. "Use quick for renames" is immediately actionable. "Set hook activation to 0.62" is not. Three profiles map cleanly to three mental models: safety-only, normal work, and deep analysis.

**Why JSON for the taxonomy, not code?**
The taxonomy is machine-readable, version-controlled, and auditable. Any hook can read its own classification at runtime. The taxonomy can be diffed in pull requests to track classification changes over time. A code-based registry (e.g., a JavaScript object in `circuit-breaker.js`) mixes infrastructure with classification concerns and makes the taxonomy harder to inspect without executing code.

**Why is action-logger OBSERVABILITY if it also drives friction detection?**
The friction detection output in `action-logger` feeds the holodeck context bundle (long-term), not the current task's quality gates. The agent does not read `friction-log.jsonl` during normal execution; it is consumed by the `/holodeck` subagent when explicitly invoked. Friction detection is therefore an analytics concern, not a real-time quality concern, and OBSERVABILITY is the correct class.

---

## Related Documentation

- [Hook Lifecycle](hook-lifecycle.md): detailed event-by-event hook flow with timing budgets
- [Architecture](architecture.md): system overview and component relationships
- [Fragility System](fragility-system.md): how fragility-hook and fragility-scoring work together
- [Instinct System](instinct-system.md): instinct-injector, instinct-decay, and confidence scoring
- [Metabolic States](metabolic-states.md): how context-threshold-monitor drives adaptive behavior
- [Annotation System](annotation-system.md): per-library gotcha injection via annotation-injector
