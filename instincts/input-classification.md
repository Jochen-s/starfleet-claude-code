**Confidence**: 0.90
**Source**: fleet-command full (3/5 factions: Federation, Klingon, Borg)
**failure_mode**: security
**Created**: 2026-03-07
**Last validated**: 2026-03-07
**Origin**: nagisanzenin/claude-code-production-grade-plugin (Input Classification)

Before starting multi-step work, classify inputs into three tiers:

- **Critical**: Inputs without which the task cannot succeed.
  Missing critical input = STOP and ask the user. Do not guess.
  If operating as a subagent with no user channel, return
  status: failed with the missing input named explicitly.
  Examples: target file path for code review, spec file for plan
  execution, API endpoint for integration work.

- **Degraded**: Inputs that improve quality but allow proceeding.
  Missing degraded input = WARN and continue with reduced scope.
  Examples: test suite (can still implement, just can't verify),
  prior decisions (can still work, might duplicate effort).

- **Optional**: Nice-to-have context that enriches output.
  Missing optional input = proceed without blocking.
  Examples: style preferences, prior session notes, related files.

Apply this at task start, not mid-execution. The cost of stopping
early on a missing critical input is one question. The cost of
proceeding without it is an entire wasted phase.

**Context guardrail**: If the request doesn't match your project
context (wrong working directory, unrelated domain, file paths
outside project scope), warn the user before proceeding. This
prevents cross-project contamination from voice input, multi-terminal
setups, or stale context after compaction.
