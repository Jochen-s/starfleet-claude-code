---
name: opponents-view
description: "Invoke the Devil's Advocate for steel-man + 10-dimension attack on any proposal, code design, or plan. Confidence-scored findings with constructive suggestions."
tags: [quality, review, adversarial]
---

# /opponents-view — Devil's Advocate Challenge

Invoke the Devil's Advocate agent to rigorously challenge a proposal, design, or code decision.

## Arguments

- `/opponents-view "<proposal>"` — Challenge a proposal described inline
- `/opponents-view --file <path>` — Challenge a plan or design document
- `/opponents-view --code <path>` — Challenge code design decisions (not line-by-line review)
- `/opponents-view --brief` — Abbreviated output (top 5 findings only)

## Workflow

### Step 1: Gather Context

If `--file` or `--code` is specified, read the target file(s).

Also check for relevant context:
- Search knowledge graph (`mcp__memory__search_nodes`) for prior decisions on this topic
- Check active context file for current session state

### Step 2: Invoke Devil's Advocate

Spawn a Task with `subagent_type: "general-purpose"` using the devils-advocate agent profile.

Construct the prompt:
```
You are acting as the Devil's Advocate. Follow the protocol in your agent definition.

PROPOSAL:
{proposal text or file contents}

CONTEXT (prior decisions):
{knowledge graph results, if any}

Challenge this thoroughly. Steel-man first, then attack from all 10 dimensions.
```

### Step 3: Present Results

Format the agent's output as:

```markdown
## Opponent's View — {timestamp}

**Target**: {proposal summary}
**Verdict**: {DEFENSIBLE / MIXED / VULNERABLE}

### Steel-Man
{strongest version}

### Findings
| ID | Finding | S | Confidence | Dimension | Action |
|----|---------|---|------------|-----------|--------|
| O-001 | {description} | S0 | {0.0-1.0} | {dimension} | {suggestion} |
| O-002 | {description} | S2 | {0.0-1.0} | {dimension} | {suggestion} |

Severity: S0=Critical (conf>=0.8), S1=High (conf>=0.7), S2=Medium (conf 0.5-0.7), S3=Low (conf<0.5).

### Must-Fix Checklist
> Items at S0/S1 that need immediate attention.
- [ ] O-001: {one-line summary}

### Summary
- {N} S0 / {N} S1 / {N} S2 / {N} S3 findings
- Top recommendation: {most impactful suggestion}

### Verdict Criteria
- **DEFENSIBLE**: 0 S0, 0 S1 — proposal withstands scrutiny
- **MIXED**: 0 S0, 1-2 S1 — proposal has addressable weaknesses
- **VULNERABLE**: 1+ S0 OR 3+ S1 — proposal needs significant revision
```

If `--brief` flag is set, show only the top 5 findings (highest confidence first) and skip the steel-man section.

## Notes

- Token cost: ~3,000 tokens per invocation
- No always-on overhead (loaded on demand)
- Works best for design decisions, architecture proposals, and strategic choices
- For line-by-line code review, use `/codex review` instead
