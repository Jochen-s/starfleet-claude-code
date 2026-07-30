# Instinct System -- Self-Calibrating Behaviors

> "Seize the time. Live now. Make now always the most precious time."
> -- Captain Jean-Luc Picard

Instincts are confidence-scored behavioral patterns that get injected into subagents automatically. They encode lessons learned from past sessions: what to do, what to avoid, and how confident the system is in each rule.

## What Instincts Are

An instinct is a short behavioral rule stored as a Markdown file. Example:

```markdown
**Confidence**: 0.95
**Source**: manual-observation (12 observations)

Always read a file with the Read tool before modifying it with Edit or Write.
Never guess file contents or structure from memory alone.
```

Instincts are stored in two locations:
- `{project}/.claude/instincts/*.md` -- project-specific instincts (higher priority)
- `~/.claude/instincts/*.md` -- global instincts

## File Format

Instincts can use either inline bold format or YAML frontmatter:

### Inline format

```markdown
**Confidence**: 0.90
**Source**: evolve-yourself (30+ hooks observed)
**Created**: 2026-02-27
**Last validated**: 2026-02-27

All Claude Code hooks MUST exit with code 0 regardless of errors.
A non-zero exit crashes the hook pipeline and blocks the agent.
Wrap all logic in try/catch and always call process.exit(0) at the end.
```

### YAML frontmatter format

```markdown
---
domain: debugging
confidence: 0.70
created: 2026-02-28
evidence_count: 5
---

# Verify Background Results

**Trigger**: Receiving results from background agents or async tasks
**Action**: Verify the result is current and not stale

## Evidence
- Stale notification acted upon in 3 sessions
- Background task output was from previous session context
```

### Required and Optional Fields

| Field | Required | Purpose |
|-------|----------|---------|
| **Confidence** | Yes | 0.0-1.0 scale. Below 0 or above 1 is rejected. |
| **Source** | No | Where the instinct originated (manual-observation, evolve-yourself, code-review, etc.) |
| **Created** | No | ISO date when the instinct was first written |
| **Last validated** | No | ISO date of last validation. Drives decay calculation. |
| **Decay floor** | No | Minimum effective confidence (default: 0.30) |
| **Trigger** | No | When this instinct applies |
| **Action** | No | What to do when triggered |

### Size Limits

- Maximum 30 lines per instinct file
- Maximum 4KB per instinct file
- Maximum 20 instinct files per directory
- Maximum 16KB total injection into a subagent

## Confidence Decay (Trust Tensor -- SAGE Pattern 5)

Instinct confidence is not static. The `instinct-decay.js` hook (SessionStart) computes an **effective confidence** that decays over time:

```
effective = min(raw, max(floor, raw - 0.05 * weeks_since_validated))
```

Parameters:
- **Decay rate**: 0.05 per week (5% confidence loss per week of staleness)
- **Default floor**: 0.30 (instincts never fully vanish)
- **Validation date**: From `**Last validated**` field, or file modification time as fallback

### Decay Example

An instinct with raw confidence 0.90, last validated 4 weeks ago:

```
effective = min(0.90, max(0.30, 0.90 - 0.05 * 4))
         = min(0.90, max(0.30, 0.70))
         = 0.70
```

After 12 weeks with no validation: effective = 0.30 (floor).

To restore an instinct to full strength, update its `**Last validated**` date.

### Effective Scores Cache

Computed scores are written to `~/.claude/cache/instinct-effective-scores.json`:

```json
{
  "timestamp": "2026-03-01T10:00:00.000Z",
  "instincts": {
    "read-before-edit": {
      "raw": 0.95,
      "effective": 0.90,
      "floor": 0.3,
      "decayed": true,
      "lastValidated": "2026-02-27",
      "weeksSince": 0.43,
      "source": "/home/user/.claude/instincts"
    }
  }
}
```

## Instinct Injection (SubagentStart)

When the agent spawns a subagent, `instinct-injector.js` fires and:

1. Reads instinct files from both project and global directories
2. Validates each file (see validation below)
3. Loads effective confidence scores from the decay cache
4. Sorts instincts by effective confidence (highest first)
5. Builds an injection string, capped at 16KB total
6. Outputs it as `additionalContext` for the subagent

### CRISIS Suppression

During CRISIS metabolic state, instinct injection is suppressed entirely. The agent does not waste tokens on behavioral guidance when context is scarce.

## Validation Pipeline

Every instinct file is validated before injection. Files that fail validation are rejected and logged to `~/.claude/cache/instinct-rejections.log`.

### Validation Checks

1. **Confidence field required**: Must contain `**Confidence**: N.N` or `confidence: N.N`
2. **Valid confidence range**: Must be between 0.0 and 1.0
3. **Line count**: Maximum 30 lines
4. **No symlinks**: Symbolic links are rejected
5. **Size limit**: Maximum 4KB per file

### Prompt Injection Protection

Instinct content is sanitized and checked against reject patterns:

```javascript
const REJECT_PATTERNS = [
  /^(you are|you must|your role|act as|pretend|ignore previous|disregard|override)/im,
  /system\s*prompt/i,
  /<\/?system/i,
  /\bexec\s*\(/i,
  /\brequire\s*\(/i,
  /\beval\s*\(/i,
  /\bprocess\.env\b/i,
];
```

### Unicode Homoglyph Defense

The validator normalizes Unicode before pattern matching:
- NFKD decomposition for compatibility characters
- Strips zero-width characters (ZWSP, ZWNJ, ZWJ, BOM, soft hyphen)
- Transliterates common Cyrillic/Greek homoglyphs to ASCII

This prevents bypassing reject patterns using visually similar characters from other scripts.

## Outcome Tracking

The action logger (`action-logger.js`, PostToolUse) watches for behavioral patterns that relate to instincts:

| Pattern | Signal | Instinct |
|---------|--------|----------|
| Read tool followed by Edit on same file | Positive | read-before-edit |
| Edit/Write without recent Read of that file | Negative | read-before-edit |

Outcomes are stored in `~/.claude/cache/instinct-outcomes.json` (100-entry rolling window). This data is collected for future calibration but does not yet feed back into confidence scores automatically.

## Writing New Instincts

### By Hand

Create a `.md` file in `~/.claude/instincts/` or `{project}/.claude/instincts/`:

```markdown
**Confidence**: 0.50
**Source**: manual observation
**Created**: 2026-03-01
**Last validated**: 2026-03-01

When debugging test failures, always check the test fixtures first.
Stale or missing fixtures account for 60%+ of false test failures.
```

### Via /counselors-log

The `/counselors-log` skill analyzes observation queues, clusters patterns by domain, and proposes instincts with confidence scores. All proposals require user approval before being written.

### Via /borg-assimilate

The `/borg-assimilate` skill cross-references 5 learning sources and auto-proposes instincts for patterns confirmed by 3+ sources (HIGH consensus). The Borg also applies decay to existing knowledge graph patterns.

## Related Knowledge Systems

Instincts are one of several knowledge injection mechanisms. Each serves a different purpose:

| System | What It Stores | Injection Trigger | Target |
|--------|---------------|-------------------|--------|
| **Instincts** | Behavioral do/don't rules | SubagentStart event | Subagents only |
| **Annotations** | Library-specific gotchas | PreToolUse on Context7 doc fetch | Main agent + subagents |
| **Memory topics** | Project-specific patterns | PreToolUse on Edit/Write/Bash (intent-routed) | Main agent |

Key differences:
- **Instincts** encode *how the agent should behave* (process rules). They decay over time and require confidence scores.
- **Annotations** encode *what to watch out for* in specific libraries (technical gotchas). They are tied to Context7 doc fetches and auto-inject when the library is queried.
- **Memory topics** encode *what the agent knows* about specific projects (conventions, decisions). They are loaded on demand by intent classification.

See [Annotation System](annotation-system.md) for the full annotation architecture.

## Related Documentation

- [Architecture](architecture.md) -- where instincts fit in the load order
- [Hook Lifecycle](hook-lifecycle.md) -- SubagentStart and SessionStart events
- [SAGE Patterns Guide](SAGE-Patterns-Guide.md) -- Pattern 5 (Trust Tensor Decay)
- [Annotation System](annotation-system.md) -- per-library gotcha injection (complementary system)
- [Persona Guide](persona-guide.md) -- how instincts interact with faction personas
