---
name: curator-gate
description: "Quality gate for instinct persistence. Validates new instincts through a 4-stage pipeline before allowing them to be written to disk. Invoke before writing any new instinct file."
tags: [quality, instincts, validation, gate]
---

# /curator-gate -- Instinct Quality Gate

Validates proposed instincts through a 4-stage pipeline before persistence. This skill is invoked by `/evolve-yourself` and `/counselors-log` before writing instinct files. It can also be invoked directly to validate an existing instinct.

## Arguments

- `/curator-gate validate "<instinct content>"` -- Validate proposed instinct content
- `/curator-gate review <file>` -- Review an existing instinct file
- `/curator-gate batch` -- Review all instincts in `~/.claude/instincts/`

## 4-Stage Validation Pipeline

### Stage 1: Format Validation (automated, no LLM)

Check that the instinct has all required frontmatter fields.

The instinct format uses bold-key Markdown (not YAML): each field is written as
`**FieldName**: value` on its own line, before the body content. This matches
the format parsed by `instinct-decay.js` and injected by `instinct-injector.js`.

**Required fields** (reject if any missing):
- `**Confidence**`: float 0.0-1.0
- `**Source**`: non-empty string describing origin
- `**Created**`: date in YYYY-MM-DD format
- `**Last validated**`: date in YYYY-MM-DD format
- `**failure_mode**`: non-empty string (what goes wrong without this instinct)

**Recommended fields** (warn if missing, do not reject):
- `**Schema version**`: integer (default 1 if absent; current standard is 2)
- `**Last validated session**`: integer
- `**Superseded by**`: string or "none"
- `**Origin**`: source repository or analysis that produced this instinct
- `**source_entry_ids**`: array of K-LEAN entry IDs
- `**Curator approved**`: date + verdict (set by this skill on APPROVED instincts)

**Enforcement**: The `**Curator approved**` field makes gate bypass visible. `instinct-decay.js` emits a warning when an instinct file lacks this field, flagging unapproved instincts without blocking the pipeline. On APPROVED, the curator gate sets: `**Curator approved**: YYYY-MM-DD (APPROVED|APPROVED WITH WARNINGS)`

**Body requirements**:
- Must have at least 2 lines of body content after the frontmatter block
- Body must contain actionable guidance (behavioral instructions, not just a description)
- Total file size must be under 4KB (instinct-decay.js MAX_FILE_SIZE limit)

**Output**: PASS/FAIL with list of issues.

### Stage 2: Non-Contradiction Check (LLM-assisted)

Compare the proposed instinct against all existing instincts.

1. Read all `.md` files from `~/.claude/instincts/` (and project `.claude/instincts/` if present)
2. For each existing instinct, check:
   - **Direct contradiction**: Does the new instinct prescribe the opposite behavior of an existing one?
   - **Scope overlap**: Does the new instinct address the same `failure_mode` as an existing one?
   - **Subsumption**: Is the new instinct's guidance already covered by a broader existing instinct?
3. If contradiction found: REJECT with explanation of which instinct contradicts and why
4. If overlap found: WARN with suggestion to merge into or supersede the existing instinct
5. If subsumed: REJECT with pointer to the broader instinct that already covers this case

**Output**: PASS/WARN/FAIL with contradiction analysis.

### Stage 3: Testability Check (LLM-assisted)

Evaluate whether the instinct produces consistent, observable behavior.

Answer all three questions:
1. Can you construct a concrete scenario where this instinct would fire (i.e., where the agent would change its behavior because of this instinct)?
2. Can you construct a concrete scenario where violating this instinct would cause the failure described in `failure_mode`?
3. Is the guidance specific enough that two different agents would apply it the same way in the same situation?

4. Write at least one concrete "Wrong/Right" example pair demonstrating the instinct in action. This example MUST be embedded in the instinct body before PASS. It externalizes the reasoning and makes vagueness visible to human reviewers.

**Scoring**:
- All 4 criteria met (3 YES + example written): PASS
- 3 of 4 met (questions YES but example missing): WARN ("add Wrong/Right example to instinct body")
- 2 or fewer YES on questions 1-3: FAIL ("instinct is too vague to be actionable")

**Output**: PASS/WARN/FAIL with testability assessment and which criteria failed.

### Stage 4: Holdout Check (LLM-assisted)

Verify the instinct generalizes beyond its origin context.

1. The instinct must apply to at least 2 independent contexts (not just the situation that triggered it)
2. Check: would this instinct be useful in a different project? A different domain? A different agent persona?
3. If the instinct is hyper-specific to one codebase or one incident, it belongs in a project-local instinct file (`.claude/instincts/`), not the global store (`~/.claude/instincts/`)

**Scoring**:
- Applies to 3 or more independent contexts: PASS (suitable as global instinct)
- Applies to exactly 2 contexts: PASS with note "consider whether global scope is warranted"
- Applies to 1 context only: FAIL for global placement; PASS if being written to project-local store

**Promotion pathway**: An instinct that FAILS Stage 4 for global placement can be written to the project-local store (`.claude/instincts/`). After it has been active for 5+ sessions AND its failure mode has been observed in a second independent context, it can be re-submitted to `/curator-gate validate` for global placement. Use `**Scope**: candidate-for-promotion` in the frontmatter to flag instincts in this pipeline.

**Output**: PASS/FAIL with scope recommendation (global vs project-local vs candidate-for-promotion) and context examples.

## Pipeline Execution

Run all 4 stages sequentially. Stop at first FAIL (do not run later stages on a failing instinct).

```
Stage 1 (Format)         --> FAIL? --> REJECT immediately
                         --> PASS -->
Stage 2 (Non-Contradiction) --> FAIL? --> REJECT with contradiction details
                         --> WARN --> Continue with warning accumulated
                         --> PASS -->
Stage 3 (Testability)    --> FAIL? --> REJECT as untestable
                         --> WARN --> Continue with warning accumulated
                         --> PASS -->
Stage 4 (Holdout)        --> FAIL? --> REJECT for global; downgrade to project-local if appropriate
                         --> PASS --> APPROVE
```

Final verdict:
- No failures, no warnings: APPROVED
- No failures, 1+ warnings: APPROVED WITH WARNINGS
- Any failure: REJECTED (include stage number and reason)

## Output Format

Report after each validation run:

```
Curator Gate -- Validation Report

Instinct: {name or "(proposed)"}
Confidence: {value}
Failure mode: {failure_mode value}

Stage 1 (Format):            PASS
Stage 2 (Non-Contradiction): PASS (no conflicts with 18 existing instincts)
Stage 3 (Testability):       WARN -- 2 of 3 criteria met; scenario construction requires domain knowledge
Stage 4 (Holdout):           PASS -- applies to research, fleet review, and client audit contexts

Verdict: APPROVED WITH WARNINGS
Warnings:
  - Stage 3: Add a concrete example to the instinct body to satisfy criterion 3

Proceed with writing instinct file? [Y/n]
```

For REJECTED instincts:

```
Curator Gate -- Validation Report

Instinct: {name or "(proposed)"}
Confidence: {value}
Failure mode: {failure_mode value}

Stage 1 (Format):            FAIL
  - Missing required field: failure_mode
  - Body has 1 line; minimum is 2

Verdict: REJECTED at Stage 1

Fix the listed issues and re-invoke /curator-gate validate.
```

## Batch Mode

When invoked with `/curator-gate batch`:

1. Read all `.md` files from `~/.claude/instincts/` (cap at 20 files; matches instinct-decay.js MAX_FILE_COUNT)
2. Run Stage 1 on each file (pure format check, no LLM, fast)
3. Report Stage 1 results
4. For files that pass Stage 1, run Stages 2-4 as a group (one LLM pass to check cross-instinct contradictions, then individual testability and holdout checks)
5. Report summary:

```
Curator Gate -- Batch Report

Instincts reviewed: 18
Format valid: 16 / 18
  FAIL: old-instinct-1.md -- missing failure_mode
  FAIL: old-instinct-2.md -- Confidence value 1.3 is out of range [0.0, 1.0]

Non-contradiction: 15 / 16
  OVERLAP: instinct-a.md overlaps with instinct-b.md (both address failure_mode: scope-creep)
    Recommendation: merge or set Superseded by in one

Testability: 14 / 15
  WARN: vague-instinct.md -- only 1 of 3 testability criteria met; too abstract to be consistently applied

Holdout: 14 / 14
  All pass

Recommendations:
  - Merge instinct-a.md and instinct-b.md (overlapping scope)
  - Add failure_mode to old-instinct-1.md
  - Fix Confidence value in old-instinct-2.md (must be 0.0-1.0)
  - Add concrete example to vague-instinct.md to satisfy testability criterion 3
```

## Integration Points

**Callers** (skills that should invoke the curator gate before writing instinct files):

- `/evolve-yourself`: Before writing a new instinct, invoke `/curator-gate validate` with the proposed content. Only proceed with the write if the verdict is APPROVED or APPROVED WITH WARNINGS.
- `/counselors-log`: Before promoting an observation to an instinct, invoke `/curator-gate validate`.
- `/borg-assimilate`: After extracting cross-source patterns, gate each proposed instinct through the curator before persistence.

**Direct invocation**:
- User can run `/curator-gate review <file>` on any existing instinct at any time.
- `/curator-gate batch` is suitable as a periodic hygiene sweep (e.g., after `/evolve-yourself` or on the weekly cadence).

**Quality signal**: Run `/curator-gate batch` on all existing instincts to establish a baseline report with PASS/FAIL/WARN for each. Ongoing quality is measured by the Stage 1 failure rate on newly proposed instincts (forward-looking), not a fixed catch rate on the existing corpus.

## Constraints

1. Stage 1 is pure format checking -- no LLM needed, no external reads required beyond the proposed content itself.
2. Stages 2-4 require LLM reasoning. They read existing instinct files from disk and analyze them. Do not skip Stage 2 even if the proposed instinct seems obviously non-contradictory.
3. This skill does NOT write instinct files. It only approves or rejects. The calling skill (e.g., `/evolve-yourself`) handles the actual file write after receiving APPROVED status.
4. Maximum 20 files in batch mode (matches instinct-decay.js MAX_FILE_COUNT). **Prerequisite**: If `~/.claude/instincts/` contains 18+ files, run `/evolve-yourself` archival pass BEFORE batch review to prune superseded/low-value instincts. The system is designed to stay under 20 active instincts via archival, not to silently skip overflow.
5. Stages 3 and 4 may be combined into a single LLM reasoning call when the pipeline would otherwise exceed a reasonable response time (e.g., in batch mode with 15+ instincts).
6. The skill operates on both global (`~/.claude/instincts/`) and project-local (`.claude/instincts/`) stores. Stage 4 scope recommendation differs by target: global store requires 3+ contexts; project-local requires only 1.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| All instincts fail Stage 1 | Schema changed without updating existing instincts | Run batch to enumerate failures; update instincts to Schema version 2 format |
| Stage 2 false positives | Two instincts cover similar but distinct failure modes | Refine the `failure_mode` field in each to be more specific and distinct |
| Stage 3 rejects everything | Instincts are too abstract or principle-level | Add a concrete "Wrong/Right" example pair to each instinct body |
| Stage 4 rejects a useful instinct | Instinct is legitimately project-specific | Write to `.claude/instincts/` in the relevant project instead of global store |
| Batch cap hit (20 files) | Too many instincts accumulated without pruning | Run `/evolve-yourself` archival pass first; then re-run batch |
