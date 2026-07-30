---
name: relief-on-station
description: "Context exhaustion recovery protocol. When an agent hits hull integrity Red, creates a turnover brief and spawns a replacement to continue the work."
tags: [multi-agent, recovery, context, handoff]
---

# /relief-on-station — Context Exhaustion Recovery

When an agent's context window reaches Red hull integrity (55%+ used), this protocol creates a structured handoff to a fresh replacement agent.

## Arguments

- `/relief-on-station` — Manual trigger for current agent
- `/relief-on-station --agent <name>` — Trigger for a specific team agent

## When to Use

### Automatic Trigger (recommended)
In team workflows, the Team Lead monitors hull integrity via context_window.remaining_percentage from PostToolUse hook data. When an agent reports >33% context used:

1. Team Lead sends message to the agent: "Hull integrity Red. Prepare turnover brief."
2. Agent executes this protocol
3. Team Lead spawns replacement

### Manual Trigger
Any agent can invoke `/relief-on-station` when they notice they're running low on context.

## Turnover Brief Protocol

### Step 1: Write Turnover Brief

The departing agent writes a turnover brief to `.bridge/turnovers/{agent-name}-{timestamp}.md`:

```markdown
## Turnover Brief — {agent-name}

**Date**: {timestamp}
**Context Used**: {percentage}%
**Reason**: Hull integrity {tier}

### Current Task
**Task ID**: {id}
**Description**: {what I was working on}
**Status**: {in_progress / blocked}

### Completed Work
- {file path} — {what was done}
- {file path} — {what was done}

### Remaining Work
- {specific task 1}
- {specific task 2}

### Key Decisions Made
- {decision 1}: {rationale}
- {decision 2}: {rationale}

### Files Modified
```bash
{git diff --name-only output for this agent's changes}
```

### Important Context
- {anything the replacement needs to know}
- {gotchas, workarounds, or constraints discovered}

### Handoff Instructions
1. Read the files listed in "Completed Work" to understand current state
2. Continue from "Remaining Work" list
3. Respect the decisions made (unless you find clear issues)
```

### Step 2: Update Task Status

If working within a team:
1. Update current task via TaskUpdate: keep as in_progress, add note about handoff
2. Create a new task for the replacement agent with the turnover brief path

### Step 3: Notify Team Lead

Send message to team lead:
```
Relief requested. Turnover brief at: .bridge/turnovers/{file}.md
Context at {N}%. Recommend replacement with same agent type.
```

### Step 4: Graceful Shutdown

Wait for team lead to confirm replacement is spawned, then approve shutdown.

## Replacement Spawning (Team Lead's responsibility)

When a relief request comes in, the Team Lead:

1. Read the turnover brief
2. Spawn a new agent of the same type with prompt including:
   - The full turnover brief contents
   - The remaining task description
   - Key file contents needed to continue
3. Assign the remaining task to the new agent
4. Send shutdown_request to the departing agent

## Hull Integrity Tiers (Reference)

| Tier | Context Used | Approx Tokens (1M) | Agent Action |
|------|-------------|-------------------|-------------|
| Green | 0-24% | 0-240K | Normal operation |
| Amber | 25-32% | 250-320K | Plan for wrap-up, avoid large new tasks |
| Red | 33-37% | 330-370K | **Trigger relief protocol** |
| Critical | 38-40% | 380-400K | Emergency brief, immediate handoff |
| System autocompact | ~83.5% | ~835K | Claude Code safety net (should never reach) |

## Notes

- Turnover briefs persist in `.bridge/turnovers/` for post-mission review
- The Ship's Counselor (/counselors-log) can analyze turnover patterns
- Relief should be triggered at Red (33%), not Critical (38%) — need buffer for the brief itself
- Token cost: ~500-1,000 tokens for the brief
- Always-on overhead: 0
