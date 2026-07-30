# claude-devtools Setup Guide

Session inspector for Claude Code: context token attribution, compaction visualization,
subagent tree resolution, live monitoring.

Repo: https://github.com/matt1398/claude-devtools

## Option 1: Electron Desktop App (Recommended)

Download from [GitHub Releases](https://github.com/matt1398/claude-devtools/releases):
- Windows: `claude-devtools-X.X.X-win-x64.exe`
- Read-only: never modifies session logs or Claude Code config

## Option 2: Docker Standalone Server (Network-Isolated)

```bash
# Start Docker Desktop first, then:
docker run -d \
  --name claude-devtools \
  --network none \
  -p 127.0.0.1:3456:3456 \
  -v "$USERPROFILE/.claude:/data/.claude:ro" \
  ghcr.io/matt1398/claude-devtools:latest

# Access at http://127.0.0.1:3456
```

Security notes:
- `--network none`: no outbound network access
- `:ro`: read-only volume mount
- `127.0.0.1:3456`: localhost-only binding (their default binds 0.0.0.0, which is unsafe)

## Option 3: npm Standalone Server

```bash
npm install -g claude-devtools
claude-devtools-server --port 3456 --host 127.0.0.1
```

## What to Use It For

- **Context budget analysis**: See where tokens go (CLAUDE.md vs tool I/O vs thinking)
- **Compaction debugging**: Visualize what gets lost during autocompact
- **Fleet operation debugging**: Subagent execution trees with timing
- **Hook performance**: Tool call waterfall charts
- **Session archaeology**: Search across all sessions with Cmd+K

## Security Warnings

- CORS default is `*` in standalone mode. Always bind to 127.0.0.1.
- Session logs may contain secrets leaked into terminal output.
- No authentication layer. Do not expose to network.

## Assimilation Source

Identified during 2026-03-28 reconnaissance. Key patterns extracted:
- 7-category context token attribution
- Compaction delta tracking (pre/post token counts)
- JSONL log format specification
- 3-phase subagent tree resolution
- Incremental byte-offset JSONL parsing
