# SAGE (Situation-Aware Governance Engine) -- Band 1 Deep Analysis

**Date**: 2026-03-28
**Analyst**: Claude Opus 4.6 (subagent)
**Sources**: GitHub repo dp-web4/SAGE (2,290+ commits, last pushed 2026-03-28), dp-web4/snarc (51 commits), explainer site sage-site-murex.vercel.app, SYSTEM_UNDERSTANDING.md, UNIFIED_CONSCIOUSNESS_LOOP.md, CHANGELOG.md, STATUS.md, dream_consolidation.py, pattern_library.py, adaptive_weights.py, expert_reputation.py, sleep_consolidation.py
**Purpose**: Cross-reference SAGE patterns against our Claude Code setup (K-LEAN, failure reflection, instinct injection, fleet review)

---

## 1. What SAGE Is (and Is Not)

SAGE is a **cognition kernel for edge AI devices** -- not a model, not a Claude Code plugin, not a prompt engineering system. It is an orchestration runtime that runs a continuous inference loop on local hardware (Jetson, Mac Mini, RTX laptops) to determine what deserves attention, which computational resources to activate, and how to process results. [README.md: "SAGE is the missing layer between a local LLM and useful cognition."]

**Core thesis**: "Intelligence through orchestration, not scale." A 0.8B parameter model with proper attention management, trust dynamics, and memory can exhibit useful cognition. [README.md]

**Scale**: 6 physical machines, 11 instances, 5 model families (Qwen, TinyLlama, Gemma, Phi-4), 2,290+ commits, 400+ raising sessions. Last pushed today (2026-03-28). [GitHub API metadata]

**It operates in a fundamentally different domain from Claude Code enhancement.** SAGE orchestrates local Ollama-served models on physical hardware. It does not enhance Claude Code sessions. The one relevant derivative is **SNARC** -- a lightweight spinoff that adapts SAGE's salience-gated memory into a Claude Code plugin. [README.md, "Related Projects"]

---

## 2. Architecture: The 12-Step Consciousness Loop

Every cycle runs continuously on all 6 machines. Implementation: `sage/core/sage_consciousness.py`. [UNIFIED_CONSCIOUSNESS_LOOP.md]

```
while True:
    1. Sense       -- gather observations from sensors (mocked; architecture exists)
    2. Attend      -- SNARC 5D scoring (Surprise, Novelty, Arousal, Reward, Conflict)
    3. Metabolize  -- update ATP budget, transition metabolic states
    4. Posture     -- compute trust posture (confidence, asymmetry, breadth)
    5. Select      -- choose attention targets (salience x metabolic rate x posture)
    6. Budget      -- allocate ATP across plugins, weighted by trust
    7. Execute     -- IRP plugins: iterative refinement until energy converges
    8. Learn       -- update trust weights from convergence quality (V3 EMA)
    8.5 Govern     -- PolicyGate conscience checkpoint
    9. Remember    -- update all 4 memory systems
    10. Filter     -- posture-based effect filtering (block starved modalities)
    11. Act        -- dispatch approved effects to effectors
    12. Sleep      -- consolidation at session boundaries (JSONL dream bundles)
```

### Three-Layer Architecture

1. **SAGE** -- The cognition kernel (scheduler). `/sage/core/` -- 60+ Python files including consciousness loop, metabolic controller, trust systems, pattern library, epistemic calibration. [GitHub API: sage/core/ listing]
2. **IRP (Iterative Refinement Protocol)** -- Universal plugin interface. Every plugin implements: `init_state(x0, task_ctx) -> step(state) -> energy(state) -> halt(history)`. 15+ plugins (vision, audio, language, memory, TTS, control, policy). [SYSTEM_UNDERSTANDING.md]
3. **VAE** -- Cross-modal translation. TinyVAE: 64D latent, 192x compression, <10ms. Not in live loop. [SYSTEM_UNDERSTANDING.md]

### Self-Improvement Loop Structure

Three interlocking feedback loops create self-improvement:

**Loop 1 -- Trust-based capability adaptation**: Plugins earning higher trust receive larger ATP budgets. Unused plugins decay at 0.0005/cycle. Creates positive feedback for effective reasoning. [Explainer site, "Trust Dynamics System"]

**Loop 2 -- Experience consolidation (DREAM state)**: During DREAM, the system replays high-salience experiences and fine-tunes personality weights via LoRA (r=4, salience-weighted loss). Production result: 6 experiences, loss 4.061->4.027. [UNIFIED_CONSCIOUSNESS_LOOP.md]

**Loop 3 -- PolicyGate compliance learning**: Every 100 cycles, compliance quality adjusts plugin trust weights via EMA. Plugins violating policy see decreased trust -> reduced ATP -> lower capability. Incentive gradient emerges from structure. [CHANGELOG.md, "PolicyGate Phase 5a"]

---

## 3. Specific Patterns Implemented

### 3.1 Memory Management: Four Parallel Systems

SAGE maintains four memory systems operating simultaneously. [SYSTEM_UNDERSTANDING.md, UNIFIED_CONSCIOUSNESS_LOOP.md]

| System | Brain Analogy | Purpose | Gating | Storage |
|--------|---------------|---------|--------|---------|
| **SNARC Memory** | Working memory | Salience-gated selective storage | Only stores experiences with composite salience > threshold (5D: S=0.25, N=0.20, A=0.20, R=0.25, C=0.10 weights) | In-memory + SQLite |
| **IRP Pattern Library** | Procedural memory | Stores successful refinement trajectories ("If you see X, try strategy Y") | Only stores patterns with convergence monotonicity > 0.8 | Cryptographically signed, JSON persistence |
| **Circular Buffer** | Short-term memory | Last 100 events for temporal context | FIFO, no gating | In-memory ring buffer |
| **Verbatim Storage** | Episodic memory | Full-fidelity records for consolidation | Active only during DREAM state | SQLite (`memory.db`) |

**Integration flow**: SNARC decides what's important -> IRP Memory provides how-to guidance -> Circular Buffer maintains context -> Verbatim preserves details during consolidation. [SYSTEM_UNDERSTANDING.md, "Memory Systems" section]

**Consolidation pipeline**: `observe -> SNARC-score -> store -> consolidate (during DREAM)`. This mirrors complementary learning systems: rapid hippocampal storage followed by cortical consolidation during sleep. [Explainer site]

**Pattern Library detail** (from `sage/core/pattern_library.py`): Patterns are cryptographically signed using the creator consciousness's LCT identity. Each SignedPattern includes metadata (pattern_type, version, creator_lct_id, creator_machine, tags) + pattern_data + LCT signature. This enables tamper detection and source attribution across the federation without a central authority. [pattern_library.py, lines 1-90]

### 3.2 Skill Extraction: IRP Pattern Library + Expert Reputation

SAGE does not have explicit "skill extraction" in the sense of mining named skills from experience. Instead:

**IRP Pattern Library** stores successful convergence trajectories as reusable procedures. When a plugin achieves good convergence (monotonicity > 0.8), the pattern is stored. Future similar problems can retrieve and apply the stored trajectory. This is procedural memory -- "how to do things" -- rather than named skills. [SYSTEM_UNDERSTANDING.md]

**Expert Reputation System** (`sage/core/expert_reputation.py`): Applies Web4's contextual trust framework to expert management. Each expert (neural network expert unit) tracks: activation history, performance metrics (convergence_rate, stability, efficiency, average_confidence), contextual trust (P(expert performs well | context)), relational data (co-activation patterns, successful pairs, substitution history). Trust updates are Bayesian-style evidence accumulation. [expert_reputation.py, lines 1-120]

**Tool capability detection**: Three-tier system. T1: native JSON tool calls (Ollama `/api/chat`). T2: grammar-guided XML parsing (prompt injection + extraction). T3: heuristic regex intent detection (always available as fallback). Capability detected per-model at startup. [Explainer site, "Tool Use"]

### 3.3 Meta-Learning: Adaptive Weights + Trust Dynamics

**Adaptive objective weighting** (`sage/core/adaptive_weights.py`): Dynamically adjusts multi-objective optimization weights (coverage, quality, energy) based on operating context. Context dimensions: ATP level, attention rate, quality trend, coverage stability. Uses smooth EMA transitions to avoid oscillation. Weights always sum to 1.0, each constrained to [0.1, 0.7]. Baseline: coverage=0.5, quality=0.3, energy=0.2. [adaptive_weights.py, lines 1-100]

**Defensive trust model** (added 2026-03-14): All trust starts at 0.0 (zero-base, evidence-earned), replacing the previous default of 1.0. Key mechanisms: [CHANGELOG.md, "Defensive Trust Model"]
- Probe budget: 2% ATP floor breaks bootstrap deadlock for untrusted plugins
- First-contact bump: first real execution -> plugin + sensor trust = 0.1
- V3 EMA updates: trust evolves from convergence quality evidence
- Mock telemetry detection: trust updater skips mock-flagged results
- Silence decay: 0.001/cycle for mock-executed plugins, floor 0.1 (aware-but-unconfirmed)
- Persistence: trust survives restarts via `daemon_state.json`

**Epistemic calibration** (`sage/core/epistemic_calibration.py`, `epistemic_estimator.py`, `epistemic_states.py`): Meta-cognitive system tracking knowledge state. These files implement epistemic state tracking at the consciousness level. [GitHub API: sage/core/ listing]

**Salience-weighted compliance tracking** (PolicyGate Phase 5a): Integrates salience-weighted compliance into trust weight learning. Creates dual-signal optimization: convergence quality AND policy compliance both affect trust. [CHANGELOG.md]

### 3.4 Reflection: Implicit Through Multiple Channels

SAGE does **not** implement explicit failure reflection with stored error signatures. Its reflection is continuous and gradient-based rather than discrete and catalog-based:

**DREAM consolidation** (`sage/core/dream_consolidation.py`): During DREAM state, extracts patterns from recent consciousness cycles. Four extraction types: [dream_consolidation.py, docstring and dataclasses]
1. **MemoryPattern**: Extracted patterns with type (quality, epistemic, metabolic, association), strength (0-1), frequency, supporting examples
2. **QualityLearning**: Learns which response characteristics lead to high/low quality scores. Tracks: characteristic name, positive_correlation (bool), confidence, sample_size, average_quality_with vs without
3. **CreativeAssociation**: Non-obvious connections between concepts from different DREAM contexts. Tracks: concept pair, association type (causal, analogical, temporal), strength
4. Episodic-to-semantic compression: raw experiences -> consolidated patterns

**Convergence quality feedback**: IRP plugins that fail to converge (energy does not decrease) get lower trust scores -> less ATP -> fewer execution opportunities. This is a negative feedback gradient preventing stalled reasoning. [Explainer site]

**Tool correction loop**: When tools return ground truth contradicting model output, results are re-injected. Model self-corrects in-context. Documented as compensating for confabulation in small LMs. [Explainer site]

**PolicyGate WARN signals**: Actions violating policy trigger WARN outcome, invoking LLM advisory for iterative refinement. Compliance quality tracked per plugin. Bad compliance -> reduced trust -> reduced capability. [CHANGELOG.md]

---

## 4. What Has Changed Since Initial Publication

### Timeline of Major Changes

The repo was created 2025-08-03. Key evolution: [CHANGELOG.md, STATUS.md]

| Date | Change | Impact |
|------|--------|--------|
| 2025-08 | Initial HRM repo | Basic hierarchical reasoning, trust-based expert selection |
| 2025-10 | System Understanding synthesized | Architecture crystallized |
| 2025-11 | v0.1.0 release + consciousness loop structure | IRP framework, SNARC memory, metabolic states |
| 2025-12 | Dream consolidation, pattern library, expert reputation | Self-improvement mechanisms |
| 2026-01-10 | FlashAttention Phases 1-2 | GQA expert selection + metabolic attention allocation on Thor |
| 2026-02-18 | PolicyGate Phase 1 | 684 lines, conscience checkpoint concept |
| 2026-02-26 | `SAGE.create(use_real_llm=True)` | Real LLM inference end-to-end (400 tokens, 1.3s avg) |
| 2026-02-27 | Documentation honesty pass | Split "real" vs "mocked" across all docs |
| 2026-02-28 | Instance separation + Seed v2 + Federation infra | Per-machine isolation, peer mesh, fleet registry |
| 2026-03-01 | PolicyGate Phase 2 + Snapshots | Loop integration (50-cycle test: 4 transitions, 19 plugins) |
| 2026-03-05 | PolicyGate Phases 4-5a | Experience buffer + trust weight learning (29/29 tests) |
| 2026-03-06 | Tool use live on Nomad | 7 built-in tools verified end-to-end |
| 2026-03-14 | Defensive Trust Model | Zero-base trust + probe budget + multimodal plugin bridge |
| 2026-03-15 | SNARC spinoff created | Claude Code memory plugin (separate repo) |
| 2026-03-28 | Latest push (today) | Continued active development |

### Most Significant Recent Change: Defensive Trust (2026-03-14)

This is a philosophical shift, not just a code change. Previous: all trust defaulted to 1.0 (optimistic). New: all trust defaults to 0.0 (pessimistic, evidence-earned). The probe budget (2% ATP floor) prevents new plugins from being permanently locked out. First-contact bump (0.1) provides initial evidence opportunity. [CHANGELOG.md]

**Why it matters for us**: This challenges the assumption in most systems (including ours) that new components should be trusted until proven otherwise. SAGE now requires components to earn trust through demonstrated performance.

---

## 5. Deep Dive: Memory Consolidation, Utility Scoring, Failure Reflection, Experience Replay

### 5.1 Memory Consolidation

**Primary mechanism: DREAM-state consolidation** [UNIFIED_CONSCIOUSNESS_LOOP.md, sleep_consolidation.py]

Implementation in `sage/attention/sleep_consolidation.py`:

1. `ExperienceToTrainingConverter` converts attention kernel experiences to training format
2. Different source types (focus, think, act) produce different conversation patterns
3. `SleepConsolidationBridge` bridges to the raising pipeline's LoRA training loop
4. With `use_real_sleep=True`: runs LoRA fine-tuning (r=4, salience-weighted loss)
5. Without: writes JSONL dream bundles to disk for later processing
6. Fires asynchronously on DREAM entry; falls back to JSONL on error

**Consolidation trigger chain**: Metabolic state transitions to DREAM (requires: moderate ATP + time spent in REST) -> system extracts top-k SNARC experiences by salience score -> experiences converted to training format -> LoRA fine-tuning or JSONL dump. [UNIFIED_CONSCIOUSNESS_LOOP.md]

**Dream consolidation module** (`sage/core/dream_consolidation.py`): More sophisticated pattern extraction during DREAM. Extracts: [dream_consolidation.py, lines 1-150]
- **MemoryPatterns** (quality, epistemic, metabolic, association types) with strength, frequency, examples
- **QualityLearnings** (what response characteristics correlate with quality; sample_size, average_quality_with/without)
- **CreativeAssociations** (cross-concept connections discovered in DREAM)
- Episodic-to-semantic compression

**Circadian modulation**: 5 phases (DAWN, DAY, DUSK, NIGHT, DEEP_NIGHT) bias consolidation timing. DREAM states biased toward night. 100 cycles = 1 circadian day. [UNIFIED_CONSCIOUSNESS_LOOP.md]

**Production results**: First cycle: 6 experiences processed, loss 4.061->4.027. LoRA training functional on Sprout (Jetson Orin Nano). Other machines use JSONL fallback. [UNIFIED_CONSCIOUSNESS_LOOP.md]

**Comparison to our setup**: SAGE's consolidation is hardware-bound LoRA weight updates on high-value experiences. Our sleep-time consolidation (K-LEAN PreCompact hook) operates at text/embedding level. Both share the concept of "offline processing during downtime." SAGE's is deeper (modifies model weights); ours is broader (works across any model, no hardware dependency).

### 5.2 Utility Scoring

SAGE implements utility at three levels:

**Level 1 -- SNARC 5D Salience** (per-observation): [SYSTEM_UNDERSTANDING.md, README.md]
- Surprise (0.25 weight): prediction error magnitude
- Novelty (0.20): distance from known patterns
- Arousal (0.20): urgency and intensity signals
- Reward (0.25): value and importance signals
- Conflict (0.10): contradiction and tension detection
- Composite score determines attention priority and memory storage eligibility

**Level 2 -- ATP Budget** (per-cycle resource allocation): [UNIFIED_CONSCIOUSNESS_LOOP.md]
- Each plugin execution costs ATP (coupled to token count for LLM plugins)
- Trust-weighted allocation: high-trust plugins get proportionally more ATP
- Early-stopping plugins return unused budget for reallocation
- ATP recovered during REST state; crisis at ATP < 10
- Probe budget: 2% floor for untrusted plugins [CHANGELOG.md]

**Level 3 -- Trust Weights** (long-term capability scoring): [CHANGELOG.md, expert_reputation.py]
- Plugin trust: V3 EMA-updated from convergence quality
- Sensor trust: evidence-earned, zero-base
- Expert reputation: context-dependent trust (P(expert performs well | context))
- Silence decay (0.001/cycle, floor 0.1) prevents zombie scores
- Persistence across restarts via daemon_state.json

**Level 4 -- Adaptive objective weights** (meta-optimization): [adaptive_weights.py]
- Dynamically adjusts coverage/quality/energy weights based on operating context
- High ATP -> emphasize quality; Low ATP -> emphasize coverage
- Smooth EMA transitions; each weight in [0.1, 0.7]; sum = 1.0

**Comparison to our Q-value scoring**: SAGE's multi-level utility is more expressive than K-LEAN's single Q-value. SAGE scores at the observation level (SNARC), resource level (ATP), component level (trust), and meta level (adaptive weights). Our Q-value operates only at the knowledge entry level. However, our simplicity is a feature -- K-LEAN's single score is easy to reason about, debug, and tune.

### 5.3 Failure Reflection

SAGE has **no explicit failure catalog**. No stored error signatures, no "tool X failed with error Y, avoidance strategy Z" lookup. Its failure handling is entirely gradient-based:

**Mechanism 1 -- Convergence quality -> trust decay**: Plugins that fail to converge get lower trust scores. Lower trust -> less ATP -> fewer execution opportunities. Recovery: plugin can earn trust back through future successful convergence. [Explainer site]

**Mechanism 2 -- Tool correction re-injection**: When tools return ground truth contradicting model output, results are re-injected into the conversation. Model self-corrects. This is reactive, not proactive. [Explainer site]

**Mechanism 3 -- PolicyGate WARN -> compliance tracking**: Actions violating policy trigger WARN. Compliance quality tracked per plugin over rolling window. Bad compliance -> trust reduction. [CHANGELOG.md]

**Mechanism 4 -- QualityLearning extraction during DREAM**: Dream consolidation extracts which characteristics positively/negatively correlate with quality outcomes. Stores as QualityLearning dataclass with confidence and sample size. This is the closest to our failure reflection -- it learns "what works" and "what doesn't" from experience. [dream_consolidation.py]

**What's missing vs. our setup**: Our failure-reflection hook stores discrete error signatures with avoidance strategies. SAGE's approach is continuous/gradient-based. Our approach is faster to respond to specific repeated failures (exact-match lookup). SAGE's approach is better at generalizing across similar-but-not-identical failures (gradient descent).

**Assessment**: Both approaches have value. A hybrid would combine our discrete error catalogs (fast exact-match) with SAGE-style gradient trust decay (slow generalization).

### 5.4 Experience Replay

**DREAM-state replay** is the primary mechanism: [UNIFIED_CONSCIOUSNESS_LOOP.md, sleep_consolidation.py]

1. High-salience experiences (top-k by SNARC score) selected from experience buffer
2. `ExperienceToTrainingConverter` converts to training format (different formats for focus/think/act sources)
3. With LoRA: salience-weighted loss ensures high-salience experiences have more training influence
4. Without LoRA: JSONL dump preserves experiences for later batch processing
5. Dream consolidation module additionally extracts: MemoryPatterns, QualityLearnings, CreativeAssociations

**Experience buffer size**: 800+ SNARC-scored conversation exchanges per instance. Used by PolicyGate Phase 4 for experience-informed policy decisions. Persisted in instance state, snapshotted at session boundaries. [README.md]

**IRP Pattern Library as implicit replay**: Successful convergence trajectories are stored and retrieved for similar future problems. This is replay of "how to solve" rather than replay of "what happened." [SYSTEM_UNDERSTANDING.md]

**Comparison to our setup**: We have no explicit experience replay. Our K-LEAN stores knowledge entries and retrieves by similarity, which resembles the IRP Pattern Library. SAGE's DREAM consolidation (replaying high-salience experiences for LoRA training) has no direct equivalent in our setup since we don't control model weights.

---

## 6. SNARC: The Claude Code Derivative

SNARC is the only part of the SAGE ecosystem that directly touches Claude Code. Created 2026-03-15, MIT licensed, 51 commits, 6 stars. [GitHub API: dp-web4/snarc]

### Architecture

```
PostToolUse hook -> SNARC 5D score -> Tier 0 buffer or Tier 1 (SQLite)
PreCompact hook  -> conversation transcript -> semantic salience scoring -> Tier 1
SessionStart     -> inject briefing (patterns + observations + identity)
UserPromptSubmit -> FTS5 search -> inject matching memories
PostCompact      -> mid-session dream + re-inject enriched briefing
Stop hook        -> confidence decay + prune + heuristic dream + deep dream
```

### Key Design Decisions

**Pre-storage filtering vs. post-hoc search**: SNARC scores at capture time and discards below threshold. Most memory systems (including K-LEAN) capture everything then filter at retrieval. SNARC's approach reduces noise but risks losing low-salience observations that become important later. [SNARC README.md, "How it's different from logging everything"]

**Conversation capture** (v0.3.x): Previous versions only captured tool calls. Result: "Bash -> Bash -> Bash (51x)". New PreCompact hook reads full conversation transcript and extracts semantically salient turns -- insights, decisions, reframes. Scores on: insight language, domain concepts, decision language, analogies, identity observations. [SNARC README.md, "What's new (v0.3.x)"]

**Deep dream auto-promote on by default**: LLM-extracted identity facts automatically become Tier 3 (permanent) without human review. Acknowledged risk: hallucinated facts persist until confidence decay corrects them. Quarantine mode available but opt-in. [SNARC README.md, "Identity auto-promotion"]

**Confidence decay**: Patterns lose 0.05 confidence per day. Observations lose salience after 7 days. Patterns below 0.1 confidence are pruned. "A memory system that only accumulates is a distortion engine." [SNARC README.md]

**Conservative injection thresholds**: Patterns >= 0.6, observations >= 0.6, identity >= 0.7. Below threshold: SNARC stays silent. "Wrong memory is more damaging than missing memory." [SNARC README.md]

### Per-Message Memory Injection

This is SNARC's most novel feature for Claude Code contexts. The `UserPromptSubmit` hook: [SNARC README.md, "Context injection"]

1. Extracts keywords from user prompt
2. FTS5 search across observations and patterns
3. If matches found: inject via `additionalContext`
4. Most prompts pass silently (no match = no injection)

**We do not have this.** Our instinct injection happens at session/subagent start, not per-message. This is a genuine gap.

---

## 7. Reusable Patterns for Our Claude Code Setup

### 7.1 Patterns We Already Have (Validation)

| SAGE Pattern | Our Equivalent | Assessment |
|-------------|----------------|------------|
| SNARC 5D salience | K-LEAN Q-value scoring | Similar function (prioritize knowledge). SAGE: 5 dimensions. Ours: single Q-value. Simpler but less expressive. |
| DREAM consolidation | PreCompact hook + sleep-time consolidation | Both do offline processing. SAGE: LoRA weight updates. Ours: text-level K-LEAN capture. |
| Trust weight EMA | K-LEAN Q-value decay/boost | Both use exponential moving averages for utility scores. |
| PolicyGate compliance | Instinct confidence scores | Both gate actions through learned policy. SAGE: continuous trust. Ours: discrete confidence thresholds. |
| Convergence feedback | Failure reflection hook | Both create negative feedback. SAGE: gradient-based. Ours: catalog-based error signatures. |
| Silence decay | K-LEAN Q-value decay | Both prevent stale scores. |
| Cryptographic pattern provenance | N/A | SAGE signs patterns with LCT identity. We don't need this (single user, not federation). |
| Snapshot persistence | Git-tracked state files | Both persist state across sessions. Similar approach. |

### 7.2 Patterns Worth Adopting

#### 7.2.1 Multi-Dimensional Salience Scoring (Medium priority)

**What**: Extend K-LEAN entry scoring from single Q-value to multi-dimensional. SAGE uses 5D (Surprise 0.25, Novelty 0.20, Arousal 0.20, Reward 0.25, Conflict 0.10). [SYSTEM_UNDERSTANDING.md]

**Adoptable dimensions**:
- **Novelty** (is this knowledge unique?): prevents storing redundant entries
- **Conflict** (does this contradict existing knowledge?): flags entries for review/reconciliation
- **Reward** (how often has this been useful?): our Q-value already covers this

**Implementation**: Add `novelty` and `conflict` fields to K-LEAN entry schema. Score at capture time by comparing against existing entries (semantic similarity for novelty, contradiction detection for conflict). Composite score = weighted combination.

**Estimated effort**: Medium. Requires K-LEAN schema change + scoring pipeline update.

#### 7.2.2 Probe Budget for Bootstrap (High priority, low effort)

**What**: SAGE's 2% ATP floor guarantees new untrusted plugins get execution opportunities. First-contact bump (0.1 trust) provides initial evidence. [CHANGELOG.md, "Defensive Trust Model"]

**Application**: New instincts currently enter at confidence 0.3 and must be validated. But if validation never fires (because the instinct's domain doesn't come up), confidence never grows and the instinct remains at baseline forever. A probe mechanism would:
- Guarantee new instincts are injected for N sessions (probe period)
- Track whether the instinct was relevant during those sessions
- After probe period: either earned confidence from use, or drop below threshold

**Implementation**: Add `probe_sessions_remaining` field to instinct metadata. SubagentStart hook injects probe-period instincts regardless of confidence. After N sessions, normal confidence rules apply.

**Estimated effort**: Low. Small change to instinct injection logic.

#### 7.2.3 Per-Message Context Injection (Medium priority, medium effort)

**What**: SNARC's UserPromptSubmit hook searches memory on every user message and injects relevant matches as additionalContext. Most messages pass silently. [SNARC README.md]

**Application**: Our instincts inject at session/subagent start only. If a user asks about a specific topic mid-session, we don't proactively surface related K-LEAN entries. A UserPromptSubmit hook could:
- Extract keywords from user message
- Search K-LEAN entries by similarity (BM42/embedding search)
- Inject top-N matches as additional context if relevance score > threshold
- Most messages pass silently (no match = no overhead)

**Implementation**: New UserPromptSubmit hook that queries K-LEAN or Weaviate. Must be fast (<100ms) to avoid blocking. FTS5 or BM42 preferred over full embedding search for latency.

**Estimated effort**: Medium. Requires new hook + fast search integration.

#### 7.2.4 PostCompact Dream-Cycle Enrichment (Medium priority)

**What**: SNARC's PostCompact hook runs a mid-session dream cycle (consolidates observations so far) then re-injects an enriched briefing. [SNARC README.md]

**Application**: Our PreCompact hook captures to K-LEAN before compaction. But after compaction, we don't re-inject an improved briefing. The agent loses context but doesn't get a compensating knowledge injection.

**Implementation**: After compaction, run a lightweight consolidation (group recent K-LEAN captures, extract patterns) and inject as system context. This would help long sessions that compact multiple times.

**Estimated effort**: Medium. Requires PostCompact hook + consolidation logic.

#### 7.2.5 Metabolic States as Context Modes (Low priority, conceptual)

**What**: SAGE's 5 metabolic states (WAKE, FOCUS, REST, DREAM, CRISIS) change behavioral parameters -- attention breadth, learning rates, trust thresholds, plugin limits. [SYSTEM_UNDERSTANDING.md, metabolic_controller.py]

**Application**: Our hull integrity levels (Green/Amber/Red/Critical) currently only trigger shedding. Could extend to change behavioral parameters:
- **Green** (WAKE): Full instinct injection, standard quality gates, all tools
- **Amber** (FOCUS): Reduced instinct set, only task-relevant, tighter scope
- **Red** (DREAM-equivalent): Trigger consolidation, update Q-values, prune stale entries
- **Critical** (CRISIS): Aggressive shedding, only critical instincts, fast heuristics

**Implementation**: Extend hull integrity handler to modify injection parameters, quality gate thresholds, tool availability.

**Estimated effort**: Medium. Behavioral parameter mapping needs design.

#### 7.2.6 Automatic Confidence Decay (High priority, low effort)

**What**: SNARC's patterns lose 0.05/day, observations lose salience after 7 days, patterns below 0.1 are pruned. "A memory system that only accumulates is a distortion engine." [SNARC README.md]

**Application**: Our instincts and K-LEAN entries have no automatic decay. Stale knowledge accumulates unless manually pruned. Adding time-based decay would:
- Reduce instinct confidence by small amount per day since last validation
- Flag entries that haven't been accessed/validated in N days
- Prune entries below minimum threshold

**Implementation**: Add `last_validated` timestamp to instincts (already exists). Add decay calculation to SubagentStart hook or SessionStart hook. Decay rate: 0.01/day for instincts (slower than SNARC's 0.05 since our instincts are more curated).

**Estimated effort**: Low. Simple timestamp-based decay calculation.

### 7.3 Patterns That Don't Transfer Well

| SAGE Pattern | Why It Doesn't Transfer |
|-------------|------------------------|
| LoRA fine-tuning during DREAM | We don't control model weights. Claude Code operates on a fixed model. |
| ATP budget management | No meaningful "energy" currency. Context window is closest analogue, already managed by hull integrity. |
| Sensor trust landscape | No multiple input modalities competing for attention. |
| Federation mesh (peer-to-peer) | Our fleet review is synchronous/orchestrated, not a persistent mesh. |
| Hardware-bound identity (LCT) | Our identity is session-based, not hardware-bound. |
| VAE cross-modal translation | Text-only domain. |
| Circadian rhythm | No persistent daemon; sessions are discrete. |
| Expert reputation system | Relevant for neural network expert routing, not for Claude Code tool selection. |
| Cryptographic pattern provenance | Single-user system; no federation trust requirements. |

---

## 8. Honest Assessment: What's Real vs. Mocked

SAGE is unusually transparent about implementation status. [README.md, STATUS.md]

| Component | Status | Notes |
|-----------|--------|-------|
| Consciousness loop (12-step) | **Real** | Runs on all 6 machines |
| LLM inference (Ollama/Transformers) | **Real** | ATP coupled to token cost |
| Metabolic states (5 states) | **Real** | State-dependent behavior |
| SNARC salience (5D) | **Real** | Experience buffer persistence |
| PolicyGate (Phase 5a) | **Real** | 29/29 tests, trust weight learning |
| Tool use (7 tools, v0.4.0a3) | **Real** | Verified on Nomad (Gemma 3 4B) |
| Identity/relationships | **Real** | LCT-anchored, evolving trust tensors |
| Sleep consolidation | **Real** | JSONL bundles (LoRA on Sprout only) |
| Federation mesh | **Real code** | Network currently OFF |
| Snapshot persistence | **Real** | State snapshots at session boundaries, git-tracked |
| Sensors | **Mocked** | No real I/O backends |
| Physical effectors | **Mocked** | Stubs except network effector |
| Cross-modal VAE | **Research** | 192x compression demonstrated, not in live loop |
| FlashAttention | **Research** | Phases 1-2 on Thor, not in live loop |

**Maturity**: 17 stars, 1 fork, 2,290+ commits, 5 contributors. AGPL-3.0 license. Very high commit volume for zero community adoption. No CI pipeline. No formal releases. Author explicitly acknowledges "research prototype, not shippable product." [STATUS.md]

---

## 9. Key Architectural Insights

### 9.1 "Intelligence Through Orchestration, Not Scale"

SAGE proves that useful cognition emerges from proper orchestration of small models, not from model size alone. A 0.8B parameter model (Sprout) with SNARC attention, metabolic states, and trust dynamics exhibits behaviors that raw model inference cannot. [README.md]

**Our parallel**: Fleet review (6 factions) improves output quality beyond any single model pass. Instinct injection makes Claude Code sessions more effective than raw Claude. Same principle: orchestration > scale.

### 9.2 "Trust Must Be Earned, Not Assumed"

The defensive trust model (zero-base, 2026-03-14) is a significant philosophical shift. Default trust = 0.0. Probe budget prevents deadlock. First-contact bump provides bootstrap opportunity. [CHANGELOG.md]

**Our gap**: We trust new tools/instincts at their initial confidence score (minimum 0.3). No probe period, no evidence requirement. Could benefit from evidence-earned trust for new components.

### 9.3 "Memory as Temporal Sensor"

SAGE treats memory as an active input channel providing observations from the past, not passive storage to query. Memory systems operate in parallel, each providing a different temporal perspective. [SYSTEM_UNDERSTANDING.md]

**Our gap**: K-LEAN retrieval is query-driven (`/kln:find`). Instinct injection is proactive but coarse (inject all validated instincts, not contextually relevant ones). SNARC's per-message injection is closer to "memory as sensor" than our approach.

### 9.4 Fractal H-L Pattern

The same hierarchical pattern (strategic H-level, tactical L-level, bidirectional communication with compression at boundaries) repeats at 5 scales: neural, agent, device, federation, development. [SYSTEM_UNDERSTANDING.md]

**Our implementation**: Main agent (H) dispatches to subagents (L). Instinct injection is compression at the boundary (full context -> injected patterns). Task delegation with disjoint file sets is the H-L split at the code level.

### 9.5 "A Memory System That Only Accumulates Is a Distortion Engine"

SNARC's confidence decay ensures memories that are not re-observed gradually lose influence and eventually prune. This prevents stale knowledge from polluting future sessions. [SNARC README.md]

**Our gap**: We have no automatic decay. Instincts and K-LEAN entries persist indefinitely unless manually pruned. Over time, this creates noise. The `last_validated` field exists on instincts but is not used for decay calculations.

---

## 10. Priority Action Items

### Immediate (adopt as individual patterns, no SAGE/SNARC dependency)

1. **Automatic confidence decay** on instincts -- use existing `last_validated` field, decay 0.01/day, prune below threshold
2. **Probe budget for new instincts** -- guarantee N sessions of injection regardless of confidence, then apply normal rules

### Near-term (evaluate SNARC spinoff, consider pattern adoption)

3. **Evaluate dp-web4/snarc** for per-message injection pattern -- could port the UserPromptSubmit hook concept to our K-LEAN/Weaviate stack
4. **PostCompact enrichment** -- after compaction, re-inject consolidated knowledge briefing

### Conceptual (inform future architecture decisions)

5. **Multi-dimensional salience** -- extend K-LEAN scoring beyond single Q-value
6. **Metabolic states as context modes** -- extend hull integrity to change behavioral parameters
7. **Hybrid failure reflection** -- combine our catalog-based approach with SAGE-style gradient trust decay

---

## Sources

All claims cite specific files from the dp-web4/SAGE repository (accessed 2026-03-28 via GitHub API):

- [README.md](https://github.com/dp-web4/SAGE/blob/main/README.md) -- project overview, architecture diagram, fleet status
- [sage/docs/SYSTEM_UNDERSTANDING.md](https://github.com/dp-web4/SAGE/blob/main/sage/docs/SYSTEM_UNDERSTANDING.md) -- complete architecture description (18KB+)
- [sage/docs/UNIFIED_CONSCIOUSNESS_LOOP.md](https://github.com/dp-web4/SAGE/blob/main/sage/docs/UNIFIED_CONSCIOUSNESS_LOOP.md) -- 12-step loop specification
- [CHANGELOG.md](https://github.com/dp-web4/SAGE/blob/main/CHANGELOG.md) -- feature history and defensive trust model
- [STATUS.md](https://github.com/dp-web4/SAGE/blob/main/STATUS.md) -- honest assessment (March 2026)
- [sage/core/dream_consolidation.py](https://github.com/dp-web4/SAGE/blob/main/sage/core/dream_consolidation.py) -- DREAM state pattern extraction
- [sage/core/pattern_library.py](https://github.com/dp-web4/SAGE/blob/main/sage/core/pattern_library.py) -- cryptographic pattern provenance
- [sage/core/adaptive_weights.py](https://github.com/dp-web4/SAGE/blob/main/sage/core/adaptive_weights.py) -- adaptive objective weighting
- [sage/core/expert_reputation.py](https://github.com/dp-web4/SAGE/blob/main/sage/core/expert_reputation.py) -- context-dependent expert trust
- [sage/attention/sleep_consolidation.py](https://github.com/dp-web4/SAGE/blob/main/sage/attention/sleep_consolidation.py) -- sleep consolidation bridge
- [dp-web4/snarc README.md](https://github.com/dp-web4/snarc/blob/main/README.md) -- SNARC Claude Code plugin
- [sage-site-murex.vercel.app](https://sage-site-murex.vercel.app/) -- interactive explainer site

Status: COMPLETE
