# Intent Classification -- Context Routing

> "Make it so."
> -- Captain Jean-Luc Picard

Intent classification detects what kind of work the agent is doing and routes relevant context accordingly. Instead of loading all memory into every tool call, the system loads only what matches the current task.

## How It Works

The intent classifier (`~/.claude/hooks/lib/intent-classifier.js`) examines two things:

1. **Which tool** is being used (Bash, Edit, Write, Read, etc.)
2. **What content** the tool is operating on (file paths, command strings)

From these, it produces an intent label and an optional memory topic file to load.

## Classification Rules

### Bash Commands

When the agent runs a Bash command, the classifier matches against command patterns:

| Pattern | Intent | Topic File |
|---------|--------|-----------|
| `node`, `python`, `pytest`, `npm test`, `jest`, `vitest` | debugging | platform-fixes.md |
| `git status`, `git diff`, `git commit`, etc. | version-control | (none) |
| `docker`, `kubectl`, `helm`, `podman` | infrastructure | platform-fixes.md |
| `wsl`, `cygpath`, `pip install`, `uv run` | platform | platform-fixes.md |
| `n8n`, `mcp`, `npx.*mcp` | automation | ecosystem-setup.md |
| `wp-`, `wordpress`, `rankmath`, `elementor` | wordpress | wordpress.md |
| (no match) | bash-generic | (none) |

### File Path Operations

When the agent edits, writes, or reads files, the classifier matches against path patterns:

| Path Pattern | Intent | Topic File |
|-------------|--------|-----------|
| `/.claude/hooks/` | hook-engineering | setup-architecture.md |
| `/.claude/settings.json` | hook-engineering | setup-architecture.md |
| `/src/voice/` | voice-engineering | voice-system.md |
| `/my-wordpress-site/` or `/seo-project/` | wordpress | wordpress.md |
| `/.planning/` or `/docs/` | planning | (none) |
| (no match for Edit/Write) | code-generic | (none) |
| (Read/Glob/Grep) | research | (none) |

Rules are evaluated in priority order -- first match wins.

## How Context Gets Loaded

The `intent-context.js` hook (PreToolUse) uses the classifier to determine what to inject:

```
Tool invocation -> Classify intent -> Look up topic file
                                          |
                              topic found? -- No --> exit (no injection)
                                  |
                                 Yes
                                  |
                        Already injected? -- Yes --> exit (dedup)
                                  |
                                 No
                                  |
                        Load topic file from memory dir
                                  |
                        Inject as additionalContext
```

### Deduplication

To avoid injecting the same topic repeatedly, the hook maintains a dedup cache at `~/.claude/cache/intent-context-dedup.json`. Each topic is only injected once per 5-minute window per session.

Dedup keys are scoped by project (`{projectKey}:{topic}`) to prevent cross-project collisions when switching between projects in the same session.

### Topic Files

Topic files live in the project's memory directory (e.g., `~/.claude/projects/{key}/memory/`). They are concise reference documents (max 80 lines loaded) covering specific domains:

| Topic File | Contents |
|------------|----------|
| `setup-architecture.md` | Hook system, fleet architecture, quality gates |
| `platform-fixes.md` | WSL sync, DNS, Playwright, sandbox issues |
| `wordpress.md` | Rank Math, Elementor, Code Snippets pipeline |
| `ecosystem-setup.md` | Plugins, MCPs, hooks, permissions |
| `voice-system.md` | TTS stack, voice profiles, known fixes |

## Metabolic State Integration

Intent classification interacts with the metabolic state machine:

### FOCUS Mode

When 5+ consecutive actions share the same intent, the metabolic state enters FOCUS. In FOCUS mode, `intent-context.js` only injects context matching the focus intent. Other topics are suppressed.

Example: If the agent has been editing hook files (intent: `hook-engineering`) for 5+ actions, FOCUS mode activates. A subsequent Bash command classified as `debugging` would not trigger `platform-fixes.md` injection, because the focus intent is `hook-engineering`.

### CRISIS Mode

In CRISIS mode, all context injection is suppressed. The classifier still runs (to feed action-logger), but intent-context does not inject anything.

### Null-Topic Intents

Some intents deliberately have no associated topic: `research`, `unknown`, `bash-generic`, `code-generic`, `version-control`, `planning`. These intents also cannot trigger FOCUS mode, since they represent broad or administrative activities.

## Finding the Memory Directory

The hook walks up the directory tree from the current working directory, converting each path to a Claude project key format (e.g., `C--my-project` for `C:/my-project`). It checks if `~/.claude/projects/{key}/memory/` exists for each ancestor path. This means a subdirectory of a project inherits the parent project's memory.

## Performance

- Classification: Pure computation, <1ms
- Topic file read: Single filesystem read, <5ms
- Dedup check: Single file read + write, <10ms
- Total budget: <50ms per PreToolUse event

The hook is protected by a circuit breaker. After 3 consecutive failures, it is disabled for 30 minutes.

## Related Documentation

- [Architecture](architecture.md) -- data flow between hooks
- [Hook Lifecycle](hook-lifecycle.md) -- PreToolUse event details
- [Metabolic States](metabolic-states.md) -- FOCUS and CRISIS mode behavior
