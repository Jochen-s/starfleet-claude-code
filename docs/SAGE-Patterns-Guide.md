# SAGE Clean-Room Patterns: What They Do and Why They Matter

Five behavioral patterns extracted from the SAGE (Situation-Aware Governance Engine) concept and reimplemented from scratch for this Claude Code hook system. Together, they make the agent smarter about managing its own resources, learning from its actions, and protecting itself under pressure.

This document explains each pattern in plain language: what changed, what it does, and how it benefits you.

---

## Pattern 1: Identity Manifest

**File**: `~/.claude/IDENTITY.md` (29 lines)

### What it does

Documents the exact loading order and priority rules for all instruction sources. Before this, the load order was implicit, scattered across code comments and tribal knowledge. Now it's a single reference document.

### Load order (first = lowest priority)

1. IDENTITY.md (behavioral constants)
2. Global CLAUDE.md (your defaults)
3. Rules (`~/.claude/rules/*.md`)
4. Project CLAUDE.md
5. CLAUDE.local.md (personal overrides)
6. Instincts (confidence-scored patterns, subagents only)
7. MEMORY.md (auto-memory index)
8. Topic files (loaded on demand based on what you're doing)

### How it benefits you

- **No more guessing** which instruction wins when two sources conflict. Project always overrides global. Local always overrides project.
- **Behavioral constants** are codified: hooks always exit 0, writes are always atomic, circuit breakers trip after 3 failures. These aren't suggestions; they're enforced invariants.
- **Tier 0 protection**: IDENTITY.md is classified as "never shed" in the instruction budget system. Even under maximum memory pressure, these rules survive.

---

## Pattern 2: Circular Buffer Memory

**Files**: `~/.claude/hooks/action-logger.js`, `~/.claude/hooks/lib/intent-classifier.js`

### What it does

Every time Claude uses a tool (reads a file, runs a command, edits code), the action logger records it to a rolling buffer of the last 50 actions. Each entry captures:

- **What tool** was used (Read, Edit, Bash, etc.)
- **What file** was touched
- **What intent** was detected (hook-engineering, debugging, research, etc.)
- **Which session** performed it
- **Whether it succeeded**

The buffer is stored as `~/.claude/cache/recent-actions.jsonl` (a simple text file, one JSON line per action, capped at 32KB).

### How it benefits you

- **Foundation for Patterns 3 and 5**. Without knowing what the agent has been doing recently, neither FOCUS mode nor instinct outcome tracking would be possible.
- **Intent classification** detects what kind of work you're doing based on file paths and tool combinations. Editing `~/.claude/hooks/` is classified as `hook-engineering`. Running `git` commands is `version-control`. Reading test files is `testing`. This classification drives smart context routing: you get relevant documentation loaded automatically based on your work.
- **Circular buffer design** means it never grows unbounded. Old entries roll off naturally. If the file gets corrupted, it starts fresh. The 50-entry cap and 32KB limit ensure it stays tiny.
- **Performance**: <10ms per tool use. You won't notice it.

---

## Pattern 3: Metabolic State Machine

**Files**: `~/.claude/hooks/context-threshold-monitor.js`, `~/.claude/hooks/intent-context.js`, `~/.claude/hooks/instruction-surface-measurer.js`

### What it does

Introduces four behavioral states that change how the agent manages its context window:

| State | When it activates | What changes |
|-------|-------------------|-------------|
| **NORMAL** | Default | All context loaded normally |
| **FOCUS** | 5+ consecutive actions of the same type | Only loads context matching your current work |
| **CRISIS** | Hull Red/Critical + 3 consecutive failures | Stops loading extra context entirely to conserve tokens |
| **RECOVERY** | After compaction drops hull below Red | Gradually restores context over 5 minutes |

### State transitions

```
NORMAL --[5 same-intent actions]--> FOCUS --[intent changes or 10min]--> NORMAL
NORMAL --[hull Red + 3 failures]--> CRISIS --[hull drops below Red]--> RECOVERY --[5min]--> NORMAL
FOCUS  --[hull Red + 3 failures]--> CRISIS
```

### How it benefits you

- **FOCUS mode is the biggest win.** When you're deep in a coding session editing hook files, you don't need unrelated documentation loaded into context. FOCUS mode detects that you've been doing the same kind of work for 5+ actions and stops injecting irrelevant context. This saves hundreds of tokens per tool call and keeps the agent's attention on what matters.

- **CRISIS mode is your safety net.** When the context window is nearly full (hull Red) AND the agent is hitting repeated errors, it's spiraling. CRISIS mode stops all optional context injection to free up space for the agent to actually work on the problem. Before this, a struggling agent would keep loading more and more context until it was forced into autocompaction, losing all conversation history.

- **RECOVERY mode prevents whiplash.** After a compaction event, jumping straight back to full context loading could overwhelm the freshly compacted window. RECOVERY gives a 5-minute grace period where context restores gradually.

- **Self-healing**: FOCUS times out after 10 minutes (no stuck states). Session changes reset to NORMAL. All state transitions are logged with timestamps.

---

## Pattern 4: Multi-Axis Salience

**Files**: `~/.claude/hooks/lib/fragility-scoring.js`, `~/.claude/hooks/fragility-cache-builder.js`, `~/.claude/hooks/fragility-hook.js`

### What it does

The existing fragility system scores files on a single 0-1 scale and assigns them to Stations (0 = safe, 1 = moderate, 2 = fragile, 3 = critical). This works but hides *why* a file is risky.

Pattern 4 adds five labeled risk axes that explain the nature of the risk:

| Axis | What it measures | Example |
|------|-----------------|---------|
| **Volatility** | Unexpected change rate (churn spike vs baseline) | A config file that was edited 10 times this week |
| **Novelty** | How new the file is (< 7 days of git history) | A freshly created hook with no track record |
| **Coupling** | How many other files change when this one changes | A shared library imported by 6 hooks |
| **Coverage** | Inverse of test coverage (higher = less safe) | A critical path with no tests |
| **Contention** | Multi-author + bug-fix frequency | A file that 3 people edited and keeps breaking |

For Station 2+ files (the ones that matter most), the advisory now includes the dominant axis and any elevated axes.

### How it benefits you

- **Actionable guidance instead of just a number.** "Score 0.72, Station 2" doesn't tell you what to do. "Station 2, dominant axis: contention (multi-author disputes), elevated: volatility 0.8" tells you this file is risky because multiple people keep changing it and it's churning. That suggests different actions than a high-novelty file (which just needs careful review because it's new).

- **Quality gate calibration.** A high-coupling Station 2 file warrants more thorough review than a high-novelty Station 2 file, because coupling means changes here cascade. The axes give you the information to make that judgment.

- **No behavioral change to existing scoring.** `computeScore()` is untouched. Axes are purely additive data. If the axis computation fails, the fragility system works exactly as before. Zero risk of regression.

---

## Pattern 5: Trust Tensor Decay

**Files**: `~/.claude/hooks/instinct-decay.js`, `~/.claude/hooks/instinct-injector.js`, `~/.claude/hooks/action-logger.js` (extended)

### What it does

Instincts are confidence-scored behavioral rules stored in `~/.claude/instincts/*.md`. Examples:

- "Always read a file before editing it" (confidence: 0.95)
- "Hooks must always exit 0" (confidence: 0.90)
- "Use atomic writes for state files" (confidence: 0.80)

Before Pattern 5, these confidences were static forever. A rule written weeks ago with 0.90 confidence would still be treated as 0.90 even if it was never validated again.

Pattern 5 adds **time-based decay**: instincts that haven't been validated recently lose effective confidence gradually. The formula:

```
effective = min(raw, max(floor, raw - 0.05 * weeks_since_validated))
```

- **Decay rate**: 0.05 per week (an instinct loses 5% confidence per week of staleness)
- **Floor**: 0.30 by default (instincts never fully vanish; even a stale rule has some value)
- **Custom floor**: Individual instincts can set their own floor via `**Decay floor**: 0.5`
- **Validation date**: Set via `**Last validated**: 2026-02-27` in the instinct file

### Example

An instinct with raw confidence 0.90, last validated 4 weeks ago:
```
effective = min(0.90, max(0.30, 0.90 - 0.05 * 4))
         = min(0.90, max(0.30, 0.70))
         = min(0.90, 0.70)
         = 0.70
```

The instinct is still active but sorts lower than fresher instincts. After 12 weeks with no validation: effective = 0.30 (floor).

### Outcome tracking

The action logger now watches for behavioral patterns that relate to instincts:

- **Positive signal**: Read tool followed by Edit on the same file = evidence that "read-before-edit" instinct is being followed
- **Negative signal**: Edit without any recent Read of that file = evidence it's not being followed

These outcomes are stored in `~/.claude/cache/instinct-outcomes.json` (100-entry rolling window). Currently observational: the data is collected but not yet fed back into confidence scores. This is a deliberate Phase 2 gap: data is collected now so the feedback loop can be calibrated later with real evidence.

### How it benefits you

- **Self-calibrating confidence.** Instincts that prove themselves in practice maintain high confidence. Rules that were added speculatively but never validated naturally fade in priority. This prevents the instinct system from accumulating stale rules that crowd out fresh, relevant ones.

- **Injection order reflects trust.** Instincts are injected into subagents sorted by effective confidence (highest first). Decayed instincts are still included but appear later, reducing their influence naturally. If the injection budget runs out, stale instincts are the first to be dropped.

- **No maintenance burden.** You don't need to manually prune or re-rank instincts. The decay formula handles prioritization automatically. If you validate an instinct (update its `Last validated` date), it immediately returns to full strength.

- **CRISIS integration.** During CRISIS mode (Pattern 3), instinct injection is now suppressed entirely. The agent doesn't waste tokens on behavioral guidance when it's fighting for survival. This was a cross-pattern fix identified during the integration review.

---

## Cross-Pattern Integration

The five patterns are designed to work together:

```
P2 (Action Logger) --feeds data to--> P3 (Metabolic State)
P3 (Metabolic State) --controls--> Intent Context (what documentation loads)
P3 (Metabolic State) --controls--> P5 (Instinct Injector, CRISIS suppression)
P5 (Instinct Decay) --scores fed to--> P5 (Instinct Injector, sort order)
P2 (Action Logger) --tracks outcomes for--> P5 (Instinct Decay, future calibration)
P4 (Multi-Axis Salience) --enhances--> Fragility System (richer advisories)
P1 (Identity Manifest) --documents--> All of the above (load order, priorities)
```

### Safety properties

| Property | Mechanism |
|----------|-----------|
| No pattern can crash the agent | All hooks exit 0, all wrapped in try/catch |
| Any pattern can fail independently | Each reads cache files with fallback defaults. Missing file = skip gracefully |
| State never grows unbounded | Circular buffers (50 entries), size caps (32KB), log rotation (64KB) |
| Stuck states self-heal | FOCUS: 10min timeout. CRISIS: clears on hull drop. Recovery: 5min timer. Session change: resets to NORMAL |
| Concurrent hooks can't corrupt state | Atomic writes (temp + rename) on all state files. Stale-by-one-action reads are acceptable by design |
| Circuit breakers prevent cascading failure | 3 consecutive failures = hook disabled for 30 minutes, then auto-retried |

### Performance budget

| Event | Hooks | Combined overhead |
|-------|-------|-------------------|
| SessionStart | instruction-surface-measurer, fragility-cache-builder, instinct-decay | ~700ms (dominated by git operations in fragility builder) |
| PreToolUse | intent-context, fragility-hook | ~15ms |
| PostToolUse | action-logger, context-threshold-monitor | ~20ms |
| SubagentStart | instinct-injector | ~5ms |

SessionStart overhead is a one-time cost per session. The per-action overhead (PreToolUse + PostToolUse) is ~35ms total, well within the 50ms budget and imperceptible to the user.

---

## Cross-Pattern Fixes Applied

Three fixes were identified during Fleet Command integration review and applied:

### 1. CRISIS suppression in SubagentStart (HIGH priority)

**Problem**: CRISIS mode suppressed context injection via PreToolUse (intent-context.js) but instinct-injector.js fires on SubagentStart, a different lifecycle event. During CRISIS, instincts were still being injected into subagents, wasting tokens that should be conserved.

**Fix**: instinct-injector.js now reads `metabolic-state.json` at startup. If state is CRISIS, it exits immediately with no injection. 4 lines added.

**Impact**: CRISIS mode is now consistent across all injection points. When the system is in crisis, nothing optional gets loaded: not context, not instincts.

### 2. Rejection log size cap (MEDIUM priority)

**Problem**: `instinct-rejections.log` used appendFileSync with no size limit. Under sustained invalid instinct submissions, the log would grow indefinitely.

**Fix**: Before appending, check file size. If > 64KB, truncate to empty and continue. 3 lines added.

**Impact**: Prevents a slow disk-fill scenario. The 64KB cap provides enough history for debugging while ensuring the file never becomes a problem.

### 3. Atomic circuit breaker writes (MEDIUM priority)

**Problem**: `circuit-breaker.js` (shared by all hooks) used direct writeFileSync. A crash during write could corrupt the state file, potentially disabling all hooks or preventing circuit breaker trips.

**Fix**: Changed to temp-file + rename pattern, consistent with every other state writer in the system. 2 lines changed.

**Impact**: Circuit breaker state is now crash-safe. This is the same atomic write pattern used by action-logger, metabolic state, instinct decay, and fragility cache; now it's universal.

---

## Known Limitations (accepted trade-offs)

These were identified during adversarial review and consciously accepted:

| Limitation | Why it's acceptable |
|------------|-------------------|
| PostToolUse hooks read data that may be one action stale | Hooks fire in parallel. Reading data from the previous action is architecturally acceptable; the system self-corrects on the next cycle. |
| Cache files have no integrity hashes (except fragility cache) | Single-user local deployment. An attacker with write access to `~/.claude/cache/` already has full control of the system. Adding HMAC would be complexity for no practical security gain. |
| Outcome feedback loop not yet closed | Data collection is Phase 1. Feeding outcomes back into confidence scores requires enough data to calibrate properly. Premature automation would be worse than manual review. |
| Fragility cache rebuilds from scratch every session | The ~600ms rebuild is dominated by git operations. Incremental builds would require change detection that adds its own complexity. Acceptable for a once-per-session cost. |
