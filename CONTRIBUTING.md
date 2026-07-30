# Contributing to Starfleet Claude Code

Contributions welcome. Here's how to get started.

## Before You Write Code

- **New hook?** Read [docs/hook-infrastructure.md](docs/hook-infrastructure.md) for the taxonomy, gating system, and how to register your hook.
- **New skill?** Read [docs/writing-skills.md](docs/writing-skills.md). Skills must be directories (`name/SKILL.md`), not flat files.
- **New persona?** Read [docs/persona-guide.md](docs/persona-guide.md) for the persona format and how factions integrate with Fleet Command.

For anything bigger than a bug fix, open an issue first to discuss the approach.

## Core Conventions

- **Hooks exit 0.** Always. A crashing hook blocks the entire agent pipeline. Wrap your logic in try-catch.
- **Atomic writes.** Write to `.tmp`, then rename. State files get read by multiple hooks concurrently.
- **No network calls at startup.** SessionStart hooks must complete in under 50ms. No HTTP, no LLM calls.
- **Fail open.** If your hook can't do its job, exit silently. The agent should never be worse off for having hooks installed.

## Commit Style

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Claude Code (install your hook/skill locally, run it)
5. Verify hooks pass: `node hooks/test_*.js` (if test files exist)
6. Commit with conventional format
7. Open a PR with a clear description

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
