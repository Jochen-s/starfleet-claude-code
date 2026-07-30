---
name: counselors-log
description: "Analyze observation and learning queues, cluster patterns, propose instincts with confidence scores, and suggest capability evolution when patterns cluster."
tags: [learning, self-improvement, patterns, evolution]
---

# /counselors-log — Pattern Analysis + Instinct Management

**Pipeline role**: Observation analyzer. Reads observations-queue.json and proposes instincts. For full cross-source analysis (all 5 learning sources including K-LEAN and knowledge graph), use `/borg-assimilate` instead.

Analyze captured observations and learnings. Cluster patterns by domain. Propose instincts (reusable behavioral rules) with confidence scoring. Suggest new skills/agents when 5+ instincts cluster.

## Arguments

- `/counselors-log` — Full analysis of both queues
- `/counselors-log --instincts` — List current instincts and their confidence levels
- `/counselors-log --evolve` — Check for evolution threshold (5+ instincts in a domain)

## Step 1: Read Queues

Read both queue files:
- `~/.claude/cache/learnings-queue.json` — corrections, preferences, positive feedback
- `~/.claude/cache/observations-queue.json` — tool patterns, error-fix patterns, style preferences

If both are empty or missing, output:
```
No observations or learnings to analyze. Work normally and the hooks will capture patterns.
```
Then stop.

## Step 2: Read Existing Instincts

Read all files in `.claude/instincts/` (project root) if the directory exists. These are previously approved instincts that should not be duplicated.

## Step 3: Group by Domain

Categorize each queue entry into one of these domains:
- **code-style** — formatting, naming, syntax preferences
- **testing** — test patterns, TDD practices, coverage
- **debugging** — investigation patterns, common fixes
- **tooling** — tool usage patterns, workflow preferences
- **architecture** — design patterns, structure decisions
- **deployment** — build, deploy, release patterns
- **communication** — response style, verbosity, explanation depth
- **security** — security-related patterns and practices

## Step 4: Cluster Analysis

For each domain with 3+ entries:

1. Identify the common theme connecting the entries
2. Propose an **instinct** — a reusable behavioral rule:

```markdown
### Proposed Instinct: {name}

**Domain**: {domain}
**Trigger**: "{when this situation occurs}"
**Action**: "{do this}"
**Confidence**: {0.3 = tentative, 0.5 = emerging, 0.7 = established, 0.9 = near certain}

**Evidence** ({N} observations):
- {observation 1 summary}
- {observation 2 summary}
- {observation 3 summary}

**Contradicts**: {existing instinct name, if any — flag for resolution}
```

3. Check against existing instincts for:
   - **Duplicates**: Same trigger + action → skip, note "already captured"
   - **Contradictions**: Same trigger, different action → flag for user resolution
   - **Refinements**: Same domain, more specific → propose as refinement of existing

## Step 5: Present for Approval

Show all proposed instincts grouped by domain. For each:
- Accept → write to `.claude/instincts/{domain}-{name}.md`
- Reject → discard
- Edit → user provides revised wording

**NEVER auto-apply. Always wait for explicit approval.**

## Step 6: Evolution Check

After processing, count instincts per domain (existing + newly approved):

If any domain has 5+ instincts:
```
COUNSELOR'S LOG: {N} instincts detected in "{domain}" domain.

Pattern: {summarize the common thread across instincts}

Suggested evolution:
- [ ] Create a "{domain}-protocol" skill encoding these patterns
- [ ] Create a "{domain}-reviewer" agent with domain expertise
- [ ] Add a "{domain}" section to CLAUDE.md (costs {N} instruction budget lines)

Which evolution, if any? [1/2/3/none]
```

If user selects an evolution, describe what would be created but do NOT auto-create it. Instead, output the recommended file contents for user review.

## Step 7: Clean Up Queues

Remove processed entries from both queue files:
- Entries that led to approved instincts → remove
- Entries that were rejected → remove
- Entries that didn't cluster (fewer than 3 in domain) → leave for future analysis

## Step 8: Summary

```markdown
## Counselor's Log — {date}

**Analyzed**: {N} observations + {N} learnings
**Domains with patterns**: {list domains with 3+ entries}
**Instincts proposed**: {N}
**Instincts approved**: {N}
**Evolution threshold**: {domain at 5+ or "none"}

### Active Instincts
| Domain | Count | Newest |
|--------|-------|--------|
| {domain} | {N} | {instinct name} |
```

## Instinct File Format

When writing instinct files to `.claude/instincts/`:

```markdown
---
domain: {domain}
confidence: {0.3-0.9}
created: {ISO date}
evidence_count: {N}
---

# {Instinct Name}

**Trigger**: {when condition}
**Action**: {what to do}

## Evidence
- {observation summaries}
```

## Notes

- Instincts are NOT injected into CLAUDE.md (budget protection)
- They live in `.claude/instincts/` and are consulted on demand
- `/reflect` also checks instincts for consistency when processing learnings
- Token cost: ~2,000-3,000 per invocation
- Always-on overhead: 0
