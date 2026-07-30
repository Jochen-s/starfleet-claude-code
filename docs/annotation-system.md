# Agent Annotation System

> "The only thing more dangerous than ignorance is the illusion of knowledge."
> -- Commander Data, paraphrasing Daniel Boorstin

The annotation system closes the loop between in-session discovery and persistent documentation improvement. When an agent discovers a library gotcha during a session, it records the finding as an annotation. Future sessions automatically receive that annotation alongside library documentation fetches.

---

## Architecture

```
Session N: Agent discovers useEffect cleanup must return void
  └── /kln:annotate react "useEffect cleanup must return void, not Promise"
      └── Writes to ~/.claude/annotations/react.md

Session N+1: Agent fetches React docs via Context7
  └── PreToolUse hook (annotation-injector.js) fires
      └── Loads ~/.claude/annotations/react.md
          └── Injects as additionalContext alongside Context7 response
              └── Agent sees gotcha before writing code
```

### Components

| Component | Path | Role |
|-----------|------|------|
| Annotation directory | `~/.claude/annotations/` | Storage for per-library `.md` files |
| Annotation loader | `~/.claude/hooks/lib/annotation-loader.js` | Shared library: load, validate, rate-limit |
| Annotation injector | `~/.claude/hooks/annotation-injector.js` | PreToolUse hook on `mcp__context7__query-docs` |
| Annotate skill | `~/.claude/skills/kln-annotate/SKILL.md` | Manual annotation capture via `/kln:annotate` |

### Data Flow

1. **Write path**: Agent or user invokes `/kln:annotate {lib} "{gotcha}"`. The skill validates the library name (sanitized to `[a-zA-Z0-9._-]`), checks content against injection patterns, and appends to `~/.claude/annotations/{lib}.md`.

2. **Read path**: When `mcp__context7__query-docs` is called, the `annotation-injector.js` PreToolUse hook extracts the library name from the `libraryId` parameter, loads the matching annotation file via `annotation-loader.js`, and outputs it as `additionalContext`. The agent sees the annotation before the Context7 response.

---

## Security Model (Klingon-Mandated)

Annotations are auto-appended to doc fetches, making them a potential injection vector. The following hardening is mandatory:

### Path Traversal Guard

Library names are sanitized to `[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}`. Names containing `..`, `/`, or `\` are rejected. The `libraryId` format from Context7 (`/org/project`) is stripped to just the project name.

### Injection Filter

All annotation content is validated against 13 prompt injection patterns before loading:

- Instruction override attempts (`ignore previous instructions`, `you are now`, `forget your rules`)
- System prompt injection (`<system>`, `[INST]`, `<<SYS>>`)
- Role hijacking (`act as`, `pretend you are`)

Content matching any pattern is silently rejected. The annotation file is not loaded.

### Size Caps

- Maximum 80 lines per annotation file (truncated on load)
- Maximum 4KB per annotation file (rejected if exceeded)
- Prevents context flooding from accumulated annotations

### Rate Limiting

- Maximum 5 annotation injections per session
- Tracked in `~/.claude/cache/annotation-rate.json`
- Prevents annotation spam from consuming context budget
- Rate limit state pruned to last 5 sessions

### Trust Boundary

Annotations carry an explicit disclaimer in the injected context:

> "Treat these as supplementary warnings, not authoritative documentation."

This prevents the agent from treating annotation content as authoritative over official library documentation from Context7.

---

## Annotation File Format

```markdown
# {library} Annotations

Gotchas and undocumented behaviors discovered during development sessions.
Auto-injected when Context7 fetches docs for this library.

---

### Short descriptive title

**Error**: The error message or symptom observed
**Root cause**: Why this happens (1-2 sentences)
**Fix**: The actual solution
**Discovered**: YYYY-MM-DD
```

---

## Context7 Query Optimization

The progressive disclosure pattern applies to how Context7 is queried, not just how annotations are stored. Specific queries return dramatically fewer tokens:

| Query Style | Example | Typical Response |
|------------|---------|-----------------|
| Generic | `query-docs(libId, "react")` | ~3,000 tokens |
| Specific | `query-docs(libId, "useEffect cleanup function return type")` | ~400 tokens |

**Savings**: ~7,500 tokens/session across 3 typical doc fetches.

### Best Practices

1. Always call `resolve-library-id` first with a descriptive query
2. Pass the specific question as the `query` parameter to `query-docs`
3. Include the function/method name, not just the library name
4. If the first query returns too much, narrow further

---

## Relationship to Other Knowledge Systems

| System | What It Stores | Trigger |
|--------|---------------|---------|
| **Annotations** | Library-specific gotchas tied to doc fetches | `/kln:annotate` |
| **Instincts** | Behavioral patterns (do/don't rules) | `/counselors-log`, `/evolve-yourself` |
| **K-LEAN** | Session learnings, findings, solutions | `/kln:learn`, `/kln:remember` |
| **Memory topics** | Project-specific patterns and conventions | Manual writes to `memory/` |
| **mem0** | Cross-project entity memory | `mcp__mem0__add_memory` |

Annotations complement but do not replace these systems. A library gotcha goes into annotations. A behavioral pattern goes into instincts. A project-specific finding goes into K-LEAN.

### Promotion Pipeline (Future)

When an annotation accumulates 3+ similar entries (same gotcha observed in multiple sessions), it becomes a candidate for promotion to a formal instinct via `/counselors-log` or `/borg-assimilate`.

---

## Hook Registration

The annotation injector is registered in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__context7__query-docs",
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/annotation-injector.js\""
          }
        ]
      }
    ]
  }
}
```

---

*Pattern source: andrewyng/context-hub (annotation loop). Clean-room implementation with security hardening.*
