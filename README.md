# Starfleet Claude Code

"Hull integrity at 65%."

Say that out loud. Your brain gets it instantly.

Now try: "Context utilization ratio 0.65 exceeding amber threshold."

Same information. Wildly different cognitive load. That difference is the design philosophy of this entire project.

I built a Star Trek-themed toolkit for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Your agent gets a bridge crew, red team warriors, cost auditors, strategic intelligence operatives, expert personas from history's greatest minds, and self-healing behavioral patterns. It becomes self-aware of its own resource usage, learns from its mistakes across sessions, and can summon entire factions of specialist reviewers with a single slash command.

32 skills. 32 lifecycle hooks. 6 factions. 5 self-governing behavioral patterns. MIT-licensed. Open source.

Is it a serious engineering project? Yes. Is the Star Trek theming part of the engineering? Also yes.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Compatible-green.svg)](https://docs.anthropic.com/en/docs/claude-code)

> **Voice Mode**: Want your agent to speak? See [Claude Code Voice](https://github.com/Jochen-s/claude-code-voice) for local TTS/STT with swappable engines and voice profiles.

### What You Get

- **Self-aware context management**: hull integrity monitoring, metabolic states, automatic context shedding under pressure
- **Multi-faction review**: 6 factions with different mandates (security, cost, strategy, quality, expertise, learning) via `/fleet-command`
- **Persistent behavioral learning**: instincts that survive across sessions, decay when stale, and inject into subagents
- **Hook-based enforcement**: 32 lifecycle hooks that monitor, protect, and optimize. ~35ms overhead per action
- **Supply chain defense**: protect-secrets hook blocks credential theft, pip/uv config hijacking, and exfiltration attempts
- **32 slash commands**: from quick security reviews to full fleet deployments to autonomous optimization loops

**Requires**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) + Node.js 18+ (hooks are JavaScript)

---

## Why This Exists

Claude Code is remarkably capable out of the box. But after hundreds of hours working with it across production projects, I kept hitting the same four walls.

**The agent doesn't know it's running out of room.** Claude Code has a context window, a finite amount of working memory. When it fills up, the system compacts: summarizes, discards context, and the agent loses track of what it was doing. I watched agents spiral into confusion at 70% context usage, re-reading files they'd already analyzed, looping on the same error. No warning. No adaptive behavior. So I added both.

**Single-perspective review misses entire categories of bugs.** A security reviewer catches injection vulnerabilities but ignores cost implications. A performance reviewer optimizes hot paths but introduces API design problems. In my testing, a single-pass review (even a thorough one) consistently missed issues that a second reviewer with a different mandate would catch immediately.

**Behavioral lessons don't survive between sessions.** The agent learns something useful on Tuesday. "Always check for null before calling `.startsWith()`." By Wednesday? Same mistake. Same fix. There was no mechanism for lessons to persist, decay when they go stale, or get injected into subagents that weren't around when the lesson was learned.

**Subagents ignore permission boundaries.** When you tell a research agent "only read files, don't modify anything," that's an instruction it can choose to ignore. So I built a PreToolUse hook that blocks unauthorized tool calls before they execute. Defense-in-depth that doesn't rely on the agent following instructions.

This project addresses each of these failures with concrete solutions developed over 25+ sessions of iterative development. Star Trek gives complex engineering concepts a vocabulary your brain already knows how to process. When the hull integrity monitor reports Amber status, you immediately understand: pay attention. When it goes Red, things are getting serious. When it hits Critical... well, you know exactly what Captain Picard would do.

The faction system maps directly to real review perspectives: security (Klingon), strategy (Romulan), cost (Ferengi), quality (Federation). The metaphors earn their keep.

---

## Design Philosophy

Five principles. When in doubt, I chose the option that best satisfies these.

### 1. The agent should be aware of its own resources

An agent that doesn't know it's running out of context window is like a starship that doesn't monitor hull integrity. By the time you notice the problem, you've already lost key state. The hull integrity system, instruction surface measurer, and metabolic state machine all exist to give the agent situational awareness about its own operational limits.

### 2. Multiple perspectives catch more than one

A single reviewer operating under a single mandate produces blind spots by construction. The faction system isn't about having *more* reviewers. It's about having reviewers with *fundamentally different objectives*. A Klingon warrior reviewing for security vulnerabilities and a Ferengi merchant auditing token costs will flag completely different concerns about the same code.

Cross-faction corroboration (when two factions independently flag the same issue) is the strongest signal I've found.

### 3. Hooks should be invisible until they're not

Every hook runs in under 50ms. No network calls during startup. No LLM invocations in the hot path. The agent should feel exactly like vanilla Claude Code during normal operation. Hooks only become visible when they have something worth saying: "hull at 65%, consider wrapping up" or "this file has high fragility, three people have changed it in the last week."

### 4. Lessons should persist, decay, and self-correct

A behavioral lesson ("always read a file before editing it") should survive across sessions. But it should also decay if it hasn't been validated recently. Stale instincts crowd out fresh ones. And it should be injectable into subagents that weren't around when the lesson was learned. The instinct system handles persistence via markdown files, decay via time-based confidence reduction, injection via the SubagentStart hook, and outcome tracking via the action logger.

### 5. Fail open, never crash

A hook that crashes blocks the entire agent pipeline. Every hook in this system wraps its logic in try-catch and exits 0 regardless of what happens. A corrupted cache file or a malformed JSON payload: handled with graceful degradation, not crashes. The agent is never worse off for having hooks installed.

---

## What's Inside

| Component | Count | What It Does | Cost |
|-----------|-------|-------------|------|
| **Skills** | 32 | Slash commands: faction reviews, expert personas, security scans, release pipeline, autonomous loops, research sweeps, knowledge hygiene | On-demand only |
| **Hooks** | 32 | Lifecycle scripts that monitor, protect, optimize, and remember. Gated by effort profile | ~35ms per action |
| **Hook Libs** | 13 | Shared modules: resilience, scoring, classification, gating, memory recall | Loaded by hooks |
| **Agents** | 2 | Reusable subagent profiles with defined capabilities | Per-invocation |
| **Instincts** | 15 | Confidence-scored behavioral rules that decay over time (grows with use) | Subagents only |
| **Scripts** | 6 | Knowledge capture, consolidation, utility scoring, citation verification, schema validation | On-demand |
| **Rules** | 2 | Always-on guidelines (risk classification, voice output) | Always-on |
| **Docs** | 23 | Deep-dive guides for each subsystem | Reference |
| **SAGE Patterns** | 5 | Self-governing behavioral patterns (see below) | Background |

---

## The SAGE Patterns

Five self-governing behavioral patterns that make the agent aware of its own resources and behavior. Clean-room reimplementations of concepts from [SAGE](https://github.com/dp-web4/HRM) (AGPL). Zero code was copied. Each pattern solves a specific, observed failure mode.

### Pattern 1: Identity Manifest

*"Who am I and what do I believe?"*

Claude Code loads instructions from multiple sources: global config, project config, local overrides, rules, memory files. When two sources conflict, there was no documented resolution order. The agent would sometimes follow global rules that a project had explicitly overridden.

A single document (`IDENTITY.md`) codifies the exact load order, priority rules, and behavioral constants. Project always overrides global. Local always overrides project. Certain invariants (hooks exit 0, writes are atomic, circuit breakers trip at 3 failures) are classified as Tier 0. They survive even when the context window is under maximum pressure.

**File**: `examples/IDENTITY.md.example`

### Pattern 2: Circular Buffer Memory

*"What have I been doing?"*

The agent has no short-term memory of its own actions. It can't detect that it's been reading the same file four times in a row, or that the last three edit attempts all failed.

A PostToolUse hook (`action-logger.js`) records every tool invocation to a rolling 50-entry buffer. Each entry captures what tool was used, what file was touched, what intent was detected, and whether it succeeded. Stored as newline-delimited JSON, capped at 32KB. Old entries roll off naturally. This is the foundation for FOCUS mode (Pattern 3), friction detection, and instinct outcome tracking (Pattern 5).

**Files**: `hooks/action-logger.js`, `hooks/lib/intent-classifier.js`

### Pattern 3: Metabolic State Machine

*"How should I adapt to pressure?"*

When the context window fills up, the agent doesn't change its behavior. It keeps loading full memory files, injecting all available context, consuming tokens at the same rate. Even when it's 10% away from forced compaction.

Four adaptive states change how the agent manages its context window:

| State | Trigger | What Changes |
|-------|---------|-------------|
| **NORMAL** | Default | All context loaded normally |
| **FOCUS** | 5+ consecutive same-intent actions | Only loads context matching current work |
| **CRISIS** | Hull Red or Critical + 3 consecutive failures | Stops all optional context injection |
| **RECOVERY** | Post-compaction hull drops below Red | Gradually restores context over 5 minutes |

FOCUS mode isn't about *less* context. It's about *more relevant* context. When you've been editing hooks for the last 5 actions, loading the SEO deployment guide is waste. CRISIS goes further: when the ship is in danger, non-essential systems shut down. RECOVERY prevents the agent from immediately re-loading everything after compaction, which would just trigger another compaction.

**Files**: `hooks/context-threshold-monitor.js`, `hooks/intent-context.js`

### Pattern 4: Multi-Axis Salience

*"Why is this file risky?"*

A single risk score (0.7) tells you a file is risky but not *why*. Is it risky because it changes frequently? Because it's new and untested? Because five different people have been editing it? The remediation is different for each.

Five labeled axes computed from git history:

| Axis | What It Measures | Why It Matters |
|------|-----------------|----------------|
| **Volatility** | Unexpected change rate vs. baseline | Files changing faster than normal often have active bugs |
| **Novelty** | How new the file is (< 7 days) | New files lack test coverage and institutional knowledge |
| **Coupling** | How many files change together | High coupling means changes here break things there |
| **Coverage** | Inverse of test coverage | Untested code hides bugs until production |
| **Contention** | Multiple authors + bug-fix frequency | Files with many hands and frequent fixes are fragile |

The fragility cache is pre-computed at session start (via git history analysis) so the per-action cost is a cache lookup, not a git query.

**Files**: `hooks/lib/fragility-scoring.js`, `hooks/fragility-cache-builder.js`, `hooks/fragility-hook.js`

### Pattern 5: Trust Tensor Decay

*"Are my instincts still valid?"*

Behavioral rules accumulate over time. Some go stale. The project switched to a CI pipeline, so local test runs are no longer the bottleneck. Without decay, stale instincts crowd out fresh ones and the agent wastes tokens following outdated advice.

Instincts lose effective confidence over time if they haven't been validated:

```
effective = min(raw_confidence, max(floor, raw - 0.05 * weeks_since_validated))
```

- **Decay rate**: 5% per week of non-validation
- **Floor**: 0.30 (instincts never fully vanish. They fade to suggestions)
- **Custom floors**: High-confidence instincts like "read before edit" can set a higher floor
- **Injection order**: Sorted by effective confidence, highest first

Fresh, frequently-validated instincts get priority. Stale ones fade but remain available if the agent encounters the relevant situation again.

**Files**: `hooks/instinct-decay.js`, `hooks/instinct-injector.js`

---

## The Faction System

### Why Factions?

Review quality depends on reviewer mandate, not just reviewer capability. A single reviewer asked to "review this code" produces a generalist assessment. Five reviewers, each asked to review from a specific angle, surface findings the generalist misses entirely.

The difference is stark. A Klingon security review of a webhook handler found an SSRF vulnerability that a general code review had missed across three iterations. A Ferengi cost audit of my hook system identified one hook loading 15KB of context on every tool call. Invisible to a quality reviewer. Obvious to a cost reviewer.

Each faction maps to a real category of review concern:

| Faction | Review Concern | Real-World Parallel |
|---------|---------------|---------------------|
| Federation | Quality, architecture, standards | Code review, design review |
| Klingon | Security, attack surface, exploits | Penetration testing, red team |
| Romulan | Strategy, hidden risks, opportunities | Architecture review, threat modeling |
| Ferengi | Cost, efficiency, ROI | Performance review, token audit |
| Holodeck | Deep domain expertise | Subject matter expert consultation |
| Borg | Learning, pattern extraction | Retrospective, knowledge management |

### Federation: Bridge Crew (Quality)

> "Make it so."

Five officers evaluate proposals from their domain expertise. The flagship quality gate: broad coverage from five complementary perspectives.

| Officer | Domain | They Catch |
|---------|--------|-----------|
| Chief Engineer | Engineering | Over-engineering, maintainability debt, performance traps |
| Science Officer | Science | Data integrity issues, edge cases, logical inconsistencies |
| Tactical Officer | Tactical | Security gaps, attack surface, defensive weaknesses |
| Operations Officer | Operations | Resource conflicts, scheduling issues, dependency risks |
| Communications Officer | Communications | API design flaws, UX problems, documentation gaps |

**Invoke**: `/bridge-briefing "proposal"` or `/bridge-briefing --full "proposal"` (with deliberation rounds)

Why five officers? I tried three (too few perspectives), seven (diminishing returns, high token cost), and five hit the sweet spot. The key is that each officer has a genuinely different mandate, not five slightly different flavors of "code quality."

### Klingon Empire: Red Team (Security)

> "Today is a good day to die." Not your production server.

Three warriors who generate adversarial review from an attacker's perspective. Their findings are framed as an attacker would frame them: exploit paths, not checklists.

| Warrior | Attack Specialty |
|---------|-----------------|
| Worf | Perimeter defense, input validation, authentication bypass |
| Martok | Infrastructure, privilege escalation, lateral movement |
| Gowron | Social engineering, logic bombs, trust boundary violations |

**Invoke**: `/klingon-review` or `/klingon-review --file <path>`

Checklists catch known vulnerability classes. Adversarial review catches the interaction between components: the SSRF that only manifests when the webhook handler passes user input to the URL builder, which neither component's individual review would flag. This is prompt-based review, not automated security scanning. It complements static analysis tools and professional penetration testing. It does not replace them.

### Romulan Star Empire: Strategic Intelligence

> "The Tal Shiar demands thoroughness."

Not code-level review. Strategic analysis for decisions, architectures, and plans. Three operatives who specialize in seeing what you're trying not to see.

| Operative | Strategic Specialty |
|-----------|-------------------|
| Shinzon | Long-term positioning, strategic dependencies |
| Sela | Deception detection, hidden assumptions, blind spots |
| Tomalak | Opportunity scouting, competitive gaps, untapped potential |

**Invoke**: `/romulan-intel "strategy"` or `/romulan-intel --file <plan>`

"Is this code correct?" and "Should we be building this at all?" are fundamentally different questions. The Romulan operatives ask the second one. They've caught architectural decisions that were technically sound but strategically wrong: building a custom solution when a library existed, optimizing a component that was about to be replaced.

### Ferengi Alliance: Cost Optimization

> "Once you have their money, never give it back." Rule of Acquisition #1

Three merchants who audit your token spend and find waste. Caching opportunities, redundant context loading, unnecessary LLM calls. ROI on every optimization.

| Merchant | Cost Specialty |
|----------|---------------|
| Quark | Cost discovery: finds where tokens are being spent |
| Rom | Cache optimization: identifies missed caching opportunities |
| Nog | ROI analysis: calculates return on proposed changes |

**Invoke**: `/ferengi-audit` or `/ferengi-audit --session`

Token usage is invisible by default. I discovered one hook was injecting 15KB of context on every single tool call. Quality reviewers never flagged it. The context was *correct*, just expensive. The Ferengi caught it in their first pass. Over 200 tool calls in a session, that's 3MB of wasted context.

### Holodeck Division: Expert Personas (Deep Expertise)

> "Computer, activate program."

Eight historical and fictional expert personas for deep domain-specific analysis. Where factions organize by *allegiance*, the Holodeck organizes by *intellectual methodology*.

| Expert | Domain | Best For |
|--------|--------|----------|
| Socrates | First-principles questioning | Vague requirements, inherited designs |
| Sherlock Holmes | Deductive reasoning | Debugging, post-incident analysis |
| Sun Tzu | Strategic positioning | Build vs buy, migration planning |
| Leonardo da Vinci | Cross-domain synthesis | Architecture, structural parallels |
| Marie Curie | Scientific method | Performance claims, test design |
| Ada Lovelace | Algorithmic thinking | Algorithm review, computational limits |
| Richard Feynman | Simplification, BS detection | Over-engineering, documentation |
| Grace Hopper | Pragmatic engineering | Legacy constraints, deployment blockers |

**Invoke**: `/holodeck "topic"` (auto-routes) or `/holodeck --expert feynman "topic"` or `/holodeck --panel "topic"` (2-3 experts)

Each persona carries a distinctive analytical tradition. Feynman's insistence on simplification produces different insights than Lovelace's focus on algorithmic elegance. Every persona is a prompt engineering technique that reliably activates a specific mode of analysis.

### Fleet Command: Orchestrator

> "All hands, battle stations."

Composes factions into unified fleet assessments. Handles quorum rules, confidence normalization, cross-faction corroboration, and structured debates.

| Mode | Factions | Token Cost |
|------|----------|-----------|
| `quick` | Federation + 1 relevant | ~7,500 |
| `standard` | Federation + Klingon + Ferengi | ~14,000 |
| `holodeck` | Federation + Holodeck council | ~12,000 |
| `full` | All 6 factions | ~32,000 |
| `debate` | 2-3 factions, structured rounds | ~20,000 |

Token estimates are prompt overhead only (skill files + persona prompts). Add reviewed artifact size on top. A `standard` review of a 200-line file typically runs 20,000-28,000 combined tokens. Measured against Claude Sonnet as of 2026-Q1.

**Invoke**: `/fleet-command standard "topic"`

Raw faction outputs use different scales (Klingon severity ratings, Ferengi ROI percentages, Romulan confidence scores). Fleet Command normalizes these to a unified 0-1 scale, applies quorum rules (Federation is mandatory: if it fails, the operation aborts), and detects cross-faction corroboration. When Klingon and Ferengi independently flag the same concern, that signal is stronger than either alone.

### The Borg Collective: Learning

> "Resistance is futile."

Not a review faction. The Borg assimilates patterns across all knowledge sources (correction logs, observation queues, session learnings, quality gate usage) into consolidated memory. It reads the learning queues that accumulate during normal work, clusters them by theme, and promotes recurring patterns into instinct files or persistent memory entries. The automated retrospective engine. Turns repeated mistakes into behavioral rules that prevent the same mistake from happening again.

**Invoke**: `/borg-assimilate`

---

## Memory & Knowledge System

> "What is a man but the sum of his memories? We are the stories we tell ourselves." -- Shinzon

### The Problem Nobody Talks About

Your agent learns something on Tuesday. "The Qdrant payload field is `data`, not `memory`." By Wednesday? Same wrong assumption. Instincts handle behavioral patterns, but factual knowledge (the kind that comes from debugging sessions and research sprints) evaporates the moment the session ends.

The community's instinct is "put it in CLAUDE.md." But CLAUDE.md has a 150-line attention ceiling. Twenty debugging lessons later, the agent can't follow its own instructions because they're buried in a wall of context it can't attend to.

I needed a fundamentally different architecture.

### How It Works

Three knowledge layers feed into an auto-recall engine that injects relevant knowledge on every conversation turn, without anyone asking for it:

| Layer | What It Stores | How It Gets There | How It Comes Back |
|-------|---------------|-------------------|-------------------|
| **Synaptic Pathways** (K-LEAN) | Factual knowledge, debugging lessons, patterns | Auto-captured on compaction + manual `/kln:learn` | TF-IDF keyword scoring per turn |
| **Mnemonic Core** (mem0/Qdrant) | Entity relationships, service configs, people | mem0 MCP auto-extraction | Entity signal detection + text search |
| **Blind Spot Library** | Domain-specific warnings the agent consistently misses | Curated from incident analysis | Keyword trigger matching |

The auto-recall hook fires on every user message, scores all three layers against your query, and injects the top 3 most relevant entries as context. The agent sees what it needs to remember before it has a chance to forget.

### Layer 1: Synaptic Pathways (K-LEAN)

K-LEAN is a per-project knowledge base stored as newline-delimited JSON. Each entry is a structured insight with confidence, utility scores, and cross-references:

```json
{
  "id": "qdrant-payload-field",
  "title": "Qdrant mem0 payload field name",
  "insight": "The mem0 Qdrant collection uses 'data' not 'memory' as the payload field",
  "keywords": ["qdrant", "mem0", "payload"],
  "confidence": 0.9,
  "memory_layer": "consolidated",
  "utility_score": 0.72,
  "salience_score": 0.85
}
```

**Two paths in, one path up.** Entries arrive through two channels:
1. **Auto-capture** (`memory_layer: "raw"`, 0.8x scoring weight): The PreCompact hook extracts learnings from conversations before compaction. Provisional. The agent thought they mattered, but they haven't been validated.
2. **Manual capture** (`memory_layer: "consolidated"`, 1.5x scoring weight): Explicit `/kln:learn "topic"` creates entries you've decided are worth keeping. These get priority.

**Decision provenance (V3.4).** Entries of type `decision` can carry four additional fields: `decision_type` (architectural, tactical, policy, quality-gate), `causal_chain` (IDs of entries that led to this decision), `supersedes` (ID of the entry this replaces), and `valid_until` (expiry date for automatic re-evaluation). All optional. Enables "why did we decide X?" traversal without searching session transcripts.

**Consolidation promotes the worthy.** A 4-pass pipeline (`klean-consolidate.py`) runs periodically:
1. **Duplicate detection**: Union-Find clustering by keyword and title overlap
2. **Staleness removal**: entries older than 90 days, below 0.4 confidence, superseded, or past `valid_until` expiry
3. **Abstraction**: clusters of 3+ similar entries become a generalized principle
4. **Enrichment**: auto-fills cross-references between related entries

Entries referenced in another decision's `causal_chain` get a utility boost. If someone cited your work, you proved useful.

Entries surviving all four passes get promoted from `raw` to `consolidated`, permanently earning the 1.5x scoring bonus. Knowledge that proves its worth rises. Knowledge that doesn't fades gracefully.

**Retrieval uses TF-IDF weighted scoring.** Each entry's keywords, title, and insight text are scored against the user's message. IDF weights ensure rare, specific terms ("Qdrant") rank higher than common ones ("config"). Precise retrieval without embeddings or vector search.

### Layer 2: Mnemonic Core (mem0/Qdrant)

For entity relationships ("which VPS runs which service," "who maintains which MCP," "what credentials go where"), keyword scoring isn't enough. You need semantic entity matching.

mem0 runs as an MCP server backed by a local Qdrant instance. It stores entity relationships extracted automatically from conversations. The auto-recall system queries it only when **entity signals** are detected in the user's message: references to specific services, infrastructure, tools, or named resources.

Why conditional activation? Entity queries cost more than keyword searches. If your message is "fix the CSS bug," there's no entity to look up. If your message mentions "the staging VPS," the entity layer activates and surfaces relevant service configurations. Selective activation keeps per-turn latency under 200ms.

### Layer 3: Blind Spot Library

Some knowledge doesn't fit "facts I've learned." It fits better as "mistakes this class of agent consistently makes." The blind spot library is a curated set of domain-specific warnings: supply-chain attack vectors in npm/pip, encoding traps on Windows (cp1252 vs UTF-8), MCP servers that hang without timeout, API rate limits that agents routinely ignore.

Each blind spot has:
- **Trigger keywords**: minimum 2 must match to fire
- **Confidence score**: decays over time (configurable: slow/medium/fast)
- **Expiry**: 180-day auto-expiry prevents stale warnings
- **Failure mode**: what goes wrong if the warning is ignored

Blind spots are curated, not auto-generated. They represent patterns where the agent has repeatedly failed despite having the relevant knowledge. The gap between knowing and doing.

### The Auto-Recall Engine

The crown jewel. A `UserPromptSubmit` hook that scores all three layers and injects the best matches before the agent begins thinking:

```
User message arrives
    |
    v
Tokenize (remove stop words, require 3+ meaningful words)
    |
    v
Score K-LEAN entries (TF-IDF + memory layer bonus)
Score mem0 entities (only if entity signals detected)
Score blind spots (keyword trigger match + confidence decay)
    |
    v
Deduplicate (entries already seen this session are skipped)
Apply SKILL0 internalization (10+ retrievals = 80% score reduction)
Check injection budget (max 1000 tokens/turn, shared across hooks)
    |
    v
Inject top 3 results as additionalContext
Log retrieval hits (closes the feedback loop)
```

**Session dedup** prevents the same entry from appearing twice in 15 minutes. **Injection budget** ensures auto-recall doesn't crowd out other context sources. **Retrieval logging** tracks which entries are actually surfaced, enabling utility scoring and internalization.

### SKILL0 Internalization: When Knowledge Becomes Instinct

Inspired by the SKILL0 preprint (arXiv:2604.02268), which proposes that language models internalize frequently-practiced skills into their weights. I can't fine-tune Claude, but I apply the same principle at the harness level: **entries retrieved 10+ times without correction get an 80% score reduction.**

The intuition: if the agent has been told "the Qdrant field is `data`" ten times and never made the mistake again, it probably doesn't need an eleventh reminder. The entry doesn't vanish. It fades to a whisper, making room for knowledge the agent actually still needs. If the agent makes the mistake again, the correction-capture system creates a new entry and the cycle restarts.

### The Feedback Loop

Every auto-recall hit is logged with entry ID, score, timestamp, and session ID. This closes multiple feedback loops:

1. **Utility scoring** uses retrieval frequency to weight entry value
2. **Consolidation** uses retrieval counts to identify orphaned knowledge (never retrieved = candidate for removal)
3. **SKILL0 internalization** uses hit counts to fade over-retrieved entries
4. **Salience analysis** compares retrieval rate against confidence to detect knowledge the agent needs but doesn't trust

A knowledge system that captures, retrieves, matures, and eventually internalizes. A crude but functional approximation of how human expertise develops from explicit rules into unconscious competence.

---

## Standalone Skills

### Experiment Loop: Autonomous Optimization

> "Computer, run the sequence again. Vary the parameters."

Iteratively mutates a single file to optimize a measurable metric. Each iteration: edit, evaluate, keep-or-discard. Git commits preserve improvements. Runs in a disposable worktree so the main repo is never touched.

**Invoke**: `/experiment-loop "minimize sort time" --file src/sort.py --metric "python3 bench.py" --direction lower`

Why disposable worktrees? Branch isolation alone doesn't prevent side effects from test commands, lockfiles, or environment state. The worktree is created fresh, used for experiments, and destroyed when done. If the agent crashes mid-experiment, the worktree persists for recovery but the main repo is untouched.

Adapted from [karpathy/autoresearch](https://github.com/karpathy/autoresearch). Hardened through 3 rounds of adversarial review (3 critical, 14 warnings resolved).

### Deep Research: Long-Range Sensor Sweep

> "Increase sensor resolution to maximum."

Decomposes a research question into 2-4 parallel sensor bands, dispatches one agent per band, monitors completion, rescues stuck agents, and synthesizes findings into a unified report.

**Invoke**: `/deep-research "topic"` or `/deep-research "topic" --thorough`

A single agent researching a broad topic tends to go deep on the first subtopic it finds and neglect the rest. Parallel bands ensure coverage: one agent investigates existing tools, another surveys community solutions, a third checks for academic research.

### Self-Correct: Tactical Assessment Protocol

> "All stop. Recalibrate sensors before we proceed."

A 5-phase pre-execution gate for tasks that combine investigation with implementation. Forces the agent to research first, propose a plan, then submit it for adversarial challenge before executing.

**Invoke**: `/self-correct "find and fix the webhook 500 errors"`

The most common failure mode in investigation+implementation tasks: the agent commits to a fix based on incomplete understanding. Self-Correct forces a Tactical Review (Phase 3) where an adversarial reviewer sees only the plan and the task description, never the files, so it can challenge assumptions without being anchored by the implementation.

---

## Hull Integrity System

The context window monitor uses Star Trek hull integrity theming to make resource limits intuitive:

| Hull State | Context Used | Agent Behavior |
|------------|-------------|----------------|
| **Green** | <25% | Normal operations |
| **Amber** | 25-32% | Checkpoint saved, advisory to capture learnings |
| **Red** | 33-37% | Full checkpoint, wrap current task, prepare for compaction |
| **Critical** | 38-40% | Blinking alert, compact NOW |
| **Autocompact** | 40%+ | System fires automatically (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40) |

These thresholds are calibrated for a **1M token context window** (Claude Max plan default). In my testing, agent coherence degrades above ~400K tokens, driven by attention dilution across too much context. The quality ceiling sits at 40% of the window (400K tokens), and autocompact fires there, giving the agent a wide operating range of high-quality output.

Configure via environment variable:

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40
```

**Different context window? Different thresholds.** The goal is always the same: autocompact at roughly 400K tokens, with warning tiers before that.

| Context Window | Quality Ceiling | Autocompact | Amber | Red | Critical |
|----------------|----------------|-------------|-------|-----|----------|
| **1M tokens** (Max plan) | 400K (40%) | `40` | 25% | 33% | 38% |
| **200K tokens** (Pro/default) | 160K (80%) | `80` (default) | 50% | 65% | 75% |

For 200K windows, the default 80% autocompact is already fine. 160K tokens is below the attention dilution threshold. You can use these hooks without changing `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`. The hull integrity thresholds in `context-threshold-monitor.js` are percentage-based and adapt automatically.

For 1M windows, **you must set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40`**. The default 80% would allow 800K tokens of context, well past the point where quality degrades.

Crossing logic ensures alerts fire only when a threshold is first crossed. Rate limits prevent alert fatigue: Amber every 5 minutes, Red every 3, Critical every 2.

---

## Quality Gate Ladder

Eight escalating review levels with objective triggers. Not every change needs the same scrutiny. A one-line typo fix doesn't need a five-faction fleet review.

| Level | Gate | Auto-Trigger | What Happens |
|-------|------|-------------|-------------|
| L1 | Self-check | Every change | Agent reviews its own work |
| L2 | Peer review | 3+ files changed | Fresh subagent reviews the diff |
| L3 | Opponent's view | Design choice made | Devil's advocate challenges assumptions |
| L4 | Klingon review | Auth/crypto/secrets touched | Full security red team |
| L5 | Fleet standard | 5+ files or user-facing change | Federation + Klingon + Ferengi |
| L6 | Fleet debate | 10+ files changed | Structured debate between factions |
| L7 | Fleet full | Architecture decision | All 6 factions review |
| L8 | Bridge full | Irreversible change | Full officer deliberation with 3 rounds |

Engineers consistently underestimate the review level their changes need. A "simple" auth change is Station 2 by definition. It touches security boundaries. The auto-triggers encode hard-won lessons about which changes need which level of scrutiny.

---

## The Hook Architecture

### Why Hooks?

Claude Code supports lifecycle hooks: scripts that fire on specific events (session start, before/after tool use, on subagent spawn). I use these as the nervous system of the entire toolkit. They're the only mechanism that can:

- **Run before a tool call executes** (PreToolUse): the subagent tool guard blocks unauthorized tools
- **Run after every action** (PostToolUse): the action logger maintains the circular buffer
- **Run at session start** (SessionStart): the fragility cache and instinct decay computations fire
- **Inject context into subagents** (SubagentStart): instinct injection happens here

Skills, rules, and CLAUDE.md are all instruction-based. They tell the agent what to do, but the agent can choose to ignore them. Hooks execute as external scripts with real consequences (blocking tool calls, injecting context, logging actions). Defense-in-depth: stronger than instructions alone, but not a hard security boundary.

> **Security note**: Hooks are reliability and quality mechanisms, not security boundaries. Don't rely on hooks as your only control for untrusted subagent operations. They complement Claude Code's built-in permission system. They don't replace it.

### Hook Taxonomy

With 32 hooks firing across 12 lifecycle events, not every hook needs to fire on every session. The taxonomy classifies each hook into one of four classes, and an effort-based gating system controls which classes fire:

| Class | Count | When It Fires | Examples |
|-------|-------|--------------|----------|
| **NEVER_GATE** | 10 | Always, regardless of effort profile | protect-secrets, subagent-tool-guard, loop-detector, failure-recovery |
| **QUALITY** | 13 | Standard and thorough profiles | auto-recall, context-threshold-monitor, annotation-injector, captain-log |
| **OBSERVABILITY** | 5 | Thorough profile only | action-logger, skill-usage-tracker, subagent-stop-tracker |
| **INFRASTRUCTURE** | 4 | Always (session lifecycle) | fragility-cache-builder, instinct-decay, instruction-surface-measurer |

> The full taxonomy (`hooks/lib/hook-taxonomy.json`) classifies 62+ hooks across a complete installation including companion projects (K-LEAN knowledge capture, voice, GSD project management). This repo ships the 32 core hooks.

**Effort profiles** let you trade hook overhead for speed:

| Profile | What Fires | Best For |
|---------|-----------|----------|
| **Quick** | NEVER_GATE + INFRASTRUCTURE + KLEAN | Fast iteration, simple tasks |
| **Standard** | + QUALITY | Normal development (default) |
| **Thorough** | + OBSERVABILITY | Complex changes, reviews, audits |

Set via `/effort quick`, `/effort standard`, or `/effort thorough`. Persists across the session.

**Injection budget coordination**: All hooks that inject context (auto-recall, intent-context, annotation-injector, post-compact-enrichment) share a budget of 1000 tokens per turn. If auto-recall consumes 600 tokens, the remaining hooks get 400. Prevents context flooding while ensuring the most relevant information wins.

The taxonomy lives in `hooks/lib/hook-taxonomy.json`, gating logic in `hooks/lib/hook-gate.js`. Unknown hooks always fire (fail-open). Missing taxonomy always fires (fail-open). The system degrades to "everything fires" rather than "nothing fires."

### Hook Inventory

| Hook | Event | Class | Purpose | Cost |
|------|-------|-------|---------|------|
| `protect-secrets.js` | PreToolUse | NEVER_GATE | Block credential theft, pip/uv hijacking, exfiltration | <5ms |
| `subagent-tool-guard.js` | PreToolUse | NEVER_GATE | Block unauthorized tools for named subagents | <5ms |
| `fragility-hook.js` | PreToolUse | NEVER_GATE | Per-file risk scoring + Station escalation | <5ms |
| `containment-field.js` | PreToolUse | NEVER_GATE | Edit scope restriction (advisory) | <5ms |
| `loop-detector.js` | PostToolUse | NEVER_GATE | Detect repetitive action patterns | <5ms |
| `instinct-injector.js` | SubagentStart | NEVER_GATE | Inject behavioral patterns into subagents | <20ms |
| `permission-logger.js` | PermissionRequest | NEVER_GATE | Security audit trail for permission prompts | <5ms |
| `pre-compact-retention.js` | PreCompact | NEVER_GATE | Capture critical state before compaction | <30ms |
| `post-compact-reinjector.js` | SessionStart | NEVER_GATE | Re-inject critical context after compaction | <30ms |
| `failure-recovery.js` | PostToolUseFailure | NEVER_GATE | Escalating recovery suggestions (3+ failures) | <5ms |
| `auto-recall.js` | UserPromptSubmit | QUALITY | 3-layer knowledge injection (K-LEAN + mem0 + blind spots) | ~200ms warm |
| `intent-context.js` | PreToolUse | QUALITY | Load relevant memory by detected intent | <20ms |
| `annotation-injector.js` | PreToolUse | QUALITY | Inject library gotchas with Context7 docs | <10ms |
| `bash-output-limiter.js` | PreToolUse | QUALITY | Cap Bash output to prevent context flooding | <5ms |
| `context-threshold-monitor.js` | PostToolUse | QUALITY | Hull integrity + metabolic state + fatigue signals | <15ms |
| `execution-ratio-monitor.js` | PostToolUse | QUALITY | Planning-vs-execution ratio alert | <5ms |
| `auto-fix-diagnostics.js` | PostToolUse | QUALITY | Auto-fix suggestions for common errors | <10ms |
| `failure-reflection.js` | PostToolUseFailure | QUALITY | Reflexion-pattern structured failure analysis | <5ms |
| `post-compact-enrichment.js` | PostCompact | QUALITY | SNARC dream-cycle knowledge re-injection | <30ms |
| `correction-capture.js` | Stop | QUALITY | Detect corrections + observations for learning | <30ms |
| `captain-log.js` | Stop | QUALITY | Generate session handoff document | <100ms |
| `success-trace-logger.js` | Stop | QUALITY | Archive winning traces for learning pipeline | <50ms |
| `done-criteria-check.js` | Stop | QUALITY | Compound task completion nudge | <10ms |
| `fragility-cache-builder.js` | SessionStart | INFRASTRUCTURE | Pre-compute fragility scores from git | ~600ms |
| `instinct-decay.js` | SessionStart | INFRASTRUCTURE | Confidence decay + stagnation detection | <30ms |
| `instruction-surface-measurer.js` | SessionStart | INFRASTRUCTURE | Count instruction lines, check budget | <30ms |
| `skills-index-builder.js` | SessionStart | INFRASTRUCTURE | Pre-filter skill routing surface | ~130ms |
| `action-logger.js` | PostToolUse | OBSERVABILITY | Rolling action buffer + friction detection | <10ms |
| `skill-usage-tracker.js` | PreToolUse | OBSERVABILITY | Skill invocation analytics | <5ms |
| `subagent-stop-tracker.js` | PostToolUse | OBSERVABILITY | Agent routing optimization data | <5ms |
| `notification-handler.js` | Notification | OBSERVABILITY | Log notifications to action buffer | <10ms |
| `config-change-handler.js` | ConfigChange | OBSERVABILITY | Warn when hook config changes (restart needed) | <5ms |

**Total per-action overhead**: ~35ms in standard profile (PreToolUse + PostToolUse hooks combined). Quick profile drops to ~15ms by skipping QUALITY hooks. SessionStart hooks (~790ms total) run once. Stop hooks fire asynchronously where possible.

### Failure & Recovery System

> "It is possible to commit no mistakes and still lose. That is not a weakness. That is life." -- Captain Picard

When tools fail, the system doesn't just log an error. It classifies the failure, reflects on what went wrong, and routes the agent toward the right recovery strategy.

**Named failure taxonomy** (8 types with recovery routing):

| Failure Type | Pattern | Recovery Route |
|-------------|---------|---------------|
| `missing-artifact` | File/directory not found | Check path, verify existence before retry |
| `wrong-path` | "old_string not found in file" | Re-read the file, match exact content |
| `permission-blocked` | Permission denied, access blocked | Check permissions, escalate to user |
| `verifier-failure` | Test/lint/type-check failure | Read error output, fix root cause |
| `tool-error` | Command not found, syntax error | Check tool availability, fix syntax |
| `timeout` | Operation timed out | Reduce scope, add timeout parameter |
| `encoding-error` | Encoding/decoding failure | Specify UTF-8 explicitly |
| `generic` | Unclassified | Check failure-reflections.jsonl |

**Reflexion pattern**: After 3+ repeated failures of the same type, `failure-reflection.js` generates a structured analysis: what failed, why it likely failed, what to try instead. Stored in `failure-reflections.jsonl` and surfaced before the agent retries. The Reflexion paper (Shinn et al., arXiv:2303.11366) showed agents that reflect on failures before retrying outperform those that don't (88% vs 67% on HumanEval). This hook applies the same intuition at the harness level.

**Cross-session pattern aggregation**: `failure-pattern-aggregator.js` groups failures by error signature across sessions. When 3+ occurrences of the same pattern accumulate, it surfaces as a systemic issue at session start. Individual incidents become actionable patterns.

**Success trace archival**: The inverse of failure tracking. When a session completes without corrections, `success-trace-logger.js` archives the tool sequence, files modified, and tasks completed. Over time, this builds a dataset of what works. The foundation for future routing optimization.

### Shared Libraries

Thirteen shared modules in `hooks/lib/` prevent code duplication:

| Library | Used By | Purpose |
|---------|---------|---------|
| `circuit-breaker.js` | All hooks | 3-failure cooldown with auto-retry after 30 minutes |
| `hook-gate.js` | All gated hooks | Effort-based gating + injection budget coordination |
| `hook-taxonomy.json` | hook-gate | Classification manifest for all hooks |
| `intent-classifier.js` | action-logger, intent-context | Classify agent intent from file paths and tool patterns |
| `fragility-scoring.js` | fragility-hook, fragility-cache-builder | 5-axis fragility computation from git history |
| `annotation-loader.js` | annotation-injector | Secure loading + validation of library gotcha annotations |
| `confidence-analyzer.js` | fleet-command, codex | 4-signal confidence scoring: explicit/linguistic/consistency/evidence |
| `supervisor.js` | fleet-command, away-team | Erlang OTP restart policies, circuit breaker, escalation |
| `blind-spots.json` | auto-recall | 8 curated domain-specific warnings with trigger keywords |
| `blind-spot-matcher.js` | auto-recall | Keyword matching with time-based confidence decay |
| `mem0-recall.js` | auto-recall | Entity recall from Qdrant via HTTP (conditional activation) |
| `redact-secrets.js` | protect-secrets, all hooks | Shared secret redaction (12 patterns: API keys, tokens, passwords, private keys) |
| `failure-pattern-aggregator.js` | instinct-decay | Cross-session failure classification and surfacing |

---

## Quick Start

See [INSTALL.md](INSTALL.md) for the full setup guide. The short version:

```bash
# 1. Clone
git clone https://github.com/Jochen-s/starfleet-claude-code.git
cd starfleet-claude-code

# 2. Create target directories
mkdir -p ~/.claude/{skills,hooks/lib,instincts,rules,agents}

# 3. Copy everything
cp -r skills/* ~/.claude/skills/
cp hooks/*.js ~/.claude/hooks/
cp hooks/lib/* ~/.claude/hooks/lib/
cp instincts/*.md ~/.claude/instincts/
cp rules/*.md ~/.claude/rules/
cp agents/*.md ~/.claude/agents/

# 4. Register hooks (BACK UP existing config first!)
cp ~/.claude/settings.json ~/.claude/settings.json.bak 2>/dev/null
cp examples/settings.json.example ~/.claude/settings.json
# If you have existing hooks/settings, MERGE, don't replace. See INSTALL.md

# 5. Restart Claude Code (hook config is read at session start)

# 6. Verify
# /bridge-briefing "test"
# If you see five officer roles, it works
```

> **Windows users**: Use Git Bash or WSL. PowerShell users: replace `~/.claude` with `$env:USERPROFILE\.claude`.
>
> **Coming from superpowers/GSD?** Your hook config must be merged, not replaced. See [INSTALL.md](INSTALL.md) for the merge procedure.

---

## Architecture

```
                         User
                           |
                      Claude Code
                           |
           +---------------+---------------+
           |               |               |
       CLAUDE.md        Rules          IDENTITY.md
       (defaults)     (always-on)     (load order)
           |               |               |
           +-------+-------+-------+------+
                   |               |
             SessionStart     SubagentStart
             hooks fire       instinct injection
                   |               |
           +-------+-------+      |
           |       |       |      |
       Measurer  Decay   Cache  Injector
       (budget)  (trust) (frag) (instincts)
                   |
    UserPromptSubmit -----> PreToolUse ---------> PostToolUse
    (auto-recall:           (context routing)     (action logging,
     K-LEAN + mem0 +        (fragility check)      hull monitoring,
     blind spots)           (tool guard)            failure reflection)
                            (annotation inject)
                   |
           - - - - - - - - - - - - - - - - - - -
           On-demand skills (invoked manually or by quality gate triggers):
           +------+------+------+------+------+
           |      |      |      |      |      |
       Federation Klingon Romulan Ferengi Borg  Holodeck
       (quality) (security)(strategy)(cost)(learn)(expertise)
           |      |      |      |      |      |
           +------+------+------+------+------+
                  |
             Fleet Command -----> Knowledge System
             (orchestrator)       (K-LEAN, mem0, blind spots)
```

---

## Lessons Learned

Hard-won insights from 25+ sessions of iterative development, fleet reviews, and adversarial debate.

### On Autonomous Agent Loops

- **Containment must be disposable, not just isolated.** Branch isolation alone doesn't prevent side effects from test commands, lockfiles, or env state. Use disposable worktrees with file allowlists.
- **Variance-aware scoring separates signal from noise.** Without a noise threshold, the loop discards real improvements that fall within measurement noise. Lock the baseline (median of 3 runs) and compute a variance threshold.
- **Git-as-state-management works beautifully** for single-file optimization. Each iteration is a commit, rollback is `git checkout`, crash recovery is built in.

### On Multi-Agent Review Systems

- **Blinded cross-examination prevents sycophancy.** When reviewers know which model produced which findings, they rubber-stamp based on perceived authority. Present findings as "Reviewer A" and "Reviewer B." Never reveal the model.
- **3 rounds is the sweet spot for adversarial debate.** Round 1 surfaces issues. Round 2 cross-challenges. Round 3 converges. More rounds produce diminishing returns.
- **Cross-faction corroboration is the strongest signal.** When Klingon security and Ferengi cost reviewers independently flag the same concern, that confidence is higher than either alone.

### On Hook Architecture

- **Every hook must exit 0.** A crashing hook blocks the entire agent. Circuit breakers (3 failures = 30-minute cooldown) are mandatory safety nets.
- **Atomic writes prevent partial reads.** Write to `.tmp`, then rename. State files that multiple hooks read concurrently need this.
- **SessionStart hooks must be fast (<50ms).** No network calls, no LLM queries. The fragility cache builder's git call (~0.6s) is the acceptable upper bound.
- **Rate limiting prevents alert fatigue.** The hull integrity monitor fires at most once per threshold crossing with minimum intervals between alerts.

### On Skill Design

- **Skills must be directories, not flat files.** The `name/SKILL.md` convention is enforced by Claude Code. Flat `.md` files silently fail to register.
- **User confirmation gates prevent runaway execution.** Every skill that dispatches agents or makes changes should have an explicit approval step.
- **Propose-only modes build trust.** `/experiment-loop --propose-only` lets users preview what the loop would try before committing to autonomous execution.

### On Context Management

- **The 150-line instruction ceiling is real.** Beyond ~150 lines of always-on instructions (CLAUDE.md, rules, MEMORY.md), the agent starts losing coherence on the instructions themselves. The instruction surface measurer enforces this budget.
- **Intent-based context routing beats always-on loading.** Loading all memory topics on every session costs tokens and dilutes attention. Loading only the topic matching the agent's current intent is dramatically more effective.
- **Dynamic shedding with auto-restore works.** Under extreme memory pressure, the system sheds lower-priority instructions (Tier 2 first, then Tier 1). When pressure subsides, the original content is automatically restored from a saved snapshot.

### On Memory & Knowledge

- **Auto-recall beats explicit retrieval every time.** When knowledge requires the agent to remember to search for it, it doesn't. The `UserPromptSubmit` hook that injects relevant K-LEAN entries automatically solved the "0% retrieval rate" problem overnight.
- **Two-layer scoring separates signal from noise.** Auto-captured entries (raw, 0.8x) are provisional. Manually captured entries (consolidated, 1.5x) are validated. The consolidation pipeline promotes worthy entries, giving the system a natural quality gradient without manual curation of every entry.
- **Internalization is the goal, not infinite recall.** Entries retrieved 10+ times without correction should fade. They've served their purpose. SKILL0-inspired score reduction prevents endlessly repeating knowledge the agent has already absorbed.
- **Injection budgets prevent context flooding.** Without a shared token budget across all auto-injection hooks, each hook optimizes locally and the agent drowns in context. The 1000 tokens/turn budget forces hooks to compete on relevance.

### On Hook Infrastructure

- **Classify hooks before you hit 20.** I reached 30+ hooks before adding a taxonomy. By then, quick tasks were paying the overhead of thorough tasks. Classifying into NEVER_GATE/QUALITY/OBSERVABILITY with effort-based gating was the single highest-ROI infrastructure investment.
- **Fail-open gating is non-negotiable.** Unknown hooks fire. Missing taxonomy fires. The system degrades to "everything fires" rather than "nothing fires." A new hook that doesn't fire is invisible. You'll spend hours debugging why it has no effect.
- **Named failure types enable routing.** "Tool failed" tells you nothing. "wrong-path: old_string not found" tells you to re-read the file. Named failures turn debugging from guesswork into pattern matching.

---

## Repository Structure

```
starfleet-claude-code/
|-- skills/                          # 32 slash commands
|   |-- bridge-briefing/             # Federation quality review (5 officers)
|   |-- klingon-review/              # Klingon security red team (3 warriors)
|   |-- romulan-intel/               # Romulan strategic intelligence (3 operatives)
|   |-- ferengi-audit/               # Ferengi cost optimization (3 merchants)
|   |-- holodeck/                    # Expert persona analysis (8 experts)
|   |-- fleet-command/               # Multi-faction orchestrator
|   |-- borg-assimilate/             # Learning and pattern extraction
|   |-- opponents-view/              # 10-dimension devil's advocate
|   |-- experiment-loop/             # Autonomous optimization loop
|   |-- deep-research/               # Parallel research orchestrator
|   |-- self-correct/                # Pre-execution adversarial gate
|   |-- effort-profile/              # Reasoning depth (quick/standard/thorough)
|   |-- evaluate/                    # Quick quality check (4 lightweight gates)
|   |-- reflect/                     # Apply captured learnings from corrections
|   |-- counselors-log/              # Observe and propose behavioral patterns
|   |-- doc-garden/                  # Knowledge hygiene scanner
|   +-- ...                          # 16 more (see CHANGELOG for full list)
|-- hooks/                           # 32 lifecycle hooks
|   |-- auto-recall.js               # 3-layer knowledge auto-injection
|   |-- action-logger.js             # Rolling buffer + friction detection
|   |-- context-threshold-monitor.js # Hull integrity + fatigue signals
|   |-- fragility-hook.js            # Per-file risk scoring
|   |-- instinct-decay.js            # Trust tensor + stagnation detection
|   |-- protect-secrets.js           # Supply chain defense
|   |-- failure-reflection.js        # Reflexion pattern analysis
|   |-- done-criteria-check.js       # Compound task completion
|   |-- success-trace-logger.js      # Winning trace archival
|   |-- permission-logger.js         # Security audit trail
|   +-- ...                          # 22 more (see Hook Inventory above)
|   +-- lib/                         # 13 shared modules
|       |-- hook-gate.js             # Effort-based gating + budget
|       |-- hook-taxonomy.json       # Hook classification manifest
|       |-- circuit-breaker.js       # Shared resilience pattern
|       |-- intent-classifier.js     # Intent detection
|       |-- fragility-scoring.js     # 5-axis scoring
|       |-- blind-spots.json         # Domain-specific warnings
|       |-- blind-spot-matcher.js    # Keyword trigger matching
|       |-- mem0-recall.js           # Entity recall from Qdrant
|       |-- failure-pattern-aggregator.js # Cross-session failure patterns
|       +-- ...                      # 4 more (annotation, confidence, supervisor, redact-secrets)
|-- scripts/                         # 6 standalone tools
|   |-- knowledge-capture.py         # K-LEAN entry creation (V3.4 schema)
|   |-- klean-consolidate.py         # 4-pass sleep-time consolidation + valid_until expiry
|   |-- klean-utility-update.py      # Q-value EMA scoring + causal_chain boost
|   |-- klean_shared.py              # Shared utilities for K-LEAN scripts
|   |-- klean-schema.json            # K-LEAN V3.4 JSON Schema
|   +-- verify-citations.py          # Research citation verification
|-- agents/                          # 2 reusable subagent profiles
|-- instincts/                       # 15 confidence-scored behavioral rules
|-- rules/                           # 2 always-on guidelines
|-- examples/                        # Template files for setup
|-- docs/                            # 23 deep-dive guides
|-- LICENSE                          # MIT
|-- INSTALL.md                       # Step-by-step setup guide
+-- ATTRIBUTION.md                   # Credits and sources
```

---

## Further Reading

The `docs/` directory contains deep-dive documentation for each subsystem:

| Document | Topic |
|----------|-------|
| [memory-system.md](docs/memory-system.md) | 3-layer auto-recall, K-LEAN, mem0, blind spots, SKILL0 internalization |
| [hook-infrastructure.md](docs/hook-infrastructure.md) | Hook taxonomy, effort-based gating, injection budget coordination |
| [failure-system.md](docs/failure-system.md) | Named failure taxonomy, Reflexion pattern, recovery routing |
| [architecture.md](docs/architecture.md) | Component overview and data flow |
| [hook-lifecycle.md](docs/hook-lifecycle.md) | Event lifecycle from session start to stop |
| [SAGE-Patterns-Guide.md](docs/SAGE-Patterns-Guide.md) | Detailed pattern explanations |
| [metabolic-states.md](docs/metabolic-states.md) | State machine transitions and integration |
| [fragility-system.md](docs/fragility-system.md) | 5-axis scoring and git analysis |
| [instinct-system.md](docs/instinct-system.md) | Decay, injection, and outcome tracking |
| [intent-classification.md](docs/intent-classification.md) | How context routing works |
| [quality-gates.md](docs/quality-gates.md) | The 8-level review ladder |
| [persona-guide.md](docs/persona-guide.md) | How to create faction personas |
| [writing-skills.md](docs/writing-skills.md) | Skill authoring tutorial |
| [annotation-system.md](docs/annotation-system.md) | Per-library gotcha injection |

---

## Contributing

Contributions welcome. Fork, branch, test with Claude Code, and open a PR.

Before writing a new hook, read [docs/hook-infrastructure.md](docs/hook-infrastructure.md) for taxonomy integration. Before writing a new skill, read [docs/writing-skills.md](docs/writing-skills.md). Before creating a new persona, read [docs/persona-guide.md](docs/persona-guide.md).

Core conventions: skills live in `name/SKILL.md` dirs, hooks exit 0, all state writes are atomic (temp + rename).

This project uses [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

For anything bigger than a bug fix, open an issue first to discuss the approach.

---

## Attribution

This project builds on ideas from 14 open-source repositories and 3 academic papers. Concepts were studied, repos were closed, and everything was reimplemented from scratch.

Clean-room reimplementation. This matters beyond principle. One upstream source (dp-web4/HRM for the SAGE behavioral patterns) uses an AGPL license. Zero code was copied. Only the behavioral concepts were studied and independently reimplemented.

Bruce Lee: "Absorb what is useful, discard what is not, add what is uniquely your own." Austin Kleon calls it stealing like an artist. Both were onto something my grandmother understood intuitively: generosity flows in every direction. You learn from others. You build something new. You give credit. You share it forward.

See [ATTRIBUTION.md](ATTRIBUTION.md) for full credits, lineage, and source links.

---

## Disclaimer

Star Trek, its characters, and all related marks are trademarks of **Paramount Global** (CBS Studios). This is an independent fan work. Not affiliated with, endorsed by, or sponsored by Paramount Global. No scripts, images, audio, or other copyrighted Star Trek content is reproduced here. The persona files are original creative writing inspired by the characters. See [ATTRIBUTION.md](ATTRIBUTION.md) for details.

## License

MIT. See [LICENSE](LICENSE).

Where's the feedback loop nobody's watching in your agent setup?

Clone it. Break it. Improve it. Tell me what you find.

Rock on folks 🤘🚀🤘
