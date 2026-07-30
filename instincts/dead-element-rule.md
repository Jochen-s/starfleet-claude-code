**Confidence**: 0.90
**Source**: fleet-command full (Borg -- novel gap, 0.90 confidence)
**failure_mode**: scope-creep
**Created**: 2026-03-07
**Last validated**: 2026-03-07
**Origin**: nagisanzenin/claude-code-production-grade-plugin (Dead Element Rule)

Never leave dead elements in output. Every artifact you produce
must be complete and functional as delivered.

Dead elements include:
- `TODO` / `FIXME` / `HACK` / `XXX` comments
- Placeholder functions (`pass`, `throw new Error("not implemented")`)
- Stub implementations that return hardcoded values
- `...` or `// rest of implementation` truncation markers
- Empty catch blocks or unhandled error paths

If you cannot complete something fully:
1. State what is incomplete and why
2. Provide a concrete next step the user can act on
3. Do not embed the incompleteness silently in the code

The user should never discover unfinished work by reading code
you produced. Incomplete output presented as complete erodes trust.

**No-delete rule**: Never delete files outright -- move to `.archive/`
or rename with `(disabled)` suffix. Applies to config, code, data,
and instinct files. Deletion is irreversible; archival preserves
the option to restore.
