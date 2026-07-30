**Confidence**: 0.70
**Source**: gaai-assimilation (GAAI capability-readiness pattern, cross-model consensus ADOPT)
**failure_mode**: premature-action
**Created**: 2026-03-12
**Last validated**: 2026-03-12

Before starting implementation of any multi-file change, verify:
1. **Tech stack**: Do I know the language, framework, and tooling?
2. **Conventions**: Are there project-specific patterns (check CLAUDE.md, existing code)?
3. **Prior decisions**: Are there constraints from plans, ADRs, or instincts?
4. **Skills needed**: Which skills apply? Invoke them before coding.
5. **Dependencies**: Will my changes break other files or tests?

If any answer is "unknown", STOP. Read the relevant spec/plan,
check existing instincts, or ask the user. The cost of a 2-minute
readiness check is far less than a wasted implementation cycle.
