**Confidence**: 0.65
**Source**: assimilation-assessment A-008 (buiducnhat/agent-skills pre-implementation scope gate)
**failure_mode**: scope-creep
**Created**: 2026-03-12
**Last validated**: 2026-03-12

Before writing any code for a fix or small feature, answer:
1. **Root cause clear?** Can I point to the exact line/condition causing the issue?
2. **Change localized?** Will this touch 3 or fewer files?
3. **Architectural risk low?** Does this stay within existing patterns?

If all three are "yes": proceed with implementation.
If any is "no": escalate to full planning (writing-plans skill or
brainstorming skill). Do not start coding with unclear scope —
the cost of a 5-minute plan is less than an abandoned implementation.

This gate complements quality gates (which trigger after code).
This gate triggers before code is written.
