# Instinct Template

Instincts are confidence-scored behavioral patterns that get injected into
subagents via the SubagentStart hook. They teach Claude Code learned behaviors
without polluting the main instruction set.

## File Location

Place instinct files in `~/.claude/instincts/` with a descriptive filename:
```
~/.claude/instincts/my-instinct-name.md
```

## Required Fields

Every instinct file MUST contain these fields at the top:

```markdown
**Confidence**: <0.0 to 1.0>
**Source**: <how this was learned>
**Created**: <YYYY-MM-DD>
**Last validated**: <YYYY-MM-DD>

<description of the behavioral pattern>
```

### Field Descriptions

**Confidence** (required): A score from 0.0 to 1.0 indicating how reliable
this pattern is. Higher confidence = more likely to be injected into subagents.
- 0.90-1.00: Battle-tested, observed many times, always correct
- 0.70-0.89: Well-established, occasional exceptions
- 0.50-0.69: Emerging pattern, needs more validation
- Below 0.50: Experimental, may not be injected

**Source** (required): How the instinct was learned. Common sources:
- `manual-observation`: Learned from observing a recurring pattern
- `evolve-yourself`: Self-discovered through repeated observation
- `code-review`: Identified during a code review session

**Created** (optional but recommended): When the instinct was first captured.

**Last validated** (optional but recommended): When the instinct was last
confirmed to still be accurate.

## Example Instinct

File: `~/.claude/instincts/check-types-before-cast.md`

```markdown
**Confidence**: 0.85
**Source**: code-review (5 observations)
**Created**: 2025-06-15
**Last validated**: 2025-07-01

Always verify the actual type of a variable before performing a type cast.
Use typeof checks for primitives, instanceof for objects, and Array.isArray()
for arrays. Never assume a value's type based on variable naming alone.
```

## Confidence Scoring and Decay

Confidence scores are not static. They should evolve:

- **Increase** when the instinct is validated (prevented an error, user confirmed)
- **Decrease** when the instinct fires incorrectly or is overridden
- **Decay** naturally if not validated for a long period

### Suggested Decay Schedule

| Time since last validation | Decay |
|---------------------------|-------|
| 0-30 days | None |
| 30-60 days | -0.05 |
| 60-90 days | -0.10 |
| 90+ days | -0.15 |

Instincts that decay below 0.50 should be reviewed and either re-validated
or removed.

## How Instincts Are Used

1. The `SubagentStart` hook reads all files in `~/.claude/instincts/`
2. Files are parsed for the Confidence field
3. Instincts are sorted by confidence (highest first)
4. Top instincts are injected into the subagent's system prompt
5. A cap (e.g., 20 instincts) prevents prompt bloat

## Tips

- Keep instincts short and actionable (2-4 lines of description)
- One behavioral pattern per file
- Use filenames that describe the pattern: `read-before-edit.md`, not `instinct-1.md`
- Validate periodically -- stale instincts waste prompt budget
