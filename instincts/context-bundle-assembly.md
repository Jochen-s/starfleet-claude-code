**Confidence**: 0.70
**Source**: gaai-assimilation (GAAI context-bundle pattern, cross-model consensus ADOPT)
**failure_mode**: context-drift
**Created**: 2026-03-12
**Last validated**: 2026-03-12

Before spawning any sub-agent, explicitly list in the prompt:
(1) which files to read first, (2) relevant spec/plan sections,
(3) known friction from prior runs on the same files.
Do not rely on sub-agents to discover context -- assemble
the context bundle before dispatch.
This applies to sub-agent dispatch, not self-directed phase transitions (see re-anchoring).
