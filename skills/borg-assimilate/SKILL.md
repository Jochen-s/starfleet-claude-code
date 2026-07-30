---
name: borg-assimilate
description: "Unified self-learning cycle that assimilates patterns from learning queues, reflect, counselors-log, and K-LEAN into the knowledge graph. Cross-references all learning sources for consensus-based pattern extraction."
tags: [learning, self-improvement, patterns, knowledge, automation]
---

# /borg-assimilate — Borg Collective Assimilation Cycle

**Pipeline role**: Unified cross-source analyzer. K-LEAN is the primary knowledge sink (per-project DB, search, persistence). Borg reads all 5 learning sources, cross-references for consensus, and promotes HIGH patterns to the knowledge graph and instincts. Replaces standalone `/reflect` for comprehensive processing.

Unifies the 4 independent self-learning systems into a single assimilation cycle that cross-references all sources for stronger pattern identification.

## Arguments

- `/borg-assimilate` — Full assimilation cycle (scan all sources)
- `/borg-assimilate --scan` — Scan only, report what's available without processing
- `/borg-assimilate --quick` — Process only high-confidence patterns (3+ corroborating sources)

## Learning Sources

| Source | Location | Type | Write Owner |
|--------|----------|------|-------------|
| learnings-queue | `~/.claude/cache/learnings-queue.json` | Corrections, preferences, positive feedback | Your learning capture hook (Stop event) |
| observations-queue | `~/.claude/cache/observations-queue.json` | Tool patterns, error-fix patterns, style prefs | Your observation capture hook (Stop event) |
| K-LEAN | `.knowledge-db/` (project root) via `/kln:find` | Session learnings, code reviews, rethinks | K-LEAN CLI (`kln` commands) |
| Knowledge graph | MCP memory entities | Cross-session decisions, relations | Any agent via `mcp__memory__` tools |
| Instincts | `.claude/instincts/` (project root) | Previously approved behavioral rules | Borg (propose) + user (approve) |

> **Write ownership rule**: Each source has exactly one write owner. Borg is READ-ONLY for all sources except knowledge graph and instinct proposals. Borg never modifies queue files directly — it reads, processes, then removes only confirmed entries during cleanup (Step 6).

## Step 1: Scan — Gather All Learning Data

Read all sources (cap each to first 200 lines; summarize if larger):
1. `~/.claude/cache/learnings-queue.json` — if exists, parse corrections/preferences/feedback
2. `~/.claude/cache/observations-queue.json` — if exists, parse tool/error/style observations
3. Query knowledge graph: `mcp__memory__search_nodes` for recent "learning" and "pattern" entities
4. Query K-LEAN knowledge DB: run `/kln:find "patterns learnings"` or read `.knowledge-db/` directly for session learnings, code reviews, and rethinks. Requires `PYTHONIOENCODING=utf-8` on MINGW64.
5. Read `.claude/instincts/*.md` in project root — existing instincts for deduplication
6. Read MEMORY.md in project memory dir — existing documented patterns

**Entry validation** (apply to each queue entry before processing):
- Required fields: `type` (correction/preference/feedback/observation), `content` (non-empty string), `timestamp` (ISO 8601)
- Skip entries missing required fields — log as `SKIPPED: malformed entry at index {N}`
- Skip entries with `content` longer than 2,000 characters — log as `SKIPPED: oversized entry at index {N}`
- Skip entries where `timestamp` is older than 90 days — log as `SKIPPED: stale entry at index {N}`
- Report validation summary: `{N} valid / {M} skipped ({reasons})` in the Assimilation Scan

If no sources exist (all queues empty, no K-LEAN DB, no instincts), report "No learning data available" and stop.

If `--scan` flag: output inventory and stop.

```markdown
### Assimilation Scan
| Source | Items | Last Updated |
|--------|-------|-------------|
| Learnings queue | {N} | {date} |
| Observations queue | {N} | {date} |
| Knowledge graph entities | {N} | {date} |
| Existing instincts | {N} | - |
| Memory patterns | {N} | - |
```

## Step 2: Analyze — Cross-Reference Sources

**Deduplication** (before scoring):
- Normalize each entry: lowercase, strip timestamps, collapse whitespace
- Group entries by semantic similarity (same trigger + same action = duplicate)
- Merge duplicates: keep earliest timestamp, count occurrences as reinforcement weight
- Report: `{N} unique patterns from {M} total entries ({D} duplicates merged)`

For each unique learning/observation:
1. Extract the core pattern (what trigger + what action)
2. Search all other sources for corroborating evidence
3. Assign consensus score:
   - 1 source: LOW (0.3) — single observation
   - 2 sources: MEDIUM (0.5) — emerging pattern
   - 3+ sources: HIGH (0.7+) — consensus pattern (auto-propose as instinct)
4. Check against existing instincts for duplicates or contradictions

**Challenge step** (before promoting HIGH patterns):
For each HIGH pattern about to be promoted, ask: "Could this pattern be confidently wrong? What scenario would make following this harmful?" If the answer is non-trivial, downgrade to MEDIUM and flag for manual review.

## Step 2b: Decay — Unreinforced Pattern Pruning

Check existing knowledge graph "pattern" and "emerging-pattern" entities:
1. Query `mcp__memory__search_nodes` for all pattern entities
2. For each pattern, check `lastReinforced` observation (ISO timestamp)
3. Apply decay rules:
   - No reinforcement in 30+ days: reduce confidence by 0.1 (add observation)
   - No reinforcement in 60+ days: reduce confidence by 0.2
   - Confidence drops below 0.2: propose archival (remove entity, keep in report log)
4. Patterns reinforced this cycle (found in current queue data): reset decay timer via `mcp__memory__add_observations` with `lastReinforced: {now}`

Report decay actions in the Assimilation Report under a `### Decay Applied` section.

## Step 3: Assimilate — Update Knowledge Systems

For HIGH consensus patterns (3+ sources):
1. **Knowledge graph**: Create entity with `mcp__memory__create_entities` (type: "pattern")
2. **Propose instinct**: Generate instinct file content for user approval
3. **Link relations**: Connect to related entities via `mcp__memory__create_relations`

For MEDIUM consensus patterns (2 sources):
1. **Knowledge graph**: Create entity (type: "emerging-pattern")
2. **Note**: Flag for monitoring in future sessions

For LOW consensus patterns (1 source):
1. Leave in source queue for future corroboration
2. Do NOT create entities (avoid knowledge graph noise)

## Step 4: Adapt — Suggest Improvements

Based on assimilated patterns, suggest:
1. **CLAUDE.md refinements** — if a pattern is universal enough to warrant an always-on rule
2. **Skill improvements** — if patterns suggest a skill needs updating
3. **Workflow optimizations** — if patterns reveal inefficient workflows
4. **New capabilities** — if patterns cluster around an unserved need (counselors-log evolution check)

**NEVER auto-apply suggestions. Present for user approval.**

## Step 5: Report — Assimilation Report

```markdown
## Borg Assimilation Report — {timestamp}

**Cycle**: {full/quick}
**Sources scanned**: {N}
**Patterns identified**: {N}

### High-Consensus Patterns (3+ sources)
| # | Pattern | Sources | Confidence | Proposed Action |
|---|---------|---------|------------|----------------|
| 1 | {description} | {list} | {0.7+} | {instinct/rule/skill} |

### Emerging Patterns (2 sources)
| # | Pattern | Sources | Confidence | Status |
|---|---------|---------|------------|--------|
| 1 | {description} | {list} | {0.5} | Monitoring |

### Adaptation Suggestions
- {suggestion 1}: {rationale}
- {suggestion 2}: {rationale}

### Decay Applied
| Pattern | Age (days) | Old Confidence | New Confidence | Action |
|---------|-----------|---------------|---------------|--------|
| {name} | {days} | {old} | {new} | {decayed/archived/reinforced} |

### Efficiency Delta
- Patterns before: {N}
- Patterns after: {N} (+{N} new, -{N} archived)
- Instincts proposed: {N}
- Knowledge graph entities: +{N}
- Duplicates merged: {N}

### Queue Status
| Queue | Before | After | Processed |
|-------|--------|-------|-----------|
| Learnings | {N} | {N} | {N} |
| Observations | {N} | {N} | {N} |

Resistance is futile. Adaptation is inevitable.
```

## Step 6: Clean Up (requires user confirmation)

**Before any deletion**, present the full Assimilation Report (Step 5) and ask:
"Processed {N} entries. Proceed with queue cleanup? [Y/n]"

If user approves:
1. **Backup first**: Write `~/.claude/cache/learnings-queue.backup-{timestamp}.json` and `observations-queue.backup-{timestamp}.json`
2. Only remove entries where the corresponding `mcp__memory__create_entities` call returned successfully (no error)
3. Remove processed HIGH entries from both queues (confirmed in knowledge graph)
4. Leave MEDIUM entries in queues — they are entities but not yet approved as instincts
5. Leave LOW entries for future corroboration
6. Write cleaned queues back to their files

If user declines, skip cleanup entirely. All learning data remains in queues for the next cycle.

## Persistence

Save assimilation reports to `.borg/reports/{YYYY-MM-DD-HHmm}.md` in the project root. Create directory if needed.

## Verification

Run `/borg-assimilate --scan` to verify setup without processing. Expected:
- Assimilation Scan table listing all 5 sources with item counts
- At least 1 source showing items > 0 (or "No learning data available" if truly empty)
- No errors reading queues or knowledge graph

For a full test, run `/borg-assimilate --quick` after a few sessions. Expected: patterns identified with consensus scores.

## Notes

- Token cost: ~2,000-3,000 tokens per invocation (primarily reading + knowledge graph ops)
- No always-on overhead (loaded on demand)
- No subagents needed — runs as single-agent orchestration
- Run weekly or after 5+ sessions to maximize cross-reference value
- Complements (does not replace) `/reflect` and `/counselors-log` which can still run standalone
- **Queue conflict**: If Borg processes HIGH entries from the queue, `/reflect` will not see them next run. Run Borg OR reflect on the same queue, not both. Borg is the preferred unified path.
