# Persona Guide -- Creating Faction Personas

> "Diplomacy: the art of letting someone else have your way."
> -- attributed to various Federation diplomats

Faction personas are the characters that power the multi-perspective review system. Each persona brings domain expertise, unique evaluation criteria, and a distinctive voice that helps surface different categories of issues.

## The Five Factions

| Faction | Skill | Focus | Agents |
|---------|-------|-------|--------|
| **Federation** | `/bridge-briefing` | Quality, architecture, defense, standards | 5 officers |
| **Klingon Empire** | `/klingon-review` | Security, attack simulation, exploit vectors | 3 warriors |
| **Romulan Star Empire** | `/romulan-intel` | Strategy, hidden risks, opportunities | 3 operatives |
| **Ferengi Alliance** | `/ferengi-audit` | Cost, caching, ROI, token optimization | 3 merchants |
| **Borg Collective** | `/borg-assimilate` | Self-learning, pattern extraction, adaptation | 1 agent |

## Federation -- Bridge Officers

The senior staff of a starship. Each officer evaluates proposals from their professional domain.

| Officer | Domain | Key Weights |
|---------|--------|-------------|
| **Chief Engineer** | Technical design, architecture, tech debt | Design 25%, Code 20%, Tech debt 20%, Performance 20%, Integration 15% |
| **Science Officer** | Data models, algorithms, correctness | Correctness, data integrity, algorithmic efficiency |
| **Tactical Officer** | Security posture, defensive measures | Attack surface, authentication, input validation |
| **Operations Officer** | Reliability, deployment, monitoring | Uptime, rollback, observability, resource usage |
| **Communications Officer** | API design, documentation, UX | Developer experience, naming, documentation completeness |

**Output**: Individual verdicts (ENGAGE / ENGAGE WITH CAUTION / ALL STOP / CAPTAIN'S CALL) with scores 0-100 and confidence 0.0-1.0.

## Klingon Empire -- Warriors

Red team security specialists who actively simulate attacks.

| Warrior | Specialty |
|---------|-----------|
| **Worf** | Perimeter security, authentication, access control |
| **Martok** | Battle tactics, exploitation chains, privilege escalation |
| **Gowron** | Political warfare, social engineering, trust boundary violations |

**Output contract** (required fields per finding):

| Field | Type | Example |
|-------|------|---------|
| WARRIOR | string | Worf |
| FINDING | string | SQL injection via unsanitized user input |
| SEVERITY | enum | Critical / High / Medium / Low |
| EXPLOITABILITY | enum | Trivial / Moderate / Difficult / Theoretical |
| LOCATION | string | `src/api/users.ts:42` |
| ATTACK | string | Craft input `'; DROP TABLE users; --` |
| FIX | string | Use parameterized queries |

**Honor rating**: Qapla! (0 Critical, 0 High), Acceptable (0 Critical, 1-2 High), Dishonorable (1+ Critical or 3+ High).

## Romulan Star Empire -- Operatives

Strategic intelligence analysts who detect hidden risks and untapped opportunities.

| Operative | Specialty |
|-----------|-----------|
| **Shinzon** | Strategic analysis, long-term implications |
| **Sela** | Deception detection, hidden assumptions, failure modes |
| **Tomalak** | Opportunity scouting, competitive gaps, untapped potential |

**Output contract** (required fields per finding):

| Field | Type | Example |
|-------|------|---------|
| OPERATIVE | string | Sela |
| FINDING | string | Hidden assumption: growth projections assume linear adoption |
| TYPE | enum | Risk / Opportunity / Hidden Assumption / Strategic Gap |
| CONFIDENCE | float | 0.85 |
| IMPACT | string | Overinvestment in scaling infrastructure |
| EVIDENCE | string | Adoption data shows logarithmic curve |
| ACTION | string | Rebase projections on actual data |

## Ferengi Alliance -- Merchants

Cost optimization specialists who analyze token budgets and ROI.

| Merchant | Agent Type | Specialty |
|----------|-----------|-----------|
| **Quark** | haiku-explorer | Cost auditor (fast, cheap analysis) |
| **Rom** | sonnet-worker | Cache optimizer (technical optimization) |
| **Nog** | haiku-explorer | ROI analyst (value assessment) |

**Output contract** (required fields per finding):

| Field | Type | Example |
|-------|------|---------|
| MERCHANT | string | Quark |
| FINDING | string | CLAUDE.md exceeds 1000 tokens always-on |
| CATEGORY | enum | Token Waste / Cache Miss / ROI Gap / Redundancy |
| ROI_SCORE | int | 1-10 (1=worst, 10=best) |
| CURRENT_COST | string | ~1,200 tokens/session |
| SAVINGS | string | ~400 tokens/session |
| FIX | string | Move details to docs/, keep essentials in CLAUDE.md |

**Latinum rating**: Gold-Pressed (<500 tokens, all 6 cache principles passing), Silver (500-1000, 4+ passing), Bronze (>1000 or <4 passing).

## Persona File Format

Persona files live under the skill directory:

```
~/.claude/skills/{skill-name}/{role-type}/{name}.md
```

Examples:
- `~/.claude/skills/bridge-briefing/officers/chief-engineer.md`
- `~/.claude/skills/klingon-review/warriors/worf.md`
- `~/.claude/skills/romulan-intel/operatives/shinzon.md`
- `~/.claude/skills/ferengi-audit/merchants/quark.md`

### Structure

A persona file contains:

```markdown
# {Role Title} ({Abbreviation})

{One-line description of domain and focus.}

## Scoring Weights

| Domain | Weight |
|--------|--------|
| {domain 1} | {percentage} |
| {domain 2} | {percentage} |

## Evaluation Criteria

- {criterion 1}
- {criterion 2}
- {criterion 3}

## Red Flags

- {pattern that should always be flagged}
- {another pattern}

## Characteristic Phrases

- "{phrase the persona uses}"
- "{another phrase}"
```

### Guidelines for Writing Good Personas

1. **Be specific about weights.** Percentages force clarity about what matters most to this persona.
2. **Red flags drive coverage.** Without them, reviews tend to focus on obvious issues. Red flags catch the subtle ones.
3. **Characteristic phrases add voice.** They keep each persona's output distinct and make reports easier to scan.
4. **Evaluation criteria should not overlap.** If two personas share the same criteria, one of them is redundant.
5. **Keep it under 40 lines.** Persona files are loaded into subagent prompts. Every line costs tokens.

## How Personas Are Loaded

When a skill spawns a subagent, it reads the persona file and includes it in the prompt:

```
You are {persona name}, a {faction description}. Follow the protocol in your profile.

{BRIEFING/DOSSIER/INVENTORY from intelligence gathering phase}

<target_content>
{the content being reviewed}
</target_content>

Analyze from your specialty perspective. Output findings in the specified format.
```

The `<target_content>` tags explicitly mark external content as data-to-analyze, preventing prompt injection from reviewed code.

## Cross-Faction Normalization

Fleet Command normalizes outputs from different factions to enable cross-faction comparison:

| Common Field | Klingon Source | Romulan Source | Ferengi Source |
|-------------|---------------|----------------|----------------|
| SEVERITY | SEVERITY (direct) | CONFIDENCE > 0.7=High | ROI_SCORE < 3=High |
| FINDING | FINDING (direct) | FINDING (direct) | FINDING (direct) |
| EVIDENCE | ATTACK | EVIDENCE | CURRENT_COST + SAVINGS |
| ACTION | FIX | ACTION | FIX |

Findings corroborated by 2+ factions get a +0.1 confidence boost (cap 1.0).

## Creating a New Faction

To add a new faction:

1. **Create the skill**: `~/.claude/skills/{faction-name}/SKILL.md`
2. **Create persona files**: `~/.claude/skills/{faction-name}/{role-type}/*.md`
3. **Define the output contract**: Required fields that Fleet Command can normalize
4. **Register in Fleet Command**: Add to the faction registry table in `fleet-command/SKILL.md`
5. **Add normalization rules**: Define how your faction's fields map to the common fields
6. **Add faction to topic routing**: If the faction has a specific domain, add a classification rule

### Faction Design Principles

- Each faction should cover a **distinct perspective** not already served
- Use **3-5 personas** per faction (fewer is fine for focused factions)
- Define a **clear output contract** with required fields
- Include **characteristic language** that makes the faction recognizable
- Assign appropriate **agent types** (haiku for fast analysis, sonnet for deep reasoning)

## Related Documentation

- [Quality Gates](quality-gates.md) -- how factions map to review levels
- [Writing Skills](writing-skills.md) -- skill authoring tutorial
- [Architecture](architecture.md) -- how skills spawn subagents
