---
name: doc-garden
description: Scan for stale memory topics, near-dead instincts, and low-salience K-LEAN entries. Proposes cleanup actions interactively.
---

# Doc Garden

Scan all three knowledge layers for stale, near-dead, or low-quality entries. Present a unified findings table, then apply only user-approved actions.

## Step 1 — Scan Memory Topics

Use Glob to list all `.md` files in the project memory dir:
- `~/.claude/projects/*/memory/*.md`

For each file, use Read to check:
- Does any content reference deprecated systems? Patterns: "knowledge graph MCP", "V3.2 schema", "deprecated", "archived" in active prose
- Note the file path for age flagging (mtime not accessible via Read; flag any file whose content references events/dates older than 30 days from today)

Flag as **STALE** if last-referenced date in content is 30+ days ago.
Flag as **OUTDATED** if content references known deprecated systems.

## Step 2 — Scan Instincts

Use Glob to list all `.md` files in `~/.claude/instincts/`.

For each instinct file, use Read to extract:
- `Confidence:` field value
- `Last validated:` field value

Then read `~/.claude/cache/instinct-effective-scores.json` with Read (if it exists). Match by instinct name to find `effective_score`.

Flag as **NEAR-DEAD** if effective_score < 0.35 (or base Confidence < 0.35 if no effective score found).
Flag as **UNVALIDATED** if Last validated date is 60+ days before today (2026-04-02).

## Step 3 — Scan K-LEAN DB

Read `.knowledge-db/entries.jsonl` (path relative to project root, or check `~/.claude/` if not found locally).

For each entry (one JSON object per line):
- Flag as **LOW-SALIENCE** if `salience_score` < 0.3
- Flag as **NEVER-RETRIEVED** if `retrieval_count` == 0

Cross-check with `~/.claude/cache/auto-recall-hits.jsonl` using Grep (pattern: entry id or key phrase) to verify retrieval status. If hits exist, do not flag NEVER-RETRIEVED.

Limit scan to entries created 30+ days ago (check `created_at` field) to avoid flagging new entries.

## Step 4 — Present Findings Table

If no issues found across all three layers, output:

```
Garden is clean. No stale items detected.
```

Otherwise, present a numbered findings table:

```
| #  | Source   | Item                            | Signal          | Issue          | Proposed Action |
|----|----------|---------------------------------|-----------------|----------------|-----------------|
|  1 | memory   | wordpress.md                    | 45d stale       | STALE          | UPDATE          |
|  2 | instinct | vpn-client-restart.md           | eff: 0.31       | NEAR-DEAD      | ARCHIVE         |
|  3 | klean    | "bcrypt shell variable" (id:42) | salience: 0.18  | LOW-SALIENCE   | ARCHIVE         |
|  4 | instinct | android-firewall.md             | last val: 90d   | UNVALIDATED    | KEEP            |
```

Default proposed actions:
- STALE memory -> UPDATE
- OUTDATED memory -> UPDATE
- NEAR-DEAD instinct -> ARCHIVE
- UNVALIDATED instinct -> KEEP (prompt revalidation)
- LOW-SALIENCE K-LEAN -> ARCHIVE
- NEVER-RETRIEVED K-LEAN -> ARCHIVE

## Step 5 — Interactive Approval

For each finding, ask the user:

```
[1] wordpress.md (STALE/UPDATE) — confirm action?
  U = UPDATE (read + suggest new content)
  A = ARCHIVE (move/mark superseded)
  K = KEEP (update timestamp, mark validated)
  S = SKIP (no action)
```

Accept bulk input if user provides a string like `UAKSU` (one letter per row, in order).

Never take any action before user input. Never delete files; ARCHIVE means:
- For instinct files: add `Superseded by: [reason or date]` field and move to `~/.claude/instincts/archived/`
- For K-LEAN entries: set `"superseded": true` and `"superseded_at": "<today>"` on the entry object, rewrite the line

## Step 6 — Execute Approved Actions

**UPDATE**: Read the file in full, propose revised content inline, ask for confirmation before writing.

**ARCHIVE (instinct)**: Read the file, add `Superseded by: doc-garden review <today>` below the Confidence line. Output the move command for the user to run (since subagents cannot execute Bash):
```
mv ~/.claude/instincts/<name>.md ~/.claude/instincts/archived/<name>.md
```

**ARCHIVE (K-LEAN)**: Read the relevant line from entries.jsonl, output the updated JSON line with `"superseded": true`. Ask user to confirm before writing.

**KEEP**: For instincts, read the file and update `Last validated:` to today's date (2026-04-02 or current date). Write the change.

## Constraints

- Use Read, Glob, Grep only for discovery; no Bash for file scanning
- Scan memory dirs for the current project context unless user specifies otherwise
- Cap findings table at 30 rows; if more found, group remainder as "N additional low-priority items — scan again with /doc-garden --all to see full list"
- Never write or modify files until user approves the specific action
- If entries.jsonl exceeds 500 lines, read in chunks using offset/limit parameters
