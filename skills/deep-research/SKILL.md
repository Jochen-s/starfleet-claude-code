---
name: deep-research
description: "Use when the user needs thorough research on a complex topic, says 'deep dive', 'research this thoroughly', or 'sensor sweep'. Parallel agent orchestrator for comprehensive multi-angle investigation."
tags: [research, parallel, orchestrator, deep-dive]
---

# /deep-research -- Long-Range Sensor Sweep

Decomposes a research question into parallel sensor bands, dispatches one agent per band, monitors completion, recovers stuck agents, and synthesizes findings into a unified report.

## Arguments

- `/deep-research "<question>"` -- Standard sweep (3 bands)
- `/deep-research "<question>" --bands N` -- Custom band count (2-4)
- `/deep-research "<question>" --quick` -- 2 bands, shallower depth
- `/deep-research "<question>" --thorough` -- 4 bands, maximum depth

**Flag precedence**: `--quick` sets 2 bands, `--thorough` sets 4 bands, `--bands N` overrides both. Maximum bands: 4 (enforced regardless of input). Minimum bands: 2 (even if question is narrow).

Parse `$ARGUMENTS`: everything before any `--` flag is the research question. Extract flags separately.

## Workflow Overview

```
Phase 1: Calibrate Sensors     -- Decompose question into sensor bands
Phase 2: Deploy Sensor Array   -- Create output files, dispatch agents
Phase 3: Monitor Telemetry     -- Track progress, detect stuck agents
Phase 4: Rescue Operations     -- Replace or complete stuck agents
Phase 5: Synthesize Findings   -- Cross-cutting analysis, final report
```

---

## Artifact Naming Convention

All deep-research artifacts use a consistent topic-slug:
- **Slug derivation**: Lowercase the research question, replace spaces with hyphens, strip punctuation, max 40 chars
- `research/{topic-slug}/` -- Output directory
- `research/{topic-slug}/band-{N}-{band-slug}.md` -- Band output files
- `research/{topic-slug}/synthesis.md` -- Cross-band synthesis
- `research/{topic-slug}/findings.md` -- Dual-purpose recovery document
- `research/{topic-slug}/plan.md` -- Task ledger + verification log
- `research/{topic-slug}/research-state.yaml` -- State persistence file

---

## Phase 1 -- Calibrate Sensors (Decomposition)

**Goal**: Analyze the research question and plan non-overlapping sensor bands before any agent is dispatched.

### Steps

1. Read the question and identify its core domains, dimensions, or sub-questions.
2. Determine band count:
   - `--quick` -> 2 bands
   - `--thorough` -> 4 bands
   - `--bands N` -> N bands (clamp to 2-4)
   - Default -> 3 bands

### Scale Decision Matrix

Before dispatching agents, assess query complexity:

| Query Type | Example | Action | Agent Count |
|-----------|---------|--------|-------------|
| Single fact | "What license does repo X use?" | Search yourself, no subagents | 0 (3-10 tool calls) |
| Direct comparison | "Compare X vs Y on dimension Z" | 2 parallel researchers | 2 |
| Broad survey | "What tools exist for X?" | 3-4 parallel researchers | 3-4 |
| Complex multi-domain | "Analyze the landscape of X across domains A, B, C" | 4-6 parallel researchers | 4-6 |

**Rule**: Never spawn subagents for work you can accomplish in 5 tool calls. If the question can be answered with a single web search + 2 file reads, do it directly.

This matrix overrides the --bands flag when the query is simpler than the flag implies. A --thorough flag on a single-fact question still uses 0 subagents.

3. Design N sensor bands such that each covers a distinct, non-overlapping domain of the question.
4. For each band, define:
   - **Title**: short descriptive name (e.g., "Architecture Patterns")
   - **Slug**: kebab-case title for use in filenames (e.g., `architecture-patterns`)
   - **Focus questions**: 3-5 specific questions this band must answer
   - **Suggested search terms**: 3-6 terms or phrases likely to yield relevant results

**Example decomposition** -- "AI agent frameworks comparison":
- Band 1: Architecture Patterns -- How do frameworks structure agents? Tool use patterns? Memory models?
- Band 2: Performance & Reliability -- Benchmark data, failure modes, latency, token costs
- Band 3: Ecosystem & Community -- Maturity, documentation quality, adoption, integrations

**Narrow question handling**: If the question cannot naturally fill 3 bands, use 2 bands. One band covers the primary topic in depth, the second covers context, adjacent concerns, or implications.

5. Present the decomposition plan to the user:

```
Long-Range Sensor Sweep -- Calibration Complete

Research question: {question}
Band count: {N}

Sensor Band Assignments:
  Band 1 -- {Title}
    Focus: {3-5 questions}
    Search terms: {terms}

  Band 2 -- {Title}
    ...

  Band N -- {Title}
    ...

Output directory: research/{topic-slug}/

Proceed with deployment? [Y/n]
```

### Plan Artifact: Task Ledger + Verification Log

When presenting the decomposition plan, include two structured tables as part of the plan artifact:

**Task Ledger** (tracks research progress):

```
| Task ID | Description | Assigned To | Status | Notes |
|---------|-------------|-------------|--------|-------|
| T1 | {Band 1 title}: Answer {N} focus questions | Band 1 agent | pending | |
| T2 | {Band 2 title}: Answer {N} focus questions | Band 2 agent | pending | |
| ... | ... | ... | ... | |
| T-synth | Synthesize all band findings | Synthesis agent | blocked | Blocked by T1-TN |
| T-sweep | Claim sweep verification | Main agent | blocked | Blocked by T-synth |
| T-direction | Direction decision | Main agent | blocked | Blocked by T-sweep |
```

**Verification Log** (tracks claim verification, populated during synthesis):

```
| # | Claim | Source | Evidence Grade | Status | Band |
|---|-------|--------|---------------|--------|------|
| (populated during Phase 5 claim sweep) | | | | | |
```

These tables are:
1. Written to `research/{topic-slug}/plan.md` alongside the band skeleton files
2. Updated as bands complete (Task Ledger status changes)
3. Populated with claims during Phase 5 (Verification Log)
4. Mirrored in `research-state.yaml` for agent recovery

The Task Ledger enables progress tracking across sessions. The Verification Log provides an audit trail for the claim sweep gate.

### State File Initialization

After designing the band plan and before presenting to the user, create the research state file:

1. Create `research/{topic-slug}/research-state.yaml` using the template structure from `templates/research-state.yaml`
2. Populate with actual values:
   - `research_id`: the topic-slug
   - `question`: the research question
   - `started`, `last_updated`: current ISO8601
   - `status`: "calibrating"
   - `phase`: "1-calibrate"
   - `output_directory`: the research directory path
   - `bands.total`: planned band count
   - `bands.details`: list of band entries with name, slug, status="waiting", file path, focus questions count
   - `task_ledger`: create one task entry per band (T1, T2, ...) plus T-synth for synthesis, T-sweep for claim sweep, and T-direction for direction decision
   - All other fields: empty lists or zeros

Write the state file to disk immediately: `Write research/{topic-slug}/research-state.yaml`. Do not defer to Phase 2. The file must be on disk before the user confirmation gate so that a crash between Phase 1 and Phase 2 does not lose the research plan. It will be committed with the band skeleton files in Phase 2.

6. **Wait for user confirmation before proceeding to Phase 2.** Do not dispatch any agents until the user approves the decomposition plan (or adjusts it).

Derive `{topic-slug}` from the research question: lowercase, spaces to hyphens, strip punctuation, max 40 chars.

---

## Phase 2 -- Deploy Sensor Array (Agent Dispatch)

**Goal**: Create output scaffolding and launch one research agent per band in parallel.

### Steps

1. **Create output directory**: `research/{topic-slug}/` in the current working directory. Create it if it does not exist.

2. **Create skeleton files** -- for each band, create `research/{topic-slug}/band-{N}-{slug}.md` with this structure:

```markdown
# Band {N}: {Title}

**Research question**: {parent question}
**Focus questions**:
{numbered list of band's focus questions}

**Status**: IN PROGRESS

---

## Findings

<!-- Agent populates this section -->

## Sources

<!-- Agent lists all source URLs here -->
```

Update `research-state.yaml`: set `status` to "deploying", `phase` to "2-deploy", update band statuses to "waiting", commit with skeleton files.

3. **Dispatch one agent per band** -- use `run_in_background: true` for all agents. Agent type: `general-purpose`.

   Agent prompt template (substitute per-band values):

```
You are conducting focused research as part of a parallel sensor sweep.

Your assignment: Band {N} -- {Title}

Parent research question: {question}

Your focus questions (answer all of them):
{numbered list}

Suggested search terms to start with:
{list}

Output file: research/{topic-slug}/band-{N}-{slug}.md

CRITICAL INSTRUCTIONS:
1. Use WebSearch and WebFetch to find information.
2. After EVERY search or fetch, immediately Write your findings to your output file.
   Do NOT accumulate findings in memory -- write incrementally.
3. Include inline citations: every factual claim must have a source URL in parentheses.
4. Follow the search-write-search-write pattern. Minimum 3 search cycles.
5. When you have answered all focus questions to the best of your ability, append
   "Status: COMPLETE" as the last line of the file.
6. Do NOT use the Bash tool. Use only: WebSearch, WebFetch, Read, Write.
7. Do NOT research topics outside your assigned band -- stay focused.
8. Aim for depth over breadth: 5 detailed findings beat 20 shallow bullets.
9. TRIAGE BEFORE FETCH: Before using WebFetch on a URL, assess its likely value from the search snippet or title. Skip sources that appear irrelevant, paywalled, or low-quality. Prefer primary sources over aggregator sites.
10. PROGRESSIVE WRITE: Write your findings to the output file after EVERY search-fetch cycle, not just at the end. If you are interrupted mid-research, your partial findings survive. Target: at least 3 incremental writes during your research.

Structure your findings file with clear H2/H3 headers per focus question.
Write factual, cited prose -- not just bullet lists.
```

4. Note the dispatch timestamp (to calculate elapsed time in Phase 3).

### Source Verification Rules

Inject the following non-negotiable rules into every sensor band agent's prompt:

**Research Integrity (non-negotiable -- include verbatim in agent prompts):**
> - NEVER fabricate citations, statistics, URLs, or factual claims
> - Every factual claim must cite a verifiable source or be explicitly labeled [UNVERIFIED]
> - Label each source with its status:
>   - [PEER-REVIEWED]: Published in a peer-reviewed venue
>   - [PREPRINT]: Available on arXiv, bioRxiv, SSRN, etc. but not yet peer-reviewed
>   - [GREY-LIT]: Technical reports, white papers, documentation
>   - [WEB-SOURCE]: Blog posts, news articles, forum discussions
> - If you cannot find a source for a claim, state explicitly: "No source found for this claim [UNVERIFIED]"
> - Prefer primary sources over secondary summaries
> - When citing statistics, include the year, source, and methodology if available
> - Do NOT generate plausible-sounding but fictional references

---

## Phase 3 -- Monitor Telemetry (Progress Tracking)

**Goal**: Track agent progress, detect completion, identify stuck agents.

### Monitoring schedule

```
Check 1: 30 seconds after dispatch
Check 2: 2 minutes after dispatch
Check 3+: every 5 minutes thereafter
Stop when: all agents complete OR all remaining agents are declared stuck
```

### At each check

For each band file:
1. Read the file.
2. Count total lines.
3. Compare to previous check line count.
4. Check if the last line contains "Status: COMPLETE".

### Status classification

| Condition | Status |
|-----------|--------|
| Last line is "Status: COMPLETE" | COMPLETE |
| Line count grew since last check | IN PROGRESS |
| Line count unchanged since last check (not first check) | STUCK |
| File is empty or only skeleton headers | WAITING |

Update `research-state.yaml`: set `status` to "monitoring", update each band's `status` and `lines` count, set `last_updated`. Update `task_ledger` entries to match band status. Update `recovery.last_checkpoint` to "phase-3-monitor-check-{N}" and `recovery.resume_from` to describe the current monitoring state.

### Display progress after each check

```
Sensor Telemetry -- Check {N} at T+{elapsed}

  Band 1 -- {Title}: {STATUS} ({lines} lines)
  Band 2 -- {Title}: {STATUS} ({lines} lines)
  Band 3 -- {Title}: {STATUS} ({lines} lines)

Next check in {interval}.
```

A WAITING agent at Check 2 (T+2m) should be noted but not declared stuck yet -- some agents take longer to produce first output. Declare STUCK only after zero line growth between two consecutive checks AND at least one check has shown prior activity (or 5 minutes have elapsed with zero output at all).

Continue monitoring until:
- All bands are COMPLETE, OR
- All non-COMPLETE bands are STUCK (proceed to Phase 4), OR
- 30 minutes have elapsed since dispatch (declare remaining agents stuck)

**Recovery after compaction mid-dispatch**: If recovering from a session loss during Phase 2/3 and band files are empty or skeleton-only (WAITING status with no agent handles available), treat all WAITING bands as STUCK and immediately proceed to Phase 4 rescue. Do not attempt to re-monitor agents whose handles were lost to compaction.

---

## Phase 4 -- Rescue Operations (Stuck Agent Recovery)

**Goal**: Recover partial output from stuck agents and attempt completion.

### Steps

For each stuck band:

1. Read the partial output file -- note how many focus questions have been addressed.
2. Identify which focus questions remain unanswered.
3. Assess rescue viability:
   - If partial file is empty or < 5 lines: start fresh (ignore partial)
   - Otherwise: continue from partial

4. Launch a replacement `general-purpose` agent with `run_in_background: true`:

```
You are resuming a stalled research session.

Your assignment: Band {N} -- {Title}
Parent question: {question}

REMAINING focus questions (already answered questions are listed below for context):
{list of unanswered focus questions only}

Output file: research/{topic-slug}/band-{N}-{slug}.md

Partial findings already written to the file (DO NOT duplicate these):
{paste partial file content here}

Continue from where the previous agent stopped. Append new findings to the existing file.
Use WebSearch and WebFetch. Write after every search.
TRIAGE BEFORE FETCH: Before using WebFetch on a URL, assess its likely value from the search snippet or title. Skip sources that appear irrelevant, paywalled, or low-quality.
PROGRESSIVE WRITE: Write findings after EVERY search-fetch cycle. If interrupted, your partial findings survive.
Mark the file "Status: COMPLETE" when all remaining questions are answered.
Do NOT use Bash. Use only: WebSearch, WebFetch, Read, Write.
```

5. Monitor the replacement agent for up to 5 minutes.
6. If replacement also fails to complete: declare band INCOMPLETE and note which focus questions remain unanswered in the synthesis.

Update `research-state.yaml`: mark stuck bands, set `status` to "rescuing". After rescue attempt, update band status to "complete" or "incomplete". Update `recovery.last_checkpoint` to "phase-4-rescue" and `recovery.resume_from` to describe which bands were rescued and current state.

---

## Phase 5 -- Synthesize Findings (Cross-Cutting Analysis)

**Goal**: Read all band outputs, identify cross-band themes, write the final synthesis.

### Steps

1. Read all completed (and incomplete-but-partial) band files.
2. Count total source URLs across all files (deduplicate).
3. Launch a `sonnet-reviewer` agent with `run_in_background: false` (this runs synchronously -- you need the result).

   Synthesis agent prompt:

```
You are synthesizing the findings of a parallel research sweep.

Research question: {question}
Bands completed: {N}/{total}

Below are the findings from each sensor band. Read them carefully.

--- BAND 1: {Title} ---
{full content of band 1 file}

--- BAND 2: {Title} ---
{full content of band 2 file}

... (repeat for all bands) ...

Your task: Write a synthesis report to research/{topic-slug}/synthesis.md

The synthesis must include:

1. Executive Summary (3-5 sentences): What is the overall answer to the research question?

2. Key Findings (numbered list): The most important conclusions. Tag each with confidence:
   - [HIGH]: supported by multiple independent sources across 2+ bands
   - [MEDIUM]: supported by sources in one band, plausible, no contradicting evidence
   - [LOW]: found in one source only, or contradicted by other sources

3. Cross-Band Themes: Patterns, concepts, or conclusions that appeared in 2 or more bands.
   For each theme, cite the bands where it appeared.

4. Contradictions and Tensions: Where do sources or bands disagree? State both positions
   and assess which has stronger evidence.

5. Research Gaps: What focus questions remain unanswered or only partially answered?
   What would a follow-up sweep need to investigate?

6. Recommendations: 3-5 actionable conclusions or next steps for the user.

Output format -- use exactly this structure:

# Long-Range Sensor Sweep: {question}

**Date**: {YYYY-MM-DD}
**Bands deployed**: {total}
**Bands completed**: {completed}/{total}
**Total sources**: {count}

## Executive Summary
{3-5 sentences}

## Key Findings
1. {finding} [HIGH/MEDIUM/LOW]
2. {finding} [HIGH/MEDIUM/LOW]
...

## Cross-Band Themes
### {Theme name}
{Description. Appeared in: Band X, Band Y.}

## Contradictions and Tensions
{Description of each contradiction with evidence assessment.}
(Write "None identified" if sources are consistent.)

## Research Gaps
- {gap 1}
- {gap 2}
(Write "None -- all focus questions answered" if complete.)

## Recommendations
1. {recommendation}
2. {recommendation}
...

## Band Reports
- [Band 1: {title}](band-1-{slug}.md) -- {COMPLETE / INCOMPLETE: N questions unanswered}
- [Band 2: {title}](band-2-{slug}.md) -- {status}
...

Write the file now. Do not include meta-commentary about your process.

CONTEXT EFFICIENCY: For large band files (>200 lines), focus on the Findings and Sources sections. Skip skeleton headers and status lines. Extract the substantive content, not the scaffolding.
```

### Findings File (Dual-Purpose Recovery Document)

After the synthesis agent completes, create `research/{topic-slug}/findings.md` as a structured recovery document:

```markdown
---
research_id: {topic-slug}
question: {research question}
date: {YYYY-MM-DD}
bands_completed: {N}/{total}
total_sources: {count}
status: {complete|partial}
evidence_quality: {percentage of T1-T2 findings}
---

# Findings: {research question}

## Recovery Context
<!-- For agent resumption: read this section to understand where research left off -->
- **Phase reached**: {phase name}
- **Direction decisions**: {list of decisions made}
- **Open questions**: {any unanswered focus questions from incomplete bands}

## Key Findings
<!-- Each finding is tagged for both human reading and agent parsing -->
{numbered list from synthesis, each with [confidence] and [evidence grade]}

## Evidence Map
<!-- Structured for agent verification on resume -->
| # | Claim | Grade | Source | Band |
|---|-------|-------|--------|------|
{one row per verified claim from claim sweep}

## Gaps and Next Steps
{from synthesis research gaps and recommendations}
```

This file serves two audiences:
1. **Human readers**: Can scan findings, evidence quality, and gaps without reading raw band files
2. **Recovery agents**: Can parse the YAML frontmatter and Evidence Map table to restore research context after compaction

**Phase 5 execution sequence** (follow this order exactly):
1. Synthesis agent runs (step 3 above) and writes synthesis.md
2. Main agent reads synthesis.md (step 4 below)
3. Main agent runs Claim Sweep Gate on synthesis findings
4. Main agent writes findings.md (incorporating claim sweep results into Evidence Map)
5. Main agent makes Direction Decision
6. Update `research-state.yaml`: set `status` to "complete", populate `findings_summary`, record `claim_sweep` results, record final `directions` entry, set `recovery.synthesis_started` to true, update `recovery.last_checkpoint` to "phase-5-complete" and `recovery.resume_from` to "All phases complete; review findings.md for results". Commit final state.

4. After the synthesis agent completes, read `research/{topic-slug}/synthesis.md`.
5. Present the executive summary and key findings directly in the conversation.
6. Report file paths for the full output.

### Evidence Grading

Grade each key finding in the synthesis using a tiered evidence system:

| Grade | Meaning | Criteria |
|-------|---------|----------|
| **T1** | Strong evidence | Multiple peer-reviewed sources agree; methodology is sound and reproducible |
| **T2** | Moderate evidence | 1-2 peer-reviewed sources, or strong grey literature with data |
| **T3** | Weak evidence | Single source, preprint only, or web-source with limited data |
| **T4** | Unverified | No source found; included based on agent reasoning only; flagged for verification |

**Usage in synthesis output:**
Include the evidence grade inline after each key finding:
- "LLM agents score 20-40 on ResearchClawBench [T2, arXiv:2602.18920]"
- "The market for AI research tools is estimated at $2.4B [T3, Gartner 2025 forecast]"
- "Prompt-based orchestration outperforms code-based for research workflows [T4, UNVERIFIED]"

**Synthesis quality gate:** If more than 50% of key findings are T4, flag the research as LOW CONFIDENCE and recommend a DEEPEN direction decision.

### Direction Decision

After synthesizing findings across all bands, make an explicit direction decision:

| Decision | When to use | Action |
|----------|------------|--------|
| **CONCLUDE** | Research question answered with sufficient confidence | Finalize report, proceed to output |
| **DEEPEN** | One band revealed a promising thread needing more depth | Deploy 1-2 new bands focused narrowly on that thread |
| **BROADEN** | Answer is partial; adjacent areas need exploration | Deploy 1-2 new bands covering adjacent topics |
| **PIVOT** | Initial question was wrong or findings suggest a better question | Reformulate the research question, deploy fresh band set |

**Rules:**
- Maximum 2 PIVOTs per research session (prevent infinite research loops)
- Every direction decision MUST include a 1-2 sentence rationale
- DEEPEN and BROADEN deploy additional bands (total max 6 bands across all rounds)
- Default to CONCLUDE if confidence is sufficient; do not over-research
- Track direction history: record each decision in the output for auditability

**Output format (append to synthesis):**
```
DIRECTION: [CONCLUDE|DEEPEN|BROADEN|PIVOT]
RATIONALE: [1-2 sentences explaining why]
CONFIDENCE: [0.0-1.0 in the current findings]
NEXT BANDS: [If not CONCLUDE: list new band titles and focus questions]
PIVOT COUNT: [N of 2 maximum]
```

If DEEPEN or BROADEN: return to Phase 2 (Deploy Sensor Array) with the new bands. If PIVOT: return to Phase 1 (Calibrate Sensors) with the reformulated question. If CONCLUDE: proceed to final report output.

### Claim Sweep Gate (pre-delivery)

Before finalizing any output, perform a claim sweep:

1. **List every factual claim** in the synthesis (numbers, comparisons, dates, named entities)
2. **For each claim**, check: is it grounded in a cited source from the research bands?
3. **Grade each claim**:
   - GROUNDED: Claim traces to a specific source with evidence grade T1-T3
   - INFERRED: Claim derived from reasoning across sources but not directly stated
   - UNGROUNDED: No source supports this claim
4. **Action on ungrounded claims**:
   - If the claim is critical to the answer: flag as [UNVERIFIED] and note the gap
   - If the claim is peripheral: remove it entirely
   - Never leave an ungrounded claim unmarked in the final output
5. **Report sweep results** at the end of the synthesis: "Claim sweep: N grounded, N inferred, N ungrounded (removed/flagged)"

This gate runs BEFORE the direction decision output, not after. If the sweep reveals many ungrounded claims, that should influence the direction decision toward DEEPEN.

### Final output to user

```
Long-Range Sensor Sweep complete.

Research question: {question}
Bands: {completed}/{total} complete
Sources consulted: {count}

Executive Summary:
{paste executive summary from synthesis}

Key Findings:
{paste numbered key findings with confidence tags}

Full report: research/{topic-slug}/synthesis.md
Band reports: research/{topic-slug}/band-{N}-{slug}.md

{If any bands incomplete}: Note: Band {N} ({title}) was incomplete.
  Unanswered questions: {list}
  Confidence in overall synthesis: REDUCED
```

---

## Handling Edge Cases

**No results found by an agent**: If a band file contains fewer than 10 lines after the agent finishes, flag it as LOW CONFIDENCE in the synthesis. Do not suppress it -- partial data is better than silence.

**User interrupts monitoring**: If the user sends a message during Phase 3, acknowledge it, then ask if they want to (a) continue monitoring, (b) proceed to synthesis with available data, or (c) abort.

**Single-band topic**: Even if the research question has only one natural dimension, still use 2 bands. Suggested split: one band for "how/what" (descriptive), one band for "why/implications" (analytical).

**Research question too broad**: If the question spans more than 4 natural domains, acknowledge this to the user and suggest narrowing the question or running two separate sweeps. Do not exceed 4 bands.

---

## Token Budget

| Mode | Bands | Agents | Approx tokens |
|------|-------|--------|---------------|
| --quick | 2 | 2 research + 1 synthesis | ~15,000-25,000 |
| default | 3 | 3 research + 1 synthesis | ~25,000-40,000 |
| --thorough | 4 | 4 research + 1 synthesis | ~40,000-60,000 |

Research agents are `general-purpose` with WebSearch access -- token cost varies by topic depth and number of sources found.

---

## Directory Layout (example)

```
research/
  ai-agent-frameworks-comparison/
    research-state.yaml
    plan.md
    band-1-architecture-patterns.md
    band-2-performance-and-reliability.md
    band-3-ecosystem-and-community.md
    synthesis.md
    findings.md
```

All output is written to disk as it is produced. The skill is resumable -- if interrupted after Phase 2, band files will contain partial data that Phase 4/5 can use.

---

## Worked Example

**User**: `/deep-research "What are the best approaches for LLM-based code review automation?"`

**Phase 1 output**:
```
Long-Range Sensor Sweep -- Calibration Complete

Research question: What are the best approaches for LLM-based code review automation?
Band count: 3

Sensor Band Assignments:
  Band 1 -- Architecture Patterns
    Focus: How do existing tools structure LLM review pipelines? Single-pass vs multi-pass? Agent vs prompt?
  Band 2 -- Quality and Accuracy
    Focus: False positive rates? How do tools handle context windows? Benchmark results?
  Band 3 -- Integration and Adoption
    Focus: CI/CD integration patterns? Developer experience? Cost per review?

Proceed with deployment? [Y/n]
```

**After user confirms**: 3 agents deploy in parallel, each writing incrementally to `research/llm-code-review/band-{N}-*.md`. Monitoring shows progress every 30s/2m/5m. Synthesis agent produces `synthesis.md` with executive summary, cross-band themes, and confidence-tagged findings.

**Final output**: "Long-Range Sensor Sweep complete. 3/3 bands complete. 47 sources consulted." + executive summary + key findings inline.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent produces empty band file | WebSearch returned no results for search terms | Adjust search terms in Phase 1 calibration; try broader terms |
| Agent declared STUCK after first check | Agent slow to start; hasn't written first output yet | Wait until Check 2 (T+2m) before declaring stuck; WAITING != STUCK |
| Synthesis has LOW confidence on all findings | Bands had minimal overlap or contradictory sources | Expected for novel/emerging topics; note as research gap |
| Band file only has skeleton headers | Agent failed to use Write tool incrementally | Rescue via Phase 4; replacement prompt emphasizes write-after-search |
| "Maximum 4 bands" error | User passed `--bands 5` or higher | Hard limit at 4; suggest splitting into two separate sweeps |
| Research directory not created | Permission issue or non-existent parent path | Verify CWD is writable; skill creates `research/` in CWD |

## Recovery After Interruption

If the session terminates unexpectedly during a research sweep:

1. The output directory `research/{topic-slug}/` persists on disk
2. `research-state.yaml` inside it records the last known phase and progress
3. Band files contain partial or complete findings
4. The user can manually inspect state:
   - **Check progress**: `cat research/{slug}/research-state.yaml | head -20`
   - **Check bands**: `ls -la research/{slug}/band-*.md`
   - **Check synthesis**: `ls research/{slug}/synthesis.md research/{slug}/findings.md 2>/dev/null`
   - **Check plan**: `cat research/{slug}/plan.md`
5. To resume: invoke `/deep-research` again with the same question. The agent should read `research-state.yaml` first and skip completed phases.

Provide these instructions if the user reports a crashed research sweep.

---

## Critical Rules

1. **Never dispatch agents before user approves the decomposition plan** (Phase 1 gate).
2. **All research agents run with `run_in_background: true`** -- never block the main thread on research.
3. **Agent prompts must explicitly state the output filepath** -- agents cannot infer it.
4. **No Bash in agent prompts** -- agents use WebSearch, WebFetch, Read, Write only.
5. **Maximum 4 bands** -- enforced regardless of `--bands` value.
6. **Write after every search** -- remind agents of this in their prompt. Incremental writes prevent total loss on failure.
7. **Synthesis agent runs synchronously** (`run_in_background: false`) -- the main agent needs the result to present to the user.
8. **Never hallucinate sources** -- if a band file has no sources, report that gap honestly in the synthesis.

---

*Pattern inspired by [altmbr/claude-research-skill](https://github.com/altmbr/claude-research-skill) (MIT). Clean-room Star Trek-themed reimplementation.*
