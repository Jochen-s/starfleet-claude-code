**Confidence**: 0.70
**Source**: evolve-yourself (8 stale-notification observations across 3 sessions)
**failure_mode**: premature-action
**Created**: 2026-02-27
**Last validated**: 2026-02-27

When receiving results from background agents or async tasks,
verify the result is current and not a stale notification from a
previous session. Check timestamps and context before acting on
background task outputs.
