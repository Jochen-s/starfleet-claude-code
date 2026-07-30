**Confidence**: 0.80
**Source**: reflexion-paper-assimilation
**source_entry_ids**: []
**Created**: 2026-03-28
**Last validated**: 2026-03-28
**failure_mode**: If reflection file missing or empty, proceed without context. Never block on missing reflections.

Before retrying a failed operation, check ~/.claude/cache/failure-reflections.jsonl for matching error signatures. If a reflection exists for the same tool + similar error, apply the avoidance strategy instead of retrying blindly. This prevents repeat failures (Reflexion pattern: 88% vs 67% on HumanEval).

Lookup pattern:
1. Read ~/.claude/cache/failure-reflections.jsonl (may not exist — proceed silently if absent)
2. Find entries where tool_name matches and error_signature overlaps with current error
3. If match found: apply the avoidance field before retrying
4. If no match: proceed with standard retry approach

The hook (failure-reflection.js) only writes reflections when loop-detector detects 3+ repeated failures of the same pattern. Reflections are heuristic, not LLM-generated — treat as starting hypothesis, not definitive root cause.
