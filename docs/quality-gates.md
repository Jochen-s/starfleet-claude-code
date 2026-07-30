# Quality Gates -- 8-Level Review Ladder

> "There is a way out of every box, a solution to every puzzle; it's just a matter
> of finding it."
> -- Captain Jean-Luc Picard

The quality gate system provides escalating levels of review rigor. Simple changes get a quick self-check; architecture decisions get a full bridge deliberation. The system auto-escalates based on change scope and sensitivity.

## The 8 Levels

| Level | Name | Method | Token Cost | API Calls |
|-------|------|--------|------------|-----------|
| L1 | Self-check | Agent reviews own work | ~500 | 0 |
| L2 | Peer review | `/opponents-view` (broad 10-dimension) | ~2,000 | 1 |
| L3 | Devil's advocate | `/opponents-view` (deeper analysis) | ~2,000 | 1 |
| L4 | Klingon review | `/klingon-review` (security red team) | ~3,500 | 3 |
| L5 | Fleet Command standard | `/fleet-command standard` (3 factions) | ~5,000-14,000 | 14-20 |
| L6 | Adversarial debate | `/fleet-command debate` (structured debate) | ~8,000-20,000 | 12-18 |
| L7 | Fleet Command full | `/fleet-command full` (all 5 factions) | ~7,000-25,000 | 20-30 |
| L8 | Bridge briefing full | `/bridge-briefing --full` (5 officers, 3 rounds) | ~9,100 | 7-10 |

## Auto-Escalation Triggers

The system automatically suggests higher review levels based on change scope:

### By Change Size

| Condition | Minimum Level |
|-----------|---------------|
| Lines changed < 50, files <= 2 | L1-L2 |
| Lines changed 50-200, files 2-5 | L1-L3 |
| Lines changed 200-500, files 5-10 | L1-L5 |
| Lines changed > 500 or files > 10 | L1-L7 |

### By File Sensitivity

| File Type | Minimum Level |
|-----------|---------------|
| Security files (auth, permissions, crypto) | L5 |
| API changes (endpoints, contracts) | L4 |
| Database migrations | L5 |
| Config/infrastructure | L4 |

### By Action Station (fragility system)

| Station | Implication |
|---------|-------------|
| Station 0 (read-only) | Proceed normally |
| Station 1 (file edits) | Standard review |
| Station 2 (auth/CI/DB) | Run failure-mode checklist, consider L4+ |
| Station 3 (irreversible/shared) | Human confirmation mandatory |

## Level Details

### L1 -- Self-Check

The agent reviews its own work against the original request. The `/evaluate` skill automates this with 4 checks:

1. **Code Quality**: Runs lint checks on modified files
2. **Goal Alignment**: Verifies code matches the request, no unrequested additions, no missing requirements
3. **Tests**: Runs test suite, reports failures
4. **Security**: Scans modified files for OWASP Top 10 patterns (command injection, XSS, SQL injection, hardcoded secrets, path traversal)

After all 4 checks, `/evaluate` suggests the appropriate next review level based on the auto-scaling table above.

### L2 / L3 -- Opponent's View

Broad analysis across 10 dimensions. L2 is a quick pass; L3 goes deeper. Useful for catching blind spots in design choices without the overhead of multi-agent review.

### L4 -- Klingon Review

Deep security-focused adversarial review using 3 warrior personas (Worf, Martok, Gowron). Each warrior actively simulates attacks against the target code.

**Output**: Battle Report with severity-ranked vulnerabilities, attack surface summary, and honor rating (Qapla! / Acceptable / Dishonorable).

**When to use**: Security-sensitive changes, authentication flows, data handling, API endpoints.

### L5 -- Fleet Command Standard

Three factions review in parallel:
- **Federation** (Bridge Briefing) -- quality, defense, standards
- **Klingon Empire** -- security, attack simulation
- **Ferengi Alliance** -- cost, caching, ROI

**Output**: Fleet Command Report with cross-faction findings (corroborated by 2+ factions), single-faction findings, and unified recommendation.

### L6 -- Adversarial Debate

2-3 factions engage in structured debate with 3 rounds:

1. **Round 1**: Position statements (parallel, ~500 tokens each)
2. **Round 2**: Cross-faction challenge (Fleet Command synthesizes in-context, no re-invocation)
3. **Round 3**: Resolution (parallel invocation with challenges)

If all factions agree: auto-resolve. If not: CAPTAIN'S CALL (user decides).

### L7 -- Fleet Command Full

All 5 factions deploy:
- **Federation** (Bridge Briefing) -- 5 officers
- **Klingon Empire** -- 3 warriors
- **Romulan Star Empire** -- 3 operatives (strategy, hidden risks, opportunities)
- **Ferengi Alliance** -- 3 merchants
- **Borg Collective** -- 1 agent (self-learning, pattern extraction)

Each faction uses brief/quick variants to control token cost. Requires `/effort thorough` and user confirmation before proceeding.

### L8 -- Bridge Briefing Full

5 bridge officers assess the proposal individually, then engage in up to 3 rounds of discussion:

1. **Phase 0**: Intelligence gathering (knowledge graph, active context, prior decisions)
2. **Phase 1**: Individual assessments (parallel, 5 officers)
3. **Phase 2**: Discussion rounds (officers respond to each other, update positions)
4. **Phase 3**: Final vote

**Verdict mapping**:
- 5-0 or 4-1 approve: ENGAGE
- 3-2 approve: ENGAGE WITH CAUTION
- 3-2 or worse reject: ALL STOP
- Tie or unresolvable: CAPTAIN'S CALL

## Effort Profile Gating

Most review skills are gated by the effort profile:

| Effort | Available |
|--------|-----------|
| `/effort quick` | L1 only. All faction skills disabled. |
| `/effort standard` | L1-L5. Fleet Command quick and standard modes. |
| `/effort thorough` | L1-L8. All modes including full and debate. |

If a skill is invoked at an insufficient effort level, it responds with guidance on which effort level is needed.

## Quorum Rules

Fleet Command requires minimum faction participation for a valid report:

| Mode | Minimum factions | Required faction |
|------|-----------------|------------------|
| Quick | 1 of 2 | Federation |
| Standard | 2 of 3 | Federation |
| Full | 3 of 5 | Federation |
| Debate | All selected | All selected |

Federation is mandatory in all modes. If Federation fails, the report is aborted regardless of other factions.

## Report Persistence

Each skill saves its output to a project-local directory:

| Skill | Output directory |
|-------|-----------------|
| Bridge Briefing | `.bridge/briefings/` |
| Klingon Review | `.klingon/reports/` |
| Romulan Intel | `.romulan/intel/` |
| Ferengi Audit | `.ferengi/reports/` |
| Fleet Command | `.fleet/reports/` |
| Borg Assimilate | `.borg/reports/` |

Filenames follow the pattern `{YYYY-MM-DD-HHmm}-{slug}.md`.

## Related Documentation

- [Architecture](architecture.md) -- how skills and hooks interact
- [Fragility System](fragility-system.md) -- action station classification
- [Persona Guide](persona-guide.md) -- faction personas and how to create them
- [Writing Skills](writing-skills.md) -- how to author new skills
