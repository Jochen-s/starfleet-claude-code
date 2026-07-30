# Attribution

> "We are what we are, and we're doing the best we can. It is not for you to set
> the standards by which we should be judged." -- Captain Picard

This project stands on the shoulders of others. Proper credit matters.

---

## Community Plugins and Tools

| Source | What I Use | License | Link |
|--------|------------|---------|------|
| superpowers-marketplace (nichochar) | Workflow skills framework: brainstorming, writing-plans, TDD, verification-before-completion, systematic-debugging | MIT | [github.com/nichochar/superpowers](https://github.com/nichochar/superpowers) |
| pr-review-toolkit (nichochar) | Code review agent patterns | MIT | [github.com/nichochar/pr-review-toolkit](https://github.com/nichochar/pr-review-toolkit) |
| GSD (glittercowboy) | Project management workflow, task tracking, phase-based execution | MIT | [github.com/glittercowboy/gsd](https://github.com/glittercowboy/gsd) |

---

## Cherry-Picked Patterns (Clean-Room Reimplementations)

These patterns were studied from published repositories and reimplemented from scratch. No code was copied. Each implementation was written in a clean-room process: study the concept, close the source, write from the idea alone.

| Source Repo | Pattern Extracted | My Implementation | Notes |
|-------------|-------------------|-------------------|-------|
| [karanb192/claude-code-memory](https://github.com/karanb192/claude-code-memory) | Instinct file format: confidence-scored markdown behavioral rules | `instinct-injector.js`, `instinct-decay.js`, `instincts/*.md` | Clean-room. My format adds decay fields (`Last validated`, `Decay floor`), size caps (4KB/file, 20 file max), and symlink rejection. |
| [ravnltd/BlackKnight](https://github.com/ravnltd/BlackKnight) | Multi-reviewer pattern: multiple personas evaluating the same artifact | Bridge Briefing (5 officers), Klingon Review (3 warriors), Romulan Intel (3 operatives), Ferengi Audit (3 merchants) | Clean-room. I added output contracts, Fleet Command normalization, quorum rules, and structured debate mode. |
| [andrewyng/context-hub](https://github.com/andrewyng/context-hub) | Annotation loop: persistent agent notes that auto-inject on doc fetch | `annotation-injector.js`, `lib/annotation-loader.js` | Clean-room. I added Klingon security hardening (path traversal guard, symlink rejection, injection filter, rate limiting, dedup), metabolic state suppression, and Context7-specific integration. |
| [karpathy/autoresearch](https://github.com/karpathy/autoresearch) | Autonomous experiment loop: iterative file improvement against a measurable metric using git-as-state-management | `skills/experiment-loop/SKILL.md` | Clean-room. I added disposable worktree isolation (via Claude Code's `EnterWorktree`), locked baseline (median of 3 runs), variance-aware scoring, injection scanning, binary file rejection, metacharacter blocking, stagnation detection, crash recovery, and metabolic state integration. Hardened through 3 rounds of adversarial review (3 critical, 14 warnings resolved). |
| [altmbr/claude-research-skill](https://github.com/altmbr/claude-research-skill) | Parallel research orchestrator: decompose question into bands, dispatch agents, synthesize findings | `skills/deep-research/SKILL.md` | Clean-room Star Trek-themed reimplementation. I added sensor band calibration with user approval gate, stuck agent rescue (Phase 4), confidence-tagged synthesis, cross-band theme detection, and incremental write-after-search pattern. MIT original. |
| [dp-web4/HRM](https://github.com/dp-web4/HRM) | SAGE behavioral patterns: context-aware agent self-governance | 5 clean-room reimplementations (see below) | **AGPL original -- zero code copied.** Concepts studied, then independently implemented with different architecture, data structures, and control flow. |
| [Fr-e-d/GAAI-framework](https://github.com/Fr-e-d/GAAI-framework) | Friction logging, context bundle assembly, capability readiness verification | `action-logger.js` friction detection, `context-bundle-assembly.md` instinct, `capability-readiness.md` instinct | Patterns rated ADOPT via cross-model consensus review. Clean-room implementation -- friction detection uses different architecture (dirty-flag gated I/O, JSONL circular buffer). |
| [Hawksight-AI/semantica](https://github.com/Hawksight-AI/semantica) | Temporal validity pattern: `valid_from`/`valid_until` schema fields with write-gate ceiling | K-LEAN `valid_from`/`valid_until` schema extension, compact-time expiry filter, search-time temporal filter | Clean-room. Pattern studied from Semantica's semantic memory layer. I added write-gate ceiling (max 730 days), immutable `valid_from` at ingestion, and integration with existing K-LEAN search/compact pipeline. MIT original. |
| [skydeckai/hindsight](https://github.com/skydeckai/hindsight) | Per-turn auto-recall: inject relevant knowledge on every user message via UserPromptSubmit hook | `auto-recall.js`, retrieval hit logging, session dedup | Clean-room. Hindsight uses vector embeddings; I use TF-IDF keyword scoring with IDF corpus weights, 3-layer architecture (K-LEAN + mem0 + blind spots), SKILL0 internalization, and injection budget coordination. Different retrieval mechanism, different storage, different scoring. MIT original. |
| [fpytloun/mnemory](https://github.com/fpytloun/mnemory) | Two-layer memory scoring: distinguish auto-captured (provisional) from human-validated (trusted) knowledge | `memory_layer` field in K-LEAN V3.4 schema, two-layer scoring in `auto-recall.js` | Clean-room. Mnemory uses core/working memory distinction; I use raw/consolidated with numeric scoring multipliers (0.8x/1.5x) and a consolidation pipeline that promotes entries based on survival across 4 passes. MIT original. |
| [DigitalCreationsCo/claude-octopus](https://github.com/DigitalCreationsCo/claude-octopus) | Blind spot patterns: curated domain-specific warnings for known agent failure modes | `lib/blind-spots.json`, `lib/blind-spot-matcher.js` | Clean-room. Claude-octopus uses a different format and delivery mechanism. I added instinct-grade discipline (confidence, last_validated, failure_mode, decay_class), time-based confidence decay with 3 decay rates, auto-expiry (180 days), and minimum 2-keyword trigger threshold. |
| [A-EVO-Lab/a-evolve](https://github.com/A-EVO-Lab/a-evolve) | Graduated evolution scope: saturation advisory when behavioral pattern capacity nears limits | Saturation detection in `instinct-decay.js` (16+ instincts triggers 0.80+ confidence requirement) | Clean-room. A-evolve uses genetic algorithm-style evolution; I use a simpler capacity gate with curator approval. The concept of "evolution pressure increases as capacity fills" was the key insight. |
| [nicholasgriffintn/engram-memory](https://github.com/nicholasgriffintn/engram-memory) | Entity-based conditional recall: activate entity search only when entity signals detected in query | `lib/mem0-recall.js` entity signal detection, conditional Qdrant queries | Clean-room. Engram uses a full entity graph; I use regex-based entity signal detection with conditional activation to keep per-turn latency under 200ms. Different architecture, different storage (Qdrant vs custom). |
| [nicholasgriffintn/code-review-graph](https://github.com/nicholasgriffintn/code-review-graph) | AST-based structural blast radius: Tree-sitter parse for cross-file dependency impact | Installed as MCP server, complements empirical co-change fragility hook | Direct adoption as MCP. Provides structural (AST) blast radius that complements my empirical (git history) fragility scoring. Two independent signals are stronger than either alone. |
| [nicholasgriffintn/claude-bootstrap](https://github.com/nicholasgriffintn/claude-bootstrap) | Hook classification concept: categorize hooks by criticality for selective execution | `lib/hook-gate.js`, `lib/hook-taxonomy.json` (5 classes, 3 profiles) | Clean-room. Claude-bootstrap uses a simpler enable/disable toggle; I built a full taxonomy (NEVER_GATE/QUALITY/OBSERVABILITY/INFRASTRUCTURE/KLEAN) with effort-based gating profiles, injection budget coordination, and fail-open semantics. |

### Academic Research

Patterns studied from published research papers. No code was available to copy -- these are concept-level adaptations:

| Paper | Key Concept | My Implementation | Notes |
|-------|-------------|-------------------|-------|
| SKILL0 (arXiv:2604.02268, Biese et al.) | Skill internalization: frequently-practiced skills become implicit in model weights | SKILL0 internalization in `auto-recall.js`: entries retrieved 10+ times get 80% score reduction | Can't fine-tune Claude, so I apply internalization at the harness level. Entries fade when the agent has demonstrably absorbed the knowledge (no corrections after repeated exposure). Concept surfaced via Pascal Biese's LinkedIn analysis. |
| NL Harness (arXiv:2603.25723) | Artifact-backed verification: grounding verification in re-readable artifacts rather than recall | "Artifact-Backed Closure" protocol in `verification-before-completion` skill: IDENTIFY artifact, RE-READ it, STATE what was verified | Paper showed 47.2% improvement when verification is grounded in artifacts. I added 6 artifact types and 4 anti-pattern detection. |
| Meta-Harness (arXiv:2603.28052) | Meta-evaluation of evaluation harnesses: evaluator reliability varies by domain | Informed my evaluation methodology -- fleet reviews use cross-faction corroboration rather than single-evaluator scores | Selective adoption. The paper's finding that evaluators disagree 15-30% of the time validated my multi-faction approach. |

### Community Research

Patterns informed by community analysis and discussion:

| Source | What I Learned | How It Influenced This Project |
|--------|----------------|---------------------|
| Reddit r/ClaudeAI (7-layer token bug analysis) | 7 distinct token usage bug categories: binary counting, tool truncation, cache invalidation, model routing, conversation overhead, system prompt, compaction loss | Validated my existing mitigations (bash-output-limiter for Layer 4, hull integrity for Layer 7). Confirmed 93-94% cache hit rate is healthy. Windows PE32+ binaries NOT affected by Layer 1. |
| Anthony Alcaraz (LinkedIn, graph layers) | Thesis: knowledge graphs enable self-evolution, governance, and planning layers for agents | Evaluated against existing flat-file auto-recall. Decision: knowledge graph adds complexity without clear retrieval advantage for my use case. Code property graph (code-review-graph MCP) IS valuable for structural blast radius -- different purpose than entity graphs. |
| Pascal Biese (LinkedIn, SKILL0 analysis) | SKILL0 paper shows skills internalize into model weights with practice -- can this apply at the harness level? | Yes. I can't fine-tune, but confidence-gated injection achieves a functional equivalent: entries that have been surfaced 10+ times without correction get deprioritized, making room for knowledge the agent actually still needs. |

### SAGE Pattern Lineage

The SAGE (Situation-Aware Governance Engine) concept from HRM inspired five behavioral patterns. Each was reimplemented from scratch:

| SAGE Concept | My Implementation | Key Differences |
|-------------|-------------------|-----------------|
| Identity manifest | `IDENTITY.md` + `instruction-surface-measurer.js` | I added priority tiers (0-2), dynamic shedding, post-compaction auto-restore, and hook health checks. HRM used static configuration. |
| Circular buffer | `action-logger.js` + `lib/intent-classifier.js` | I added intent classification (15+ categories), topic extraction, session binding, outcome tracking for instincts, and GAAI-inspired friction detection (consecutive failures, edit churn, tool oscillation) with dirty-flag I/O gating. HRM used a simple action list. |
| Metabolic states | Integrated into `context-threshold-monitor.js` | Uses 4 states (NORMAL/FOCUS/CRISIS/RECOVERY) with self-healing timeouts, session binding, and cross-pattern integration. Different state machine topology from HRM. |
| Multi-axis salience | `lib/fragility-scoring.js` + `fragility-cache-builder.js` | Computes 5 named axes (volatility, novelty, coupling, coverage, contention) from git history. HRM used different dimensions. Additive to existing scoring, zero regression risk. |
| Trust tensor decay | `instinct-decay.js` + extended `instinct-injector.js` | Uses time-based decay (0.05/week) with configurable floors and outcome tracking. HRM used a different calibration mechanism. |

---

## Original Work

The following components are original to this project:

### Star Trek Persona System
- All officer persona files (Chief Engineer, Science Officer, Tactical Officer, Operations Officer, Communications Officer)
- All warrior persona files (Worf, Martok, Gowron)
- All operative persona files (Shinzon, Sela, Tomalak)
- All merchant persona files (Quark, Rom, Nog)
- All Holodeck expert persona files (Socrates, Holmes, Sun Tzu, Da Vinci, Curie, Lovelace, Feynman, Hopper) -- original characterizations mapping historical/fictional intellectual traditions to software analysis methodologies
- Star Trek-themed hull integrity system (Green/Amber/Red/Critical)
- Picard persona for voice output
- Counselor's Log structured journaling

### Holodeck Division
- Expert persona analysis skill with auto-routing, panel mode, and effort gating
- 6 named panels (First Principles, Investigation, Campaign, Synthesis, Full Inquest, Architecture Council)
- Integration with Fleet Command as 6th faction with qualitative-to-numeric confidence normalization

### Fleet Command Orchestrator
- Cross-faction confidence normalization (converting Klingon severity, Romulan confidence, Ferengi ROI, Holodeck qualitative, and Federation scores to a unified 0-1 scale)
- 6-faction deployment with Holodeck council integration in full mode
- Quorum rules (Federation mandatory, minimum faction thresholds per mode)
- Output contract validation (required fields per faction)
- Structured debate mode with 3 rounds (position, challenge, resolution)
- Cross-faction corroboration scoring (+0.1 per confirming faction)

### Quality Gate Ladder
- 8-level escalating review system with objective auto-triggers
- Level-to-skill mapping (L3 opponents-view through L8 bridge-briefing)
- File-count and change-type based auto-escalation

### Action Station Risk Classification
- 4-tier blast radius classification (Station 0-3)
- Failure-mode checklist for Station 2+
- Auto-escalation when answers are uncertain

### Hook Architecture
- Circuit breaker pattern (3 failures = 30-minute cooldown)
- Atomic write convention (temp + rename on all state files)
- 50ms per-action budget with graceful degradation
- Hook health check at session start (missing file detection)
- Session binding on all state (prevents cross-session contamination)

### Agent Annotation System
- Security hardening: path traversal guard (no dots), symlink rejection, 13 injection patterns, 4KB/80-line caps
- Rate limiting (5 injections/session) with session pruning
- Dedup via shared cache with `annotation:` namespace and 60-minute TTL
- Metabolic state CRISIS suppression
- Context7 `libraryId` extraction and mapping to annotation files

### Friction Detection System (GAAI-inspired)
- Automatic friction pattern detection in action-logger (3 patterns: consecutive-failures, edit-churn, tool-oscillation)
- Dirty-flag I/O gating -- friction log only read/written when patterns actually fire (~95% of calls skip I/O)
- Context bundle assembly instinct -- pre-load subagent prompts with files, specs, and known friction
- Capability readiness instinct -- verify understanding before implementation at phase boundaries

### Instinct System Extensions
- Trust Tensor Decay formula with configurable floors
- Instinct outcome tracking (positive/negative signal detection)
- CRISIS-mode suppression (no instinct injection during crisis)
- Rejection logging with size cap (64KB rotation)
- Effective score caching at session start

### Instruction Budget System
- 150-line attention ceiling with per-source breakdown
- Priority tiers (0 = never shed, 1 = shed at Critical, 2 = shed at Red)
- Dynamic shedding during memory pressure
- Auto-restore after compaction when hull returns to safe levels
- Metabolic-state-aware tier restoration (RECOVERY mode gates)

### Experiment Loop Containment System
- Disposable worktree isolation via Claude Code's `EnterWorktree`/`ExitWorktree`
- Locked baseline measurement (median of 3 runs with stddev calculation)
- Variance-aware scoring (changes within noise band are discarded)
- Stale worktree detection and user notification
- Binary file rejection and shell metacharacter blocking
- Case-insensitive injection pattern scanning (warning-only, non-blocking)
- Git baseline tagging for cumulative diff display
- Merge-back via temp file copy (avoids worktree state contamination)
- 3 circuit breakers: time budget, iteration cap, stagnation detection
- Crash recovery via persistent worktree with experiment-log.tsv

### Tactical Assessment Protocol (Self-Correct)
- 5-phase pre-execution gate: Sensor Scan, Plot Course, Tactical Review, Helm Correction, Engage
- Evidence-based planning with explicit assumption flagging
- Adversarial Phase 3 reviewer receives only plan + task description (never file contents)
- Disposition system: ACCEPTED/REJECTED/DEFERRED with corrections log
- Continuous outcome verification during execution with automatic rollback
- Optional cross-model check via `/codex opinion` (`--deep` flag)

### Captain's Log (Session Handoff)
- Stop event hook that generates HANDOFF.md from cache files
- Promise extraction from assistant responses (5 commitment patterns)
- Stale promise pruning (7-day TTL)
- Optional Obsidian vault digest with frontmatter (opt-in via env var)
- Safe project root validation (rejects writes inside `~/.claude/`)
- Degraded-mode fallback when cache files are corrupt

### Decision Scope Tagging
- `decisionScope()` function in captain-log that classifies decisions as project-scoped or global
- Heuristic-based classification using project name matching and keyword patterns
- `[project]`/`[global]` prefix in HANDOFF.md decision rendering
- Prevents cross-project decision anchoring when captain-log is used across multiple workspaces

### Instinct Failure Mode Classification
- `**failure_mode**` metadata field on all instinct files
- 7 failure mode categories: context-drift, scope-creep, security, system-integrity, waste, premature-action, vague-delegation
- Enables targeted instinct injection based on detected failure patterns
- Foundation for future failure-mode-aware instinct selection

### Post-Compaction Context Recovery
- SessionStart hook with `compact` matcher fires only after compaction events
- Re-injects hull integrity state, metabolic state, threshold crossings, active tasks
- Target: <500 tokens of critical context (every token counts post-compaction)
- Reads from cache files written by other hooks (session-checkpoint, metabolic-state, etc.)

### Execution Ratio Monitor
- Planning-vs-execution ratio tracking from action buffer
- Tool classification: planning (Read, Glob, Grep) vs execution (Edit, Write, Bash)
- Bash command heuristic: read-only patterns (ls, cat, echo) vs write indicators
- Triple-gate activation: minimum sample (15 calls), ratio threshold (80%), rate limit (5 min)
- Session-bound state with automatic reset on new session

### Auto-Recall Engine (v8)
- 3-layer scoring architecture: K-LEAN TF-IDF + mem0 entity recall + blind spot matching
- IDF corpus weighting for keyword precision without embeddings
- Session dedup with 15-minute TTL and 50-entry cap
- Injection budget coordination (1000 tokens/turn shared across all injecting hooks)
- Retrieval hit logging feedback loop (`auto-recall-hits.jsonl`)
- SKILL0 internalization: 80% score reduction for entries retrieved 10+ times

### Hook Taxonomy & Gating System (v8)
- 5-class taxonomy: NEVER_GATE, QUALITY, OBSERVABILITY, INFRASTRUCTURE, KLEAN
- 3 effort-based gating profiles: quick, standard, thorough
- Fail-open semantics: unknown hooks fire, missing taxonomy fires
- Injection budget coordinator with 30s TTL between turns

### Failure Intelligence System (v8)
- Named failure taxonomy: 8 types with priority-ordered classification
- Recovery routing: type-specific remediation strategies
- Cross-session pattern aggregation: 3+ occurrences surfaces systemic issues
- Success trace archival: winning sessions logged for routing optimization
- Fatigue signals: re-read ratio (30% threshold) and scope scatter (8 dir threshold) in hull integrity

### Knowledge Hygiene (v8)
- Doc-garden skill: scans memory, instincts, K-LEAN for staleness and decay
- K-LEAN V3.4 two-layer schema: raw (0.8x) vs consolidated (1.5x) scoring
- 4-pass consolidation with raw-to-consolidated promotion for surviving entries
- Stagnation detection: 15-session threshold triggers learning pipeline nudge

---

## Research Sources (Investigated, Not Adopted)

The following projects were researched via fleet review but not adopted as dependencies. Findings are documented in the project's dependency registry:

| Source | What I Learned | Why Not Adopted |
|--------|----------------|-----------------|
| [Hawksight-AI/semantica](https://github.com/Hawksight-AI/semantica) | Temporal validity, decision intelligence, conflict detection, reasoning engines, provenance | Temporal validity pattern extracted natively (see Cherry-Picked Patterns above); library itself not adopted due to Python/Node.js runtime split and LiteLLM version conflicts |
| [Anthropic Academy](https://anthropic.skilljar.com/) | Context engineering best practices, tool design patterns, multi-turn architecture | Not a library -- knowledge extracted to KB (27 entries) |
| [e2b-dev/deep-agents](https://github.com/e2b-dev/deep-agents) | Multi-level planning with temporal memory | Python, different execution model, overlaps existing planning |
| [karpathy/learnship](https://github.com/karpathy/learnship) | Continuous learning framework | Overlaps existing instinct system |
| [anthropics/jules](https://github.com/anthropics/jules) | Async background agent patterns | Different execution model (cloud-based) |
| [mllm-dev/dex](https://github.com/mllm-dev/dex) | Terminal-native IDE patterns | 4 patterns extracted to KB; full tool not needed |
| [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | Multi-agent research orchestrator | Python, overlaps deep-research skill |

---

## Star Trek Intellectual Property

Star Trek and all related marks, logos, and characters are the intellectual property of **Paramount Global** (CBS Studios, formerly ViacomCBS). This includes but is not limited to:

- **Character names**: Picard, Worf, Martok, Gowron, Shinzon, Sela, Tomalak, Quark, Rom, Nog, Data, Scotty, Riker
- **Historical/fictional figures** (Holodeck Division): Socrates, Sherlock Holmes, Sun Tzu, Leonardo da Vinci, Marie Curie, Ada Lovelace, Richard Feynman, Grace Hopper -- these are public domain historical figures and literary characters; their use here as software analysis personas is original creative work
- **Faction names**: United Federation of Planets, Klingon Empire, Romulan Star Empire, Ferengi Alliance, The Borg Collective, Holodeck (Star Trek concept)
- **Terminology**: Starfleet, Qapla!, Tal Shiar, Rules of Acquisition, hull integrity, red alert, make it so, holodeck
- **Episode/film quotes** used throughout documentation for flavor

### What this project does and does not contain

- **Does contain**: Original creative writing in persona files inspired by Star Trek characters; use of character names and faction names as thematic labels for software review perspectives; Star Trek quotes attributed to their characters.
- **Does not contain**: Reproduced scripts, screenplays, or episode dialogue beyond brief attributed quotes (fair use); Star Trek images, logos, audio, video, or other media assets; any content from Star Trek games, novels, or other licensed works.

### Legal basis

This project is an independent **fan work** using character names and terminology for **educational and entertainment purposes** in the context of software development tooling. It is **not affiliated with, endorsed by, or sponsored by Paramount Global**, CBS Studios, or any Star Trek rights holders.

The persona files (e.g., `warriors/worf.md`) are **original characterizations** -- they describe software review behaviors inspired by the characters, not reproductions of copyrighted character portrayals. Use of Star Trek names and terms constitutes **nominative fair use** for the purpose of identifying the cultural reference being made. Quotes are brief, attributed, and used for commentary -- consistent with fair use under 17 U.S.C. Section 107.

If any rights holder has concerns about this project's use of Star Trek intellectual property, please open a GitHub issue and I'll address it promptly.

---

## License Compatibility

| Component | License | Compatible with MIT? |
|-----------|---------|---------------------|
| This project | MIT | -- |
| superpowers-marketplace | MIT | Yes |
| pr-review-toolkit | MIT | Yes |
| GSD | MIT | Yes (community plugin, installed separately) |
| HRM (SAGE concepts) | AGPL-3.0 | N/A -- zero code copied, concepts only |
| autoresearch | MIT | N/A -- clean-room reimplementation |
| claude-research-skill | MIT | N/A -- clean-room reimplementation |
| claude-code-memory | MIT | N/A -- clean-room reimplementation |
| BlackKnight | MIT | N/A -- clean-room reimplementation |
| GAAI-framework | MIT | N/A -- clean-room reimplementation |
| Semantica | MIT | N/A -- clean-room pattern extraction |

All clean-room reimplementations were written without reference to original source code. The process for each:

1. Read the README and documentation to understand the concept
2. Close the repository
3. Implement from the idea, using my own architecture, data structures, and coding patterns
4. Review the result for accidental similarity (none found)

This clean-room process is documented in the project history for each SAGE pattern.

---

> "The acquisition of wealth is not the only measure of success."
> -- But proper attribution is. -- Captain Picard (probably)
