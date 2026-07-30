---
name: self-correct
description: "Use when (1) task involves investigation + implementation, (2) 3+ files need changing, (3) user says 'check your approach', or (4) task contains research-then-fix patterns. Prevents wrong-approach errors via adversarial self-challenge before implementation."
tags: [quality, adversarial, self-check, pre-execution]
---

# Tactical Assessment Protocol

A 5-phase pre-execution gate that prevents wrong-approach errors by forcing adversarial challenge before any implementation begins. Never skip Phase 1. Never implement before the reconciled plan is user-approved.

## Arguments

Parse `$ARGUMENTS` for the task description and the following optional flags:

- `--skip-review` -- Skip Phase 3 and Phase 4 entirely; proceed directly from Phase 2 to Phase 5. Use only for simple, well-understood tasks.
- `--deep` -- After Phase 3's subagent review, also invoke `/codex opinion` on the plan for a cross-model check before reconciling.
- `--file <path>` -- Read and include the specified plan or spec file as additional Phase 1 evidence.

If no task description is provided in `$ARGUMENTS`, ask the user to describe the task before proceeding.

## Auto-trigger Conditions

Consider invoking this skill automatically when:

- Task description includes "investigate", "debug", "figure out", "fix" in combination with a multi-component system
- Task requires reading 3 or more files before any changes can be made
- A previous attempt at this task was rejected or produced unexpected results
- User has explicitly requested careful approach, said "check your approach", or invoked `/self-correct`
- Task description contains research-then-fix patterns (e.g., "find out why X is broken and fix it")

## Workflow

---

### Phase 1 -- Sensor Scan (Research)

**Objective**: Gather all available evidence. Do not propose any solution.

Steps:

1. Parse the task description from `$ARGUMENTS`. If `--file <path>` was provided, read that file first and treat its contents as primary context.
2. Identify every file, module, config, and test explicitly mentioned in the task description.
3. Expand the search: use Grep and Glob to discover related files not explicitly named (tests, configs, imports, callers, schemas, migration files, documentation).
4. Read all discovered files. Note file paths and relevant line numbers.
5. Search the knowledge graph and any prior session notes for prior decisions, known failures, or relevant patterns related to this task.
6. Collect any error messages, log output, or observable symptoms the user has provided.
7. Note any apparent contradictions between files (e.g., config says X, code does Y).

**Output** -- present a bulleted evidence list:

```
## Phase 1 -- Sensor Scan Complete

Evidence collected:
- {file}:{line} -- {observation}
- {file}:{line} -- {observation}
...

Contradictions / anomalies:
- {description}

Prior decisions from knowledge graph:
- {finding or "none found"}
```

Do NOT propose any fix in this phase. Pure observation only.

---

### Phase 2 -- Plot Course (Propose)

**Objective**: Derive an action plan strictly from Phase 1 evidence.

Steps:

1. Review Phase 1 findings only. Do not introduce assumptions that have no evidence trail.
2. Write a numbered action plan. Each step must:
   - Reference specific files and line numbers from Phase 1
   - State what will change and why (evidence-based)
   - State the expected outcome after the step completes
3. Flag every assumption explicitly using the format:
   `ASSUMPTION: {what we are assuming} -- {why we believe it, or why it cannot be verified yet}`
4. Keep the plan to 20 steps maximum. If more steps are needed, group related actions.
5. Hold this plan in memory -- do not write it to disk.

**Output** -- numbered markdown list:

```
## Phase 2 -- Proposed Course

1. {Action} in `{file}:{line}` -- Expected: {outcome}
   ASSUMPTION: {if any}
2. ...

Explicit assumptions:
- ASSUMPTION: {text}
```

If `--skip-review` flag is set, skip Phase 3 and Phase 4 and proceed directly to Phase 5 with this plan.

---

### Phase 3 -- Tactical Review (Adversarial Check)

**Objective**: Stress-test the plan before a single file is touched.

Skip this phase entirely if `--skip-review` was provided.

Steps:

1. Spawn a subagent using the Agent tool with `subagent_type: "sonnet-reviewer"`. The adversarial persona is established via the prompt content below, not the agent type.
2. Send the subagent ONLY:
   - The original task description
   - The numbered plan from Phase 2
   - The explicit assumption list from Phase 2
   - Do NOT send file contents, code, or the Phase 1 evidence list.
3. Instruct the subagent to respond with:
   a. **Top 3 failure scenarios** -- specific ways this plan could produce the wrong result or miss the real problem
   b. **Assumption challenges** -- which flagged assumptions are most likely to not hold, and what the consequence is if they fail
   c. **Opposite approach** -- describe the alternative solution and make the strongest case for why it might be superior
   d. **Confidence score** (1-10) for each finding
4. If `--deep` flag was provided, after receiving the subagent's findings, invoke `/codex opinion` on the plan and append its output as additional adversarial input.

**Output** -- adversarial findings from reviewer:

```
## Phase 3 -- Tactical Review Findings

### Failure Scenarios
1. {scenario} -- Confidence: {score}/10
2. {scenario} -- Confidence: {score}/10
3. {scenario} -- Confidence: {score}/10

### Assumption Challenges
- ASSUMPTION "{text}": {challenge and consequence}

### Opposite Approach
{description and case for alternative}

### Codex Cross-Model Input (if --deep)
{findings or "not requested"}
```

---

### Phase 4 -- Helm Correction (Reconcile)

**Objective**: Integrate adversarial findings into a revised plan, then present for user approval.

Skip this phase entirely if `--skip-review` was provided.

Steps:

1. For each finding from Phase 3, evaluate it against Phase 1 evidence.
2. Assign one of three dispositions:
   - **ACCEPTED** -- evidence supports the concern; modify the plan accordingly
   - **REJECTED** -- evidence from Phase 1 contradicts the concern; explain why
   - **DEFERRED** -- cannot resolve without runtime data; note for post-implementation verification
3. Apply ACCEPTED corrections to the plan. Mark each modified step with `[CHANGED]`, unchanged steps with `[UNCHANGED]`, and any new steps with `[NEW]`.
4. Ensure the revised plan still does not exceed 20 steps.
5. Present the reconciled plan to the user and wait for explicit approval before proceeding to Phase 5.

**Output** -- reconciled plan for user approval:

```
## Tactical Assessment -- Reconciled Plan

**Original course**: {N} steps
**Corrections applied**: {N} accepted, {N} rejected, {N} deferred

### Revised Plan

1. [UNCHANGED] {step}
2. [CHANGED] {step} -- changed because: {reason}
3. [NEW] {step} -- added because: {reason}
...

### Corrections Log

| # | Finding | Decision | Reason |
|---|---------|----------|--------|
| 1 | {finding summary} | ACCEPTED / REJECTED / DEFERRED | {evidence or rationale} |
| 2 | ... | ... | ... |

### Deferred Verifications
- {item to check post-implementation}

---
Awaiting your approval to engage, Number One.
```

Do NOT proceed to Phase 5 until the user gives explicit approval (e.g., "approved", "engage", "make it so", or equivalent confirmation).

---

### Phase 5 -- Engage (Execute)

**Objective**: Implement the approved reconciled plan with continuous outcome verification.

Steps:

1. Execute each step of the reconciled plan in order.
2. After completing each step, verify the actual outcome against the expected outcome stated in Phase 2 for that step.
3. If the actual outcome matches: proceed to the next step.
4. If the actual outcome does not match or contradicts Phase 1 evidence:
   - STOP immediately. Do not continue.
   - Report what was expected, what was observed, and which Phase 1 evidence is now contradicted.
   - Return to Phase 2 with the new information and re-run from there.
5. Do not introduce changes beyond the scope of the approved plan. If new information discovered during execution suggests additional changes, note them for a follow-up cycle rather than expanding scope.
6. After all steps are complete, present a brief execution summary:

```
## Phase 5 -- Execution Complete

Steps completed: {N}/{N}
Deferred verifications:
- {item}: {result or "not yet verifiable"}

Post-execution status: {PASS / NEEDS_FOLLOW_UP}
```

---

## Worked Example

**User**: "The webhook handler is returning 500 errors in production but works locally. Find and fix it."

**Auto-trigger**: Task matches pattern (investigation + implementation, research-then-fix).

**Phase 1 -- Sensor Scan**: Reads webhook handler, config files, error logs, tests. Finds: production uses `WEBHOOK_SECRET` env var but handler references `process.env.SECRET_KEY`. Local `.env` has both set.

**Phase 2 -- Plot Course**:
```
1. Rename SECRET_KEY to WEBHOOK_SECRET in src/webhooks.ts:14 -- Expected: env var name matches production
   ASSUMPTION: No other files reference SECRET_KEY
2. Add test for missing env var -- Expected: graceful error instead of 500
```

**Phase 3 -- Tactical Review**: Sonnet-reviewer challenges: "What if SECRET_KEY is used elsewhere? Grep first." Confidence: 8/10.

**Phase 4 -- Helm Correction**: ACCEPTED -- adds grep step before rename. Presents reconciled plan for approval.

**Phase 5 -- Engage**: Executes plan, verifies each step matches expected outcome.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Phase 1 takes too long (10+ reads) | Task scope too broad; reading entire codebase | Narrow scope: ask user to specify which files/modules are relevant |
| Phase 3 reviewer agrees with everything | Reviewer received too much context (including Phase 1 evidence) | Reviewer must receive ONLY the plan and task description, never file contents |
| Phase 5 step produces unexpected result | Plan assumption was wrong despite adversarial review | STOP immediately; return to Phase 2 with new evidence (do not workaround) |
| User never gets asked for approval | `--skip-review` was set | Without `--skip-review`, Phase 4 always presents reconciled plan for approval |
| Auto-triggered on simple task | Task matched trigger patterns but doesn't need full protocol | User can say "skip it" to abort; consider `--skip-review` for simple tasks |

## Constraints

- Never skip Phase 1 regardless of how clearly the user describes the solution.
- Phase 3 reviewer receives only the plan and task description -- never file contents or codebase context.
- User must provide explicit approval after Phase 4 before Phase 5 begins.
- Reconciled plan maximum: 20 steps. Group related actions if needed.
- No emojis anywhere in output.
- If `--skip-review` is set, Phases 3 and 4 are bypassed entirely -- go from Phase 2 directly to Phase 5 with the original proposed plan (still requires user confirmation before executing).
- The `--skip-review` flag must ONLY be used when the user explicitly passes it. The agent must never autonomously add `--skip-review` when auto-triggering /self-correct. This flag exists for the user to opt out of review, not for the agent to shortcut it.
- If a Phase 5 step produces unexpected results, do not attempt workarounds -- return to Phase 2 with updated evidence.
