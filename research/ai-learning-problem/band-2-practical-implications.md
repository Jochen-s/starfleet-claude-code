# Band 2: Practical Implications of the AI Learning Problem

Research sweep mapping the Dupoux-LeCun-Malik (2026) framework to Claude Code / AI agent setups.

Paper: "Why AI systems don't learn and what to do about it" (arXiv:2603.15381, March 2026)

---

## 1. The Paper's Framework (Summary)

The paper proposes three subsystems for autonomous learning:

**System A (Observation Learning)**: Passive intake. Self-supervised predictive models (contrastive methods like BYOL/SimCLR, masked prediction like BERT, world models that learn environment dynamics). Extracts statistical regularities from data without requiring interaction. The "watch and learn" mode.

**System B (Active Learning)**: Learning through action. RL with intrinsic motivation (curiosity-driven exploration), goal-conditioned learning, imitation from demonstrations, trial-and-error. Generates its own learning signal through environmental interaction. The "try and learn" mode.

**System M (Meta-Controller)**: Hardwired orchestrator that routes between A and B. Uses "expected value of control" signals to determine when active learning is beneficial vs. passive learning. Allocates computational resources dynamically, scales task difficulty based on developmental progress, manages curriculum.

**Evo/Devo Optimization**: Two timescales. Evolutionary: optimizes core learning mechanisms (A/B architecture, motivation parameters, meta-control heuristics) across development. Developmental: within an individual lifetime, adapts curriculum difficulty and balances learning modes based on performance and uncertainty signals.

**Core criticism of LLMs**: Over-reliance on passive pretraining, lack of intrinsic motivation, no meta-control for learning mode selection, insufficient environmental grounding, no developmental curriculum progression.

---

## 2. Mapping to Existing Claude Code Setup

### What Already Exists (and what it maps to)

| Paper Concept | Existing Implementation | Assessment |
|---|---|---|
| System A (passive observation) | K-LEAN correction capture, borg-assimilate pipeline | Partial match. Captures corrections passively from session work, but no predictive model -- just append-only storage with retrieval |
| System B (active learning) | Agent dispatch with environment feedback (test runs, linting, type checks) | Partial match. Agents act, get feedback, adjust -- but no persistent RL signal or curiosity mechanism |
| System M (meta-controller) | Fleet Command (multi-faction review), quality gate escalation, effort profiles | Strong structural match. Routes between review modes, escalates based on signals (file count, risk level). But fixed heuristics, not learned |
| World model | Instinct system (behavioral predictions) | Weak match. Instincts predict "if X then Y fails" but are manually curated, not learned from data |
| Episodic memory | K-LEAN knowledge base, MEMORY.md, captain-log | Moderate match. Stores what happened and outcomes, but lacks Q-value scoring (which memories are actually useful?) |
| Curriculum | Strategy learner, effort profiles (quick/standard/thorough) | Weak match. Adjusts depth but not based on agent performance data -- user selects effort level |
| Inductive biases | Instinct injection system (17 validated patterns) | Strong match. Confidence-scored behavioral priors injected into all subagents. Closest analog to biological inductive biases |
| Evo/Devo | Instinct evolution (capture, validate, promote/demote via confidence) | Partial match. Instincts evolve over sessions (developmental) and the framework itself evolves (evolutionary), but both are manual |

### Gap Analysis

**Gaps where the setup is weakest:**

1. **No utility scoring on memories** -- K-LEAN stores everything equally. No mechanism to score which learnings actually improved outcomes (MemRL's Q-value insight)
2. **No active exploration** -- Agents never proactively try alternative approaches to discover what works better. They execute the plan given
3. **No predictive model of failure** -- Instincts describe past failures but don't predict new ones from patterns
4. **No automated curriculum** -- The system doesn't get harder tasks as it gets better. Effort level is manually set
5. **No self-generated training data** -- Unlike Roblox's exemplar extraction from 1.7M code review comments, the setup doesn't mine its own commit/review history for patterns
6. **No sleep-time consolidation** -- Between sessions, nothing processes and restructures learned context (Letta's "sleep-time compute" insight)

---

## 3. Genuinely New Ideas from the Research

### 3.1 Q-Value Scoring for Memory Retrieval (from MemRL)

**What**: Instead of pure semantic similarity for memory lookup, add a learned utility score. Each memory gets a Q-value tracking how often it led to successful outcomes.

**Implementation sketch**:
- K-LEAN entries get an additional `utility_score` field (float, 0.0-1.0)
- After a session where a K-LEAN entry was retrieved and used: if the task succeeded, increase score; if it failed despite the entry, decrease score
- Retrieval ranks by `(1-lambda) * similarity + lambda * utility_score`
- Simple exponential moving average update: `Q_new = Q_old + alpha * (reward - Q_old)`

**Cost**: Low. One new field, one update hook per session.

**Benefit**: Over time, genuinely useful learnings float to the top. Stale or misleading entries sink.

### 3.2 Experience Replay (from Nakajima, ALFWorld research)

**What**: Store full successful task trajectories (not just the learning extracted from them) and inject the most relevant one as an in-context example for similar future tasks.

**Implementation sketch**:
- When a multi-step task completes successfully, capture: task description, plan, key decisions, outcome
- Store as structured trajectory in a `trajectories/` directory
- At task start, retrieve the most similar past trajectory and inject as few-shot example
- This lifted ALFWorld performance from 73% to 93% in research

**Cost**: Medium. Storage grows, needs periodic pruning.

**Benefit**: Agents see "here is how a similar task was solved before" rather than just abstract rules.

### 3.3 Sleep-Time Memory Consolidation (from Letta)

**What**: Between sessions, a background process reviews accumulated memories and restructures them. Identifies contradictions, abstracts patterns, merges duplicates, demotes stale entries.

**Implementation sketch**:
- Scheduled job (daily or weekly) runs a consolidation pass
- Reads all K-LEAN entries accumulated since last consolidation
- Groups by topic, identifies overlapping/contradicting entries
- Generates consolidated summaries replacing 5-10 raw entries with 1-2 refined ones
- Flags entries that haven't been retrieved in N sessions for deprecation review
- Already partially exists as `/borg-assimilate`, but could be automated and more aggressive

**Cost**: Medium. Needs a scheduled trigger and careful merge logic.

**Benefit**: Prevents memory bloat. Keeps entries sharp and relevant. Letta's core insight: "appending raw experience is a poor approximation of learning."

### 3.4 Reflection-on-Failure with Persistent Storage (from Reflexion)

**What**: When a task fails, generate a structured reflection on why, and persist it so the same mistake is never repeated.

**Implementation sketch**:
- On task failure (test fails, review rejection, rollback needed), trigger reflection
- LLM generates: what went wrong, root cause hypothesis, what to do differently
- Store in `failure-reflections/` alongside the failed trajectory
- At task start, check for matching failure reflections and inject as "avoid this" context
- Heuristic trigger: if agent takes same action 3+ times with same result, force reflection

**Cost**: Low. Already partially exists in `/kln:rethink` but not automated or triggered by failure signals.

**Benefit**: Prevents repeat failures. Reflexion achieved 88% on HumanEval (vs 67% without) using this approach.

### 3.5 Self-Generated Exemplar Mining (from Roblox)

**What**: Mine the project's own git history and review comments to extract recurring patterns and promote them to the knowledge base.

**Implementation sketch**:
- Periodic pipeline reads git log for patterns: which files are frequently modified together, which commits get reverted, which PR comments repeat
- Cluster similar feedback themes across sessions
- Surface candidates for human review and KB promotion
- Roblox extracted learnings from 1.7M code review comments this way, doubling AI code acceptance

**Cost**: High initial build, low ongoing.

**Benefit**: The system learns from its own history rather than just from explicit user corrections.

### 3.6 Skill Learning with Portable Memory (from Letta)

**What**: When an agent solves a novel problem, extract the approach as a reusable "skill" file. Skills are portable across sessions, agents, and even model versions.

**Implementation sketch**:
- After successful task completion, run a skill-extraction pass: "What reusable pattern was applied here?"
- Generate a markdown skill file with: approach, common pitfalls, verification strategy
- Store in skills library, tagged by domain
- Future agents query skills library at task start
- Letta reports 36.8% relative improvement from skill learning

**Cost**: Medium. Needs quality gate to prevent skill proliferation.

**Benefit**: Knowledge compounds. Skills transfer across model upgrades (Letta: "memories outlast any single model").

### 3.7 Adaptive Meta-Control Signals (inspired by System M)

**What**: Instead of fixed quality gate escalation rules, learn which review level actually catches issues for which types of changes.

**Implementation sketch**:
- Log every quality gate invocation: level used, type of change, whether issues were found
- After N sessions, analyze: "For file-rename operations, L5 review never found issues -- skip it. For auth changes, L4 caught 3 bugs in 5 invocations -- always escalate."
- Gradually refine the escalation heuristics based on actual outcome data
- This is the System M idea applied to the quality gate pipeline

**Cost**: Low (logging) + Medium (analysis pipeline).

**Benefit**: Less review overhead for low-risk work, more scrutiny where it matters. The system learns its own risk profile.

---

## 4. Patterns Already Implemented vs. Genuinely New

### Already Have (keep and refine)

1. **Episodic memory** (K-LEAN) -- works, needs utility scoring
2. **Inductive biases** (instincts) -- strong implementation, confidence-scored, injected into subagents
3. **Multi-mode orchestration** (Fleet Command, quality gates) -- structural System M analog
4. **Passive correction capture** (hooks, borg-assimilate) -- basic System A analog
5. **Active agent dispatch** (subagents with environment feedback) -- basic System B analog
6. **Developmental instinct evolution** (confidence tracking, validation cycles)

### New Ideas Worth Implementing

**High priority (low cost, high value):**
1. Q-value utility scoring on K-LEAN entries
2. Automated failure reflection with persistent storage
3. Adaptive meta-control signals for quality gates

**Medium priority (medium cost, high value):**
4. Sleep-time memory consolidation (automate borg-assimilate)
5. Skill extraction from successful task completions
6. Experience replay (full trajectory storage and retrieval)

**Lower priority (high cost, speculative value):**
7. Self-generated exemplar mining from git history
8. Curiosity-driven exploration (proactively trying alternatives)

---

## 5. The Deeper Insight

The Dupoux-LeCun-Malik paper's most transferable idea is not any single mechanism but the **meta-architecture**: a system that knows which learning mode to use when.

Current Claude Code setups are almost entirely System A (passive observation, correction capture). System B (active exploration) barely exists. System M (meta-control) exists structurally (quality gates, effort levels) but is entirely heuristic-driven, not learned.

The practical frontier is:
- Adding utility signals to memory (making System A smarter)
- Adding failure reflection and trajectory replay (bridging A and B)
- Making meta-control adaptive rather than fixed (evolving System M)

None of this requires model weight updates. Following Letta's insight, all of this operates in token space: updates to learned context, not parameters. This is the key affordance that makes the framework practical for Claude Code setups today.

---

## Sources

- [Dupoux, LeCun, Malik - Why AI systems don't learn and what to do about it (arXiv:2603.15381)](https://arxiv.org/abs/2603.15381)
- [MemRL: Self-Evolving Agents via Runtime Reinforcement Learning on Episodic Memory](https://arxiv.org/abs/2601.03192)
- [A-MEM: Agentic Memory for LLM Agents (NeurIPS 2025)](https://arxiv.org/abs/2502.12110)
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [Lifelong Learning of LLM-based Agents: A Roadmap (TPAMI 2026)](https://arxiv.org/abs/2501.07278)
- [Letta: Continual Learning in Token Space](https://www.letta.com/blog/continual-learning)
- [Letta: Skill Learning for CLI Agents](https://www.letta.com/blog/skill-learning)
- [Letta: Rearchitecting the Agent Loop](https://www.letta.com/blog/letta-v1-agent)
- [Roblox: How We Doubled AI Code Acceptance](https://about.roblox.com/newsroom/2026/01/doubled-ai-code-acceptance-teaching-models-think-like-roblox-engineers)
- [Addy Osmani: Self-Improving Coding Agents](https://addyosmani.com/blog/self-improving-agents/)
- [Yohei Nakajima: Better Ways to Build Self-Improving AI Agents](https://yoheinakajima.com/better-ways-to-build-self-improving-ai-agents/)
- [ICLR 2026 Workshop on Recursive Self-Improvement](https://recursive-workshop.github.io/)
- [Multi-Agent Frameworks for Enterprise AI (2026)](https://www.adopt.ai/blog/multi-agent-frameworks)
- [Memory in the Age of AI Agents (Survey)](https://arxiv.org/abs/2512.13564)
- [6 Agentic Knowledge Base Patterns (The New Stack)](https://thenewstack.io/agentic-knowledge-base-patterns/)
- [ICLR 2026 MemAgents Workshop Proposal](https://openreview.net/pdf?id=U51WxL382H)
- [Contextual Experience Replay for Self-Improvement of Language Agents](https://arxiv.org/abs/2506.06698)

Status: COMPLETE
