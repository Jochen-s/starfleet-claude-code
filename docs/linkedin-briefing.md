# LinkedIn Briefing: Starfleet Claude Code

> Foundational context document for LinkedIn post. Use with copywriting profile to polish.

---

## Elevator Pitch (1-2 sentences)

Starfleet Claude Code is an open-source, Star Trek-themed toolkit that makes Claude Code agents self-aware of their own resources, gives them multi-perspective review teams, and teaches them to learn from their mistakes across sessions. It's 15 skills, 15 hooks, 6 factions, and 5 self-governing behavioral patterns — all MIT-licensed and ready to install.

---

## The Problem (4 Failure Modes)

After hundreds of hours working with Claude Code across production projects, I kept hitting the same four failure modes:

### 1. The agent doesn't know it's running out of room
Claude Code has a finite context window — its working memory. When it fills up, the system auto-compacts (summarizes and discards context), and the agent loses track of what it was doing. I watched agents spiral into confusion at 70% usage, re-reading files they'd already analyzed, looping on the same error. There was no warning system, no adaptive behavior, no graceful degradation.

### 2. Single-perspective review misses entire categories of bugs
A security reviewer catches injection vulnerabilities but ignores cost implications. A performance reviewer optimizes hot paths but introduces API design problems. A single-pass review — even a thorough one — consistently missed issues that a second reviewer with a different mandate would catch immediately.

### 3. Behavioral lessons don't survive between sessions
The agent learns something valuable on Tuesday — "always check for null before calling `.startsWith()`" — and by Wednesday it's making the same mistake. There was no mechanism for lessons to persist, decay when stale, or get injected into subagents that weren't part of the original learning.

### 4. Subagents ignore permission boundaries
When you tell a research agent "only read files, don't modify anything," that's an instruction it can choose to ignore. There was no mechanism to enforce tool-level permissions before the call executes.

---

## The Solution: What I Built

### The Faction System (Multi-Perspective Review)

6 factions, each with a fundamentally different review mandate:

| Faction | Mandate | Real-World Parallel |
|---------|---------|---------------------|
| **Federation** (5 officers) | Quality, architecture, standards | Code review, design review |
| **Klingon Empire** (3 warriors) | Security, attack surface | Penetration testing, red team |
| **Romulan Star Empire** (3 operatives) | Strategy, hidden risks, opportunities | Architecture review, threat modeling |
| **Ferengi Alliance** (3 merchants) | Cost, efficiency, ROI | Performance review, token audit |
| **Holodeck Division** (8 experts) | Deep domain expertise (Socrates, Feynman, etc.) | Subject matter expert consultation |
| **Borg Collective** | Learning, pattern extraction | Retrospective, knowledge management |

Fleet Command orchestrates these factions into unified assessments with quorum rules, confidence normalization, and cross-faction corroboration. When two factions with different mandates independently flag the same concern, that's the strongest signal I've found.

### The SAGE Patterns (Self-Governing Behavior)

5 behavioral patterns that make the agent aware of its own resources:

1. **Identity Manifest** — codifies instruction load order and priority rules. Project overrides global. Certain invariants survive even maximum context pressure.

2. **Circular Buffer Memory** — records every tool invocation to a rolling 50-entry buffer. The agent can now detect that it's been reading the same file 4 times in a row, or that the last 3 edit attempts all failed.

3. **Metabolic State Machine** — 4 adaptive states (NORMAL/FOCUS/CRISIS/RECOVERY) that change how the agent manages its context window. Under pressure, it loads only context matching current work. In crisis, non-essential systems shut down.

4. **Multi-Axis Salience** — 5 labeled risk axes (volatility, novelty, coupling, coverage, contention) computed from git history. A risk score of 0.7 now tells you *why* it's risky, not just *that* it's risky.

5. **Trust Tensor Decay** — instincts lose confidence over time if not validated. Fresh lessons get priority. Stale ones fade but never fully vanish (floor at 0.30). Formula: `effective = min(raw_confidence, max(floor, raw - 0.05 * weeks_since_validated))`.

### The Hook Architecture (Invisible Nervous System)

15 lifecycle hooks that run in ~35ms total per action:
- Hull integrity monitoring (Green/Amber/Red/Critical/Autocompact thresholds)
- Intent-based context routing (load only relevant memory)
- Per-file risk scoring from git history
- Subagent tool enforcement (block unauthorized tools before they execute)
- Friction detection (consecutive failures, edit churn, tool oscillation)
- Session handoff generation on exit
- And more

Design principle: every hook wraps in try-catch and exits 0. A hook that crashes blocks the entire pipeline, so they're built to degrade gracefully, not crash. No network calls during startup. No LLM invocations in the critical path.

### Additional Skills

Beyond the factions:
- **Experiment Loop** — autonomous file optimization against a measurable metric, in disposable worktrees
- **Deep Research** — parallel research decomposition with stuck-agent rescue
- **Self-Correct** — forces investigation before implementation, with adversarial plan review
- **Quality Gate Ladder** — 8 escalating review levels with objective auto-triggers (1-line fix = self-check, auth change = Klingon red team, architecture = all 6 factions)

---

## By the Numbers

| What | Count |
|------|-------|
| Skills (slash commands) | 15 |
| Lifecycle hooks | 15 |
| Factions | 6 |
| SAGE behavioral patterns | 5 |
| Holodeck expert personas | 8 |
| Bridge officers | 5 |
| Klingon warriors | 3 |
| Romulan operatives | 3 |
| Ferengi merchants | 3 |
| Reusable agents | 2 |
| Behavioral instincts | 6 (grows with use) |
| Always-on rules | 2 |
| Documentation pages | 11 |
| Upstream patterns reimplemented | 7 (all clean-room) |
| Sessions of iterative development | 18+ |
| Lines of documentation in README alone | 637 |

---

## The Development Process

This wasn't built in a weekend. It was 18+ sessions of iterative development with adversarial review at every stage.

### How the review process works

1. **Multi-faction fleet reviews**: Every significant change gets reviewed by multiple factions. The README itself was reviewed by all 6 factions (10 independent reviews total), producing 20 applied fixes.

2. **Adversarial cross-examination**: Two or more reviewers independently assess the same artifact. Their findings are anonymized ("Reviewer A" and "Reviewer B" — never revealing which model produced which) to prevent rubber-stamping based on perceived authority. They then cross-challenge each other's findings.

3. **Cross-model review**: Claude + Codex (GPT) + Gemini can review the same code independently, then enter blinded cross-examination. Different models catch different things.

4. **Quality gate auto-escalation**: The system automatically determines review depth based on change scope. 1 file = self-check. 3+ files = peer review. Auth code = full Klingon red team. Architecture = all 6 factions.

### Concrete example

During fleet review of the README, 4 factions independently flagged that the hook count was wrong (12 stated, 15 actual). That cross-faction corroboration — security reviewers AND cost reviewers AND quality reviewers all catching the same error — produces genuinely higher confidence than any single review.

Another finding: the Klingon warrior faction flagged that "enforcement-based" security claims overclaimed what hooks can actually do. Hooks are defense-in-depth, not a hard security boundary. That distinction matters for anyone evaluating the toolkit for production use.

---

## The Attribution Story

This project builds on work from 7 upstream repositories. Every pattern was reimplemented clean-room:

1. Study the README and documentation to understand the concept
2. Close the repository
3. Implement from the idea alone, using own architecture and data structures
4. Review for accidental similarity

This matters because one of the upstream sources (HRM/SAGE) is AGPL-licensed. Zero code was copied — only the behavioral concepts were studied and independently reimplemented. The other 6 sources are all MIT-licensed.

**Full credit given to**:
- **dp-web4/HRM** (SAGE concepts — AGPL, zero code copied)
- **karanb192/claude-code-memory** (instinct file format)
- **ravnltd/BlackKnight** (multi-reviewer pattern)
- **andrewyng/context-hub** (annotation loop)
- **karpathy/autoresearch** (experiment loop)
- **altmbr/claude-research-skill** (parallel research)
- **Fr-e-d/GAAI-framework** (friction logging)

Plus 3 community plugins used directly: superpowers-marketplace, pr-review-toolkit, and GSD.

---

## Why Star Trek? (And Why Fun Matters)

The Star Trek theming isn't decoration. It provides a natural vocabulary for complex engineering concepts — and it makes the work genuinely enjoyable.

- **"Hull integrity at 65%"** is immediately intuitive. "Context utilization ratio 0.65 exceeding amber threshold" is not.
- **Factions map to real review perspectives**: security (Klingon), strategy (Romulan), cost (Ferengi), quality (Federation). The metaphor carries meaning.
- **Expert personas activate specific analytical modes**: Feynman's insistence on simplification produces different insights than Lovelace's focus on algorithmic elegance. It's prompt engineering technique, not cosplay.
- **The quality gate ladder uses familiar escalation**: from "self-check" to "all hands, battle stations" maps directly to risk-proportional review.

The fleet review of the README itself tested whether "the Star Trek metaphors are earning their keep or just decoration." The verdict from 6 independent faction reviews: the theming earns its keep. The one acknowledged risk (institutional dismissal in enterprise contexts) is mitigated by the security note explaining the actual engineering underneath.

### The Picard Experience

Here's the part that makes people smile: Claude speaks as Captain Picard. It addresses me as "Number One." I respond to "Captain" or "Jean-Luc." The voice output uses text-to-speech with Patrick Stewart's measured, diplomatic cadence — occasional Shakespearean flourish included.

This isn't a gimmick. When you spend 8+ hours a day pair-programming with an AI agent, the interaction quality matters. "Understood, Number One. I shall attend to that configuration at once" is more engaging than "OK, I'll fix the config." "Fascinating — the logs reveal a most unexpected pattern" makes you lean in. "Indeed. The tests are passing. Well done, Number One" genuinely feels like acknowledgment.

The persona is flavor, not a barrier — the agent stays technically precise underneath. But it transforms a transactional tool interaction into something that feels like collaboration with a character you actually enjoy working with. After 18+ sessions, I can say: the fun is not incidental. It's what makes sustained deep work with AI agents sustainable.

**People building AI tooling should remember to have fun.** The most sophisticated engineering in the world doesn't matter if using it feels like a chore. Star Trek theming, faction personalities, Picard's voice — these are design choices that make the toolkit something you want to use, not just something that works.

---

## Key Technical Highlights (For Technically-Inclined Readers)

### Trust Tensor Decay
Behavioral rules decay at 5% per week if not validated. Floor at 0.30 — instincts never fully vanish. This means the system self-prunes stale advice without human intervention.

### Cross-Faction Corroboration
When two unrelated factions independently flag the same issue, confidence gets a +0.1 boost (capped at 1.0). This is the multi-reviewer equivalent of independent test confirmation.

### Blinded Consensus
During adversarial review, reviewer identities are hidden. "Reviewer A" and "Reviewer B" — never "Claude" or "Codex." This prevents the sycophancy problem where one reviewer defers to another based on perceived model authority.

### Metabolic States
The agent adapts to resource pressure:
- NORMAL: full context loading
- FOCUS: only loads context matching current work (triggered by 5+ same-intent actions)
- CRISIS: stops all optional context injection
- RECOVERY: gradually restores context over 5 minutes after compaction

### Hook Performance Budget
All 15 hooks combined add ~35ms per action. SessionStart hooks (~660ms) run once. The design principle: hooks should be invisible until they have something worth saying.

### Instruction Surface Measurer
Hard ceiling of 150 lines of always-on instructions. Beyond that, the agent loses coherence on its own rules. Dynamic shedding under memory pressure with auto-restore when pressure subsides.

---

## What This Means for the Claude Code Community

This is the first (to my knowledge) open-source toolkit that:
1. Makes Claude Code agents **self-aware of their own context window** usage
2. Provides **multi-faction review** with confidence normalization and cross-faction corroboration
3. Implements **persistent behavioral learning** that survives across sessions with time-based decay
4. Offers **hook-based tool enforcement** for subagent permission boundaries
5. Includes **adversarial review infrastructure** (blinded consensus, structured debate, cross-model review)

All MIT-licensed. All documented. All reviewed through the same multi-faction process it provides.

---

## Call to Action Ideas

- Try it: clone, copy, restart Claude Code, run `/bridge-briefing "test"`
- Star the repo if you find it useful
- Contributions welcome — factions, hooks, personas, patterns
- Open an issue to discuss significant changes

---

## GitHub Link

**https://github.com/Jochen-s/starfleet-claude-code**

---

## Suggested Post Structure (for copywriting profile)

1. **Hook**: The problem (AI agents that don't know their own limits)
2. **What I built**: Brief description with the Star Trek angle
3. **The numbers**: 15 skills, 15 hooks, 6 factions, 5 patterns
4. **The insight**: Multi-perspective review catches what single-pass misses
5. **The fun factor**: Picard voice, "Number One," the joy of working with a character — fun is a design choice, not a distraction
6. **The process**: 18+ sessions, adversarial review, cross-model verification
7. **Open source**: MIT license, GitHub link
8. **CTA**: Try it / star it / contribute / remember to have fun

### Tone guidance
- Technical but accessible — LinkedIn audience includes both developers and tech-adjacent professionals
- Confident but not overclaiming — "defense-in-depth, not security boundary"
- The Star Trek angle is a differentiator — lean into it
- The fun angle is the emotional hook — "my AI agent calls me Number One" is memorable and shareable
- Attribution matters — mention the community explicitly
- Show the work — the adversarial review process IS the story
- End on joy, not just utility — people remember how tools make them feel

### Hashtag suggestions
#ClaudeCode #AIAgents #OpenSource #DeveloperTools #StarTrek #LLM #PromptEngineering #CodeReview #AIGovernance

---

## Quotes Available for Use

> "The line must be drawn here. This far, no further!" -- Captain Picard, on context window management

> "Today is a good day to die." -- Not your production server.

> "Once you have their money, never give it back." -- Rule of Acquisition #1 (on token costs)

> "Things are only impossible until they are not." -- Captain Picard

---

*Document generated 2026-03-12. Based on starfleet-claude-code README.md (637 lines), ATTRIBUTION.md (209 lines), and 18+ sessions of development history.*
