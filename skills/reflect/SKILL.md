---
name: reflect
description: Reviews captured learnings from the learnings queue and applies them with user approval. Invoke with /reflect to process queued corrections, preferences, and positive feedback from recent sessions. Use after several sessions to consolidate learning into CLAUDE.md and memory files.
tags: [learning, memory, self-improvement, maintenance]
---

# /reflect — Review and Apply Captured Learnings

**Pipeline role**: Lightweight queue reviewer. Processes learnings-queue.json entries interactively with user approval. For full cross-source analysis (all 5 learning sources), use `/borg-assimilate` instead. Do NOT run both `/reflect` and `/borg-assimilate` on the same queue snapshot — Borg replaces reflect for comprehensive processing.

Process the learnings queue (populated by your learning capture mechanism of choice). Present each learning for approval, then apply approved items to the appropriate files.

## Step 1: Read the Learnings Queue

Read `~/.claude/cache/learnings-queue.json`.

If the file does not exist or is empty (`[]`), output:

```
No learnings to review. Items will appear here as you work and capture observations.
```

Then stop.

## Step 2: Load Existing Context for Deduplication

Before presenting learnings, read these files to avoid suggesting things already captured:

- `~/.claude/CLAUDE.md` (global rules)
- The project's `CLAUDE.md` (in working directory root)
- The project's `CLAUDE.local.md` (in working directory root)
- The current project's memory file at `~/.claude/projects/<current-project-dir>/memory/MEMORY.md` (use the actual project directory name, not a glob)
- **Instinct files**: Check `.claude/instincts/` in the project root for existing instincts. If a learning matches an existing instinct, note it as "already captured as instinct" and skip.
- **Knowledge graph**: Query `mcp__memory__search_nodes` for existing learning/pattern entities to avoid duplicating cross-session knowledge.

Skim for existing rules, preferences, and patterns. Skip any queue entry that is already clearly covered.

## Step 3: Group and Present Learnings

Group queue entries by type. Present them in this order:

1. **Corrections** — things Claude did wrong that were corrected
2. **Preferences** — user style/workflow preferences stated
3. **Positive feedback** — things that went well (useful for confirming patterns)

For each entry, show:

```markdown
### [N] [TYPE] — [timestamp]

**User said:**
> [userMessage, truncated to 200 chars]

**After assistant said:**
> [assistantContext, truncated to 150 chars]

**Detected pattern:** `[pattern]`

**Suggested action:** [Where and how to apply this — see routing table below]

Apply this learning? [Y/n/skip/edit]
```

Routing table:
- Correction about Claude's default behavior → `~/.claude/CLAUDE.md` global rules section
- Correction about this project → project root `CLAUDE.md`
- User preference (personal style, tool choice) → project root `CLAUDE.local.md`
- Recurring pattern or architectural insight → project memory dir (`~/.claude/projects/*/memory/`) or a topic file
- Positive confirmation of an existing pattern → note but no file change needed (just confirm the pattern is documented)

## Step 4: Collect Approvals

Ask the user which items to apply. Accept:
- `Y` or `yes` — apply as suggested
- `n` or `no` — skip this item (remove from queue, don't apply)
- `skip` — leave in queue for later
- `edit` — user provides revised wording before applying

You MAY batch present all items and ask for a comma-separated list of numbers to apply, or walk through them one by one — choose based on queue length (batch if >5, interactive if <=5).

**NEVER auto-apply. Always wait for explicit approval.**

## Step 5: Apply Approved Learnings

For each approved item:

1. Read the target file first
2. Find the appropriate section (or create one if needed)
3. Add a concise, actionable rule — one sentence preferred
4. Write the updated file
5. **Persist to knowledge graph**: Use `mcp__memory__create_entities` to create an entity for the learning:
   - Entity name: short descriptive name (e.g., "prefer-async-await")
   - Entity type: "learning" (or "correction" / "preference" / "pattern" based on type)
   - Observations: the rule text, the source file, and the date
6. If the learning relates to an existing entity (e.g., a project, module, or tool), use `mcp__memory__create_relations` to link them
7. Confirm: "Applied to `[file]`: [rule added] (+ knowledge graph)"

### Writing Style for Applied Learnings

- Corrections → imperative rules: "Always use X not Y", "Never do Z"
- Preferences → descriptive: "User prefers X over Y"
- Patterns → factual: "Pattern confirmed: X works well for Y"

Keep entries brief. One line per learning. No timestamps in the files (they're in the queue).

## Step 6: Clean Up Queue

After processing:
- Remove entries that were **approved** (applied) or **declined** (`no`)
- **Leave `skip` entries in the queue** — they remain for a future `/reflect` invocation
- Write the cleaned queue back to `~/.claude/cache/learnings-queue.json`
- If all non-skipped entries were processed, write the remaining `skip` entries (or `[]` if none)

## Step 7: Summary

Output a final summary:

```markdown
## Reflect Summary

- **Reviewed**: [N] learnings
- **Applied**: [N] (list each: file → rule)
- **Skipped**: [N] (left in queue)
- **Discarded**: [N]

Queue has [N] items remaining.
```

## Example Output

```markdown
## Learnings Queue — 3 items

### [1] CORRECTION — 2026-02-19T14:23:11Z

**User said:**
> no, use async/await not .then() chains

**After assistant said:**
> fetch(url).then(res => res.json()).then(data => ...

**Detected pattern:** `no, use`

**Suggested action:** Add to `~/.claude/CLAUDE.md` → Code Quality section:
"Prefer async/await over .then() chains"

Apply this learning? [Y/n/skip/edit]

---

### [2] PREFERENCE — 2026-02-19T14:31:05Z

**User said:**
> I always use 2-space indentation, not 4

**After assistant said:**
> (code with 4-space indentation)

**Detected pattern:** `I always use`

**Suggested action:** Add to project `CLAUDE.local.md` → Preferences:
"Indentation: 2 spaces (already set — confirmed)"

Apply this learning? [Y/n/skip/edit]
```
