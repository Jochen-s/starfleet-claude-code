---
name: research-protocol
description: "Two-loop research orchestrator: chains deep-research (outer, hypothesis generation) with experiment-loop (inner, empirical testing). Use when research questions have a testable dimension with a measurable metric."
tags: [research, orchestration, two-loop, experiment, deep-research]
---

# /research-protocol -- Two-Loop Research Orchestrator

Chains deep-research (outer loop: hypothesis generation) with experiment-loop (inner loop: empirical testing). The outer loop researches what to try; the inner loop tests it. Results flow back to the outer loop for the next cycle.

**Interactive workflow**: Each outer cycle requires 2 human confirmation steps: (1) deep-research band plan approval, and (2) hypothesis list approval. For a 3-cycle run, expect up to 6 confirmation prompts. This is by design; each gate lets you steer the research direction. If you can enumerate hypotheses yourself without research, use `/experiment-loop` directly.

## Artifact Naming Convention

All research-protocol artifacts use a consistent slug:
- **Slug derivation**: Lowercase the question, replace spaces with hyphens, strip punctuation, max 40 chars
- `{slug}-protocol-state.yaml` -- Protocol state persistence
- `research/{slug}-cycle-{N}/` -- Per-cycle deep-research output directories
- `research/{slug}-cycle-{N}/synthesis.md` -- Per-cycle research synthesis
- Experiment-loop artifacts are in `.claude/worktrees/experiment-loop/` (managed by inner skill)

---

## Arguments

Parse `$ARGUMENTS`:

```
/research-protocol "<question>" --file <path> --metric "<command>" --direction <lower|higher> [options]
```

**Required**:
- `"<question>"` -- The research question guiding hypothesis generation
- `--file <path>` -- The file to optimize (passed to experiment-loop)
- `--metric "<command>"` -- Measurable metric (passed to experiment-loop)
- `--direction <lower|higher>` -- Optimization direction

**Optional**:
- `--outer-iterations <N>` -- Max outer loop cycles (default: 3, max: 5)
- `--inner-iterations <N>` -- Max iterations per experiment-loop run (default: 10, max: 20)
- `--hypotheses <N>` -- Number of hypotheses to generate per outer cycle (default: 3, max: 5)

**Input validation** (run before any work):
1. `--file` must exist and be tracked by git (experiment-loop requirement)
2. `--metric` must not contain shell chaining metacharacters (`;`, `&&`, `||`, backticks, `$()`, `>`, `<`) -- if present, stop and ask the user to wrap logic in a script
3. `--direction` must be exactly `lower` or `higher`
4. `--outer-iterations` must be 1-5; `--inner-iterations` must be 1-20; `--hypotheses` must be 1-5
5. `--file` must be a text file (not binary). Verify: `git diff --numstat /dev/null {file}` -- reject if output shows `-` for additions/deletions
6. `--metric` must execute successfully and return a parseable number. Run it once before any work: `timeout 60 {metric}`. If it fails or returns non-numeric output, STOP with error. This prevents wasting a full deep-research cycle on a broken metric.
7. If ANY check fails: report the error clearly and STOP. Do not enter any worktree.

## Workflow Overview

```
Outer Cycle 1:
  Phase A: /deep-research --quick on question + current file state
  Phase B: Extract 3-5 testable hypotheses from findings
  Phase C: For each hypothesis, invoke /experiment-loop (inner loop)
  Phase D: Synthesize results, update research context

Outer Cycle 2:
  Phase A: /deep-research --quick with prior results as context
  Phase B: Extract refined hypotheses informed by Cycle 1 results
  Phase C: Invoke /experiment-loop for each new hypothesis
  Phase D: Synthesize, decide: CONTINUE or CONVERGE

Outer Cycle N (max 3-5):
  Same pattern. CONVERGE when no new hypotheses improve the metric.
```

**No worktree at this level**: research-protocol orchestrates from the main tree. Only /experiment-loop creates worktrees. Do NOT call EnterWorktree from within this skill.

---

## State File

Create `{slug}-protocol-state.yaml` in the current working directory at protocol start, before any other work. Use Python (not shell string interpolation) to write it:

```bash
python3 -c "
import yaml, datetime
now = datetime.datetime.utcnow().isoformat() + 'Z'
slug = '{slug}'
state = {
    'protocol_id': slug,
    'question': '{question}',
    'file': '{file}',
    'metric': '{metric}',
    'direction': '{direction}',
    'started': now,
    'last_updated': now,
    'status': 'running',
    'outer_cycle': 1,
    'max_outer_cycles': {outer_iterations},
    'cycles': [],
    'cumulative': {
        'baseline': 0.0,
        'current_best': 0.0,
        'total_improvement': 0.0,
        'total_hypotheses_tested': 0,
        'validated': 0,
        'rejected': 0
    }
}
with open(slug + '-protocol-state.yaml', 'w') as f:
    yaml.dump(state, f, default_flow_style=False, sort_keys=False)
print('State file created: ' + slug + '-protocol-state.yaml')
"
```

**Each cycle entry appended to `cycles` list**:
```yaml
- cycle: 1
  research_dir: "research/{slug}-cycle-1/"
  hypotheses:
    - id: "H1"
      description: "..."
      expected_impact: "..."
      result: "validated|rejected"
      best_score: 0.0
      delta: 0.0
  convergence_decision: "CONTINUE|CONVERGE|PIVOT"
```

Update `last_updated` after every phase transition. Use atomic Python writes (write to temp, then rename) to prevent corruption on interruption.

---

## Phase A -- Research (Outer Loop)

**Goal**: Generate testable hypotheses about how to improve the file.

### First Cycle

1. Read the target file to understand its current structure and purpose.
2. Run the metric command once to establish the current score (this is the baseline for the protocol; experiment-loop will re-establish its own locked baseline from 3 runs when invoked):
   ```bash
   {metric_command}
   ```
   Record this as `cumulative.baseline` and `cumulative.current_best` in the state file.
3. Compute the deep-research topic slug: `{slug}-cycle-1` (used as the output directory).
4. Invoke deep-research with a focused question:
   ```
   /deep-research "{question} Current implementation: {1-2 sentence file summary}. Current metric score: {score}. What specific, concrete changes to this file would improve {metric description}?" --quick
   ```
5. Wait for /deep-research to complete. Read `research/{slug}-cycle-1/synthesis.md` when available.

### Subsequent Cycles

1. Build a summary of what was already tested from the state file:
   ```
   Prior experiments (do not re-suggest these approaches):
   {list each H from all prior cycles with description and result}
   ```
2. Invoke /deep-research with updated context:
   ```
   /deep-research "{question} Prior experiments showed: {summary of validated and rejected hypotheses}. Current best score: {best_score} ({direction} is better). What NEW approaches should we try that differ from: {rejected_list}?" --quick
   ```
3. Read the resulting synthesis from `research/{slug}-cycle-{N}/synthesis.md`.

**Recovery after compaction**: If the synthesis file is not found after invoking /deep-research, check `{slug}-protocol-state.yaml` to determine the last completed phase, then resume from there.

---

## Phase B -- Hypothesis Extraction

**Goal**: Turn research findings into concrete, testable hypotheses.

From the /deep-research synthesis, extract up to `{hypotheses}` hypotheses. Each hypothesis must be:

1. **Specific**: Describes a concrete change to the target file (not vague like "improve performance")
2. **Testable**: Can be evaluated by the metric command
3. **Independent**: Does not depend on other hypotheses being applied first
4. **Novel**: Not a repeat of a hypothesis tested in any prior outer cycle

Format each hypothesis as:
```
H{N}: {1-sentence description of the concrete change}
Expected impact: {prediction -- direction and rough magnitude}
Rationale: {1-sentence from research findings supporting this}
```

If fewer than the requested hypothesis count can be extracted (research findings too abstract, or all ideas were already tested), extract as many as are genuinely novel and specific. If zero novel hypotheses can be extracted, set convergence decision to CONVERGE and proceed to Phase D.

Present hypotheses to the user and wait for confirmation:

```
Research Protocol -- Cycle {N} Hypotheses

Based on /deep-research findings (research/{slug}-cycle-{N}/synthesis.md):

H1: {description}
    Expected: {impact}

H2: {description}
    Expected: {impact}

H3: {description}
    Expected: {impact}

Proceed with testing? [Y/n]
```

Do not proceed to Phase C until the user confirms.

---

## Phase C -- Experiment (Inner Loop)

**Goal**: Test each hypothesis empirically using /experiment-loop.

### Pre-experiment check

Before testing the first hypothesis in each cycle, check for a stale experiment-loop worktree:
```bash
git worktree list | grep experiment-loop
```
If found, report: "A stale experiment-loop worktree exists at {path}. Remove it first: `git worktree remove {path}`" and STOP until the user clears it.

### Per-hypothesis procedure

For each hypothesis H{N} in order:

1. Announce which hypothesis is being tested:
   ```
   Testing H{N}: {description}
   Invoking /experiment-loop...
   ```

2. Invoke experiment-loop:
   ```
   /experiment-loop "{hypothesis description}" --file {file} --metric "{metric}" --direction {direction} --iterations {inner_iterations} --stagnation 3
   ```
   Note: `--stagnation 3` is intentionally lower than experiment-loop's default of 5, to cycle faster across hypotheses. If a hypothesis is borderline, consider running `/experiment-loop` standalone with the default stagnation limit.
   ```
   ```

3. Record the result from experiment-loop's Phase 2 output:
   - `best_score`: the best score achieved
   - `delta`: improvement from experiment-loop's baseline
   - `kept_count`: number of kept iterations
   - `result`: `validated` if metric improved beyond variance threshold, `rejected` otherwise

4. Update the state file: append hypothesis result to the current cycle entry.

5. If the experiment-loop improved the file, experiment-loop will offer to merge back. Accept if the user approves. The next hypothesis will then start from this improved state.

### Early termination trigger

If any hypothesis achieves > 20% improvement over the protocol baseline, skip remaining hypotheses in this cycle. Announce:
```
H{N} achieved {pct}% improvement -- significant gain detected.
Skipping remaining hypotheses in this cycle and proceeding to synthesis with updated context.
```
Then proceed to Phase D.

### Sequential testing rationale

Hypotheses are tested one at a time, not in parallel. This preserves causal attribution: each hypothesis starts from the current best state (which may include validated improvements from prior hypotheses in this cycle). Parallel testing would create ambiguity about which change caused which improvement.

### Failure handling

If /experiment-loop fails to start (stale worktree, binary file, metric error):
- Log the failure against the hypothesis: result = `rejected`, note = "experiment-loop failed to start: {reason}"
- Continue with the next hypothesis
- Do not abort the entire outer cycle on a single hypothesis failure

If all hypotheses in a cycle fail to start: set convergence decision to PIVOT and note the infrastructure issue in Phase D.

---

## Phase D -- Synthesis (Outer Loop)

**Goal**: Aggregate results and decide whether to continue.

1. Compute cycle summary:
   ```
   Research Protocol -- Cycle {N} Results

   Hypotheses tested: {M}
   Validated: {count} | Rejected: {count}

   H1: {description} --> {VALIDATED|REJECTED} (best: {score}, delta: {+/-delta})
   H2: {description} --> {VALIDATED|REJECTED} (best: {score}, delta: {+/-delta})
   H3: {description} --> {VALIDATED|REJECTED} (best: {score}, delta: {+/-delta})

   Cumulative improvement this session: {total_delta} ({pct}% from protocol baseline)
   ```

2. Update `cumulative` in the state file: `current_best`, `total_improvement`, `total_hypotheses_tested`, `validated`, `rejected`.

3. **Convergence decision**:

   | Decision | Trigger | Action |
   |----------|---------|--------|
   | **CONTINUE** | At least 1 hypothesis validated AND outer cycle count < max | Return to Phase A with updated context |
   | **CONVERGE** | No hypotheses validated (research exhausted) OR cycle count = max | Proceed to final report |
   | **PIVOT** | All hypotheses rejected AND metric is far from target AND infrastructure is healthy | Suggest reformulating the research question; ask user how to proceed |

4. Record `convergence_decision` in the current cycle entry in the state file.

5. If CONTINUE: return to Phase A.
6. If CONVERGE or PIVOT: proceed to final report.

---

## Final Report

```
Research Protocol -- Complete

Question: {question}
File: {file}
Metric: {metric} ({direction} is better)

Results:
  Outer cycles completed: {N}
  Total hypotheses tested: {total}
  Validated: {validated_count} | Rejected: {rejected_count}

  Protocol baseline: {baseline}
  Final best score:  {best}
  Total improvement: {delta} ({pct}%)

Validated hypotheses (by impact):
  1. {description} -- {delta} improvement (Cycle {N}, H{N})
  2. {description} -- {delta} improvement (Cycle {N}, H{N})

Rejected hypotheses:
  1. {description} -- no improvement
  2. {description} -- no improvement

Research artifacts:
  Deep-research reports: research/{slug}-cycle-{1..N}/synthesis.md
  Experiment logs: .claude/worktrees/experiment-loop/experiment-log.tsv (if worktree persists)
  Protocol state: {slug}-protocol-state.yaml
```

After the report, recommend:
```
To capture this experiment as a learning:
/kln:learn "research-protocol results"
```
Do NOT call /kln:learn automatically. It requires user confirmation.

---

## Constraints

1. **No worktrees at protocol level**: research-protocol NEVER calls EnterWorktree. Only /experiment-loop creates worktrees. research-protocol orchestrates from the main tree.
2. **User gates at Phase B**: The hypothesis list requires user confirmation before Phase C begins.
3. **Max 5 outer iterations**: Hard limit. Reject `--outer-iterations` values above 5.
4. **Max 20 inner iterations per hypothesis**: Hard limit. Reject `--inner-iterations` values above 20.
5. **Sequential hypotheses**: Test one at a time. Never invoke multiple /experiment-loop calls in parallel.
6. **State persistence**: The `{slug}-protocol-state.yaml` file is the recovery anchor. Write it before starting any work.
7. **Do not modify experiment-loop or deep-research**: This skill orchestrates them by invoking their slash commands. It does not alter their files or behavior.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| /deep-research returns no actionable hypotheses | Question too abstract for the file | Reformulate with concrete file purpose and metric description as context |
| All hypotheses rejected in Cycle 1 | Wrong metric, metric too noisy, or file already near-optimal | Check metric reliability; run /experiment-loop standalone with `--propose-only` first |
| /experiment-loop exits immediately | Stale worktree from prior run | Clean up: `git worktree remove .claude/worktrees/experiment-loop` |
| Outer loop re-suggests already-tested ideas | Prior results not included in Phase A context | Check that the "do not re-suggest" list is appended to the /deep-research query |
| State file missing after compaction | Not written before Phase A started | Check for partial run; if state file absent, start fresh or reconstruct from cycle research dirs |
| Metric command rejected by experiment-loop | Shell metacharacters in metric string | Wrap metric logic in a shell script; pass script path as `--metric ./my-metric.sh` |
| PIVOT decision loop | Research keeps pivoting without improvement | After 2 consecutive PIVOTs, STOP and ask the user to reformulate the research question manually |

---

## Good Fit vs Bad Fit

**Good fit**: Optimizing a prompt template, tuning algorithm parameters, improving a scoring function, CSS performance optimization -- any task where research can inform what to try and a metric can verify it empirically.

**Bad fit**:
- Pure research questions with no measurable metric: use /deep-research directly instead.
- Multi-file optimization: /experiment-loop only edits one file; this protocol inherits that constraint.
- Questions where "improvement" cannot be expressed as a single numeric direction (e.g., subjective quality without a scorer).
- Simple optimization where you can already enumerate 3-5 hypotheses yourself (e.g., "try these hyperparameter ranges"): use `/experiment-loop` directly for each. /research-protocol's value is in hypothesis *discovery*, not hypothesis testing.
