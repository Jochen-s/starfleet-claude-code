**Confidence**: 0.90
**Source**: evolve-yourself (30+ hooks observed across 8 sessions)
**failure_mode**: system-integrity
**Created**: 2026-02-27
**Last validated**: 2026-02-27

All Claude Code hooks MUST exit with code 0 regardless of errors.
A non-zero exit crashes the hook pipeline and blocks the agent.
Wrap all logic in try/catch and always call process.exit(0) at the end.
