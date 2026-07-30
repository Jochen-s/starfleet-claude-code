---
name: bridge-briefing
description: "5-officer multi-perspective deliberation for architecture, risk, and major feature decisions. Use for significant design choices that benefit from diverse viewpoints."
tags: [quality, architecture, review, deliberation]
---

# /bridge-briefing — Bridge Senior Staff Deliberation

Multi-perspective quality gate using 5 Star Trek bridge officer personas. Each officer evaluates a proposal from their domain expertise, then officers discuss and vote.

## Arguments

- `/bridge-briefing "<proposal>"` — Quick mode (individual assessments only, ~3,000 tokens)
- `/bridge-briefing --full "<proposal>"` — Full mode (assessments + 3 discussion rounds + vote, ~9,100 tokens)
- `/bridge-briefing --file <path>` — Assess a plan/design document

## Effort Profile Gating

**Before any mode**: Read `~/.claude/cache/current-effort-profile.json`. If missing, assume `standard`.

- `/effort quick` — Disabled. Respond: "Bridge Briefing requires standard or thorough effort."
- `/effort standard` — Quick mode only. If user requests `--full`, respond: "--full mode requires `/effort thorough` (~9K tokens). Switch effort first."
- `/effort thorough` — All modes. Auto-suggest for architecture decisions.

## Phase 0 — Intelligence Gathering

Before spawning officers, gather relevant context:

1. **Knowledge Graph**: Use `mcp__memory__search_nodes` to find entities related to the proposal keywords
2. **Active Context**: Read `CLAUDE-activeContext.md` in the project root for current session state
3. **Prior Decisions**: Search for related `.bridge/briefings/*.md` files to avoid re-litigating settled decisions

Compile a "briefing packet" (~500 tokens max) summarizing relevant prior decisions and context. This packet is included in each officer's prompt.

## Phase 1 — Individual Assessment (parallel)

Spawn 5 `general-purpose` subagents via the Task tool, one per officer. Each receives:
- The proposal text
- The briefing packet from Phase 0
- Their officer profile (from `~/.claude/skills/bridge-briefing/officers/{role}.md`)

Each officer outputs a structured assessment:

```
OFFICER: {name}
VERDICT: ENGAGE | ENGAGE WITH CAUTION | ALL STOP | CAPTAIN'S CALL
SCORE: {0-100}
CONFIDENCE: {0.0-1.0}

KEY CONCERNS:
- B-{NNN}: [S0-S3] {concern 1}
- B-{NNN}: [S0-S3] {concern 2}

Severity scale: S0=Critical (blocks deploy), S1=High (should fix), S2=Medium (recommend), S3=Low (suggestion).

QUESTIONS FOR OTHER OFFICERS:
- {question for specific officer}

RECOMMENDATION:
{1-2 sentence recommendation}
```

All 5 officers run in parallel. Collect all results.

## Phase 2 — Discussion (Full mode only, 3 rounds)

Only runs when `--full` flag is present.

For each round:
1. Compile all officer assessments and prior round responses
2. Send to each officer: "Here are the other officers' assessments. Respond to concerns directed at you. Challenge assessments you disagree with. Update your score and verdict if warranted."
3. Officers respond with updated positions
4. Summarize movement between rounds

**Early exit**: If all 5 officers agree on verdict after any round, skip remaining rounds.

## Phase 3 — Final Vote + Resolution

Collect final verdicts from all officers.

### Verdict Mapping

| Condition | Verdict |
|-----------|---------|
| 5-0 or 4-1 approve | **ENGAGE** |
| 3-2 approve | **ENGAGE WITH CAUTION** |
| 3-2 or worse reject | **ALL STOP** |
| Tie or unresolvable | **CAPTAIN'S CALL** |

### Output Format

```markdown
## Bridge Briefing — {timestamp}

**Proposal**: {summary}
**Mode**: {Quick / Full (N rounds)}
**Verdict**: {ENGAGE / ENGAGE WITH CAUTION / ALL STOP / CAPTAIN'S CALL}

### Officer Assessments

| Officer | Score | Confidence | Verdict |
|---------|-------|------------|---------|
| Chief Engineer | {score} | {conf} | {verdict} |
| Science Officer | {score} | {conf} | {verdict} |
| Tactical Officer | {score} | {conf} | {verdict} |
| Operations Officer | {score} | {conf} | {verdict} |
| Communications Officer | {score} | {conf} | {verdict} |

### Findings
| ID | Concern | S | Officer(s) | Action |
|----|---------|---|------------|--------|
| B-001 | {description} | S1 | {who} | {recommendation} |

### Must-Fix Checklist
> Items at S0/S1 that require attention before proceeding.
- [ ] B-001: {one-line summary}

### Recommendations
{Merged recommendations, prioritized by officer agreement}

### Dissenting Views
{Any minority opinions with reasoning}
```

## Persistence

Save briefing results to `.bridge/briefings/{YYYY-MM-DD-HHmm}-{slug}.md` in the project root. Create `.bridge/briefings/` directory if needed.

## Notes

- Officer profiles in `~/.claude/skills/bridge-briefing/officers/` define scoring weights, red flags, and characteristic phrases
- Quick mode: ~3,000 tokens, 5 parallel API calls
- Full mode: ~9,100 tokens, 7-10 API calls
- Always-on overhead: ~100 tokens (skill metadata only)
