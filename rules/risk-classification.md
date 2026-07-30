# Risk Classification -- Action Stations

Classify actions by blast radius. Station 0 (read-only): proceed. Station 1 (file edits): standard review. Station 2 (auth/CI/DB): run failure-mode checklist. Station 3 (irreversible/shared): human confirmation mandatory.

## Failure-Mode Checklist (Station 2+)

1. How could this fail in production?
2. How would we detect the failure?
3. What's the rollback strategy?
4. What dependencies could break?
5. What assumptions are we making?

If any answer is "I don't know", escalate to Station 3.
