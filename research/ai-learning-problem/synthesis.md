# Long-Range Sensor Sweep: The Learning Problem of Deep Learning

**Date**: 2026-03-28
**Bands deployed**: 2
**Bands completed**: 2/2
**Total sources**: ~25 unique (arXiv papers, blog posts, research repos, news articles)

## Executive Summary

The Dupoux-LeCun-Malik paper (arXiv:2603.15381, March 2026) is a manifesto, not an algorithm. It proposes a System A (observation) / System B (action) / System M (meta-controller) architecture for autonomous learning, arguing that current AI "learning" is entirely outsourced to human expert pipelines. The paper carries weight (LeCun, Dupoux from Meta FAIR, Malik from Berkeley) and sits at the end of a debate chain: "Reward is Enough" (2021) -> "Scalar Reward is Not Enough" (2022) -> "Era of Experience" (Silver/Sutton, 2025) -> this paper. Its value is in framing, not implementation; there are no benchmarks, no ablations, no code. For our setup, the framework reveals that we are almost entirely System A (passive capture) with minimal System B (active exploration) and heuristic-only System M (fixed quality gates). Seven concrete patterns from adjacent research could close these gaps.

## Key Findings

1. The actual paper is arXiv:2603.15381 by Dupoux, LeCun, and Malik (March 16, 2026). Full HTML at arxiv.org/html/2603.15381v1. [HIGH]

2. System M (meta-controller) is the genuinely novel contribution. Systems A and B are reframings of self-supervised learning and RL respectively, but M as a hardwired orchestrator automating MLOps pipeline functions is new. It uses epistemic signals (confidence, prediction error, novelty), species-specific signals (face preference, gaze), and somatic signals (energy, stress). [HIGH]

3. The paper is a manifesto with zero implementation. No benchmarks, no training curves, no code. The Evo/Devo bootstrapping requires "millions of simulated lifecycles." This is basic research direction, not a product roadmap. [HIGH]

4. Drew McDermott's "Wishful Mnemonics" (1976) is NOT cited in the paper. Seiberth added it in his LinkedIn commentary. Valid addition: calling weight adjustment "learning" is textbook wishful mnemonics. [MEDIUM]

5. The Silver & Sutton reference is "Welcome to the Era of Experience" (April 2025). Both papers share the data wall diagnosis but differ on solutions: Silver/Sutton emphasize RL; Dupoux et al. add cognitive science meta-control. [HIGH]

6. Our setup maps to the framework: K-LEAN = episodic memory, instincts = inductive biases, Fleet Command = System M (but fixed heuristics), correction-capture = System A. Critical gap: no System B (active exploration), no utility scoring on memories, no automated curriculum. [HIGH]

7. Seven implementable patterns from adjacent research could close the gaps, ranked by cost/value: Q-value memory scoring, automated failure reflection, sleep-time consolidation, experience replay, self-generated exemplar mining, skill extraction, adaptive meta-control signals. [HIGH]

## Cross-Band Themes

### The "Learning" Misnomer
Both bands converge on the same insight: what we call "learning" in AI (and in our setup) is mostly "recording." K-LEAN appends entries. Instincts are manually promoted. Fleet reviews produce reports that accumulate. But nothing in the pipeline autonomously decides which recordings were useful, prunes what wasn't, or changes its own behavior based on outcomes. Band 1 traces this to the paper's core argument; Band 2 identifies concrete fixes.

### System M Already Exists in Our Fleet Architecture
Fleet Command, quality gate escalation, effort profiles, and the supervisor module all implement System M functions: routing between modes, escalating based on signals, circuit-breaking on failure. But all are fixed heuristics. The paper argues M should learn from its own outcomes. Band 2's "adaptive meta-control signals" pattern (3.7) is the direct application.

### Episodic Memory Needs Utility Scoring
Both bands identify that our K-LEAN is structurally episodic memory but lacks the key differentiator: knowing which memories are useful. The MemRL Q-value pattern (Band 2, 3.1) and the paper's emphasis on memory replay with value-weighted retrieval (Band 1) converge on the same solution.

## Contradictions and Tensions

### Is In-Context Learning "Real" Learning?
The paper dismisses ICL (prompting, RAG, tool use) as "minor variations" that don't constitute real learning. Critics argue this is too narrow: agents with memory, retrieval, and self-correction DO learn within a session, even without weight updates. Our setup is evidence of this tension; we learn across sessions via K-LEAN without any weight changes. The paper would classify this as "outsourced learning" but the practical effect is compounding knowledge.

### Manifesto vs. Implementation Gap
The paper's strength (cross-disciplinary synthesis, naming the problem) is also its weakness (no code, no benchmarks). Seiberth's article amplifies the diagnosis but doesn't bridge to practice. Band 2's practical patterns (Reflexion, MemRL, Letta sleep-time) fill this gap but are independent work, not from the paper.

## Research Gaps

- Seiberth's LinkedIn article could not be fetched directly (LinkedIn indexing lag for recent posts)
- The paper's Evo/Devo section needs deeper analysis for biological plausibility
- No direct comparison to existing continual learning frameworks (CLEAR benchmark, Avalanche library)
- The "data wall" claim's timeline is disputed; synthetic data and multimodal training may extend it

## Recommendations

1. **Adopt the System A/B/M framing as our architectural vocabulary.** It maps cleanly to what we already have and clarifies the gaps. System A = K-LEAN/correction-capture. System B = agent dispatch with environment feedback. System M = fleet command/quality gates/effort profiles.

2. **Implement Q-value utility scoring on K-LEAN entries.** Lowest cost, highest impact. Track which entries lead to successful outcomes and surface them preferentially. This is the single most impactful gap to close.

3. **Automate failure reflection.** When tasks fail, auto-generate structured "why it failed" notes and persist them. Already partially exists in `/kln:rethink` but should trigger automatically, not just when stuck 10+ minutes. Reflexion's 88% vs 67% improvement is compelling evidence.

4. **Schedule sleep-time consolidation.** The `/borg-assimilate` skill already does this manually. Automating a weekly consolidation pass (merge duplicates, flag stale entries, abstract patterns) would be the System M "sleep-time compute" equivalent.

5. **Do NOT attempt the full Evo/Devo framework.** The paper acknowledges this requires "millions of simulated lifecycles." It's basic research, not implementable. Take the practical patterns (Q-values, reflection, consolidation) and leave the grand architecture for academia.

## Band Reports

- [Band 1: Paper Analysis](band-1-paper-analysis.md) -- COMPLETE
- [Band 2: Practical Implications](band-2-practical-implications.md) -- COMPLETE

## Assimilation Priority Matrix

| # | Pattern | System | Cost | Evidence | Our Gap | Priority |
|---|---------|--------|------|----------|---------|----------|
| 1 | Q-value utility scoring on K-LEAN entries | A+M | Low | MemRL research | No utility differentiation | HIGH |
| 2 | Automated failure reflection | B | Low | Reflexion: 88% vs 67% | Manual only (/kln:rethink) | HIGH |
| 3 | Sleep-time consolidation (automated borg-assimilate) | M | Medium | Letta sleep-time compute | Manual borg only | MEDIUM |
| 4 | Experience replay (full trajectories as few-shot) | A | Medium | ALFWorld: 73% -> 93% | No trajectory storage | MEDIUM |
| 5 | Adaptive meta-control (learned quality gates) | M | Medium | System M concept | Fixed heuristics | MEDIUM |
| 6 | Self-generated exemplar mining from git history | A | High | Roblox: 2x acceptance | No git mining | LOW |
| 7 | Skill extraction from successful completions | A+B | Medium | Letta: 36.8% improvement | Already have /claudeception | LOW (partial) |
