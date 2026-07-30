---
name: confidence
description: Metacognitive know/don't-know assessment before deep research or complex implementation. Surfaces knowledge gaps to prevent wasted exploration cycles.
---

# /confidence -- Epistemic State Assessment

Structured assessment of what you know vs. what you're assuming vs. what you don't know about the current task. Run before /deep-research, complex multi-file implementation, or any task where wrong assumptions could waste a phase.

## When to Invoke

- Before /deep-research on a new topic
- Before implementing a feature touching 3+ files
- When capability-readiness instinct fires
- When you realize you're "guessing" at an approach
- On user request

## Process

### Step 1: Identify the Task Scope

State the task in one sentence. Then list the 3-5 key technical questions the task depends on.

### Step 2: Classify Knowledge State

For each question, classify into exactly one category:

```
| Question | State | Evidence | Gap-Closing Action |
|----------|-------|----------|-------------------|
| [question] | KNOWN | [file:line, doc URL, or K-LEAN entry] | - |
| [question] | ASSUMED | [reasoning basis, no hard evidence] | [verify how] |
| [question] | UNKNOWN | - | [research action needed] |
```

Rules:
- KNOWN requires a citable source (file in codebase, documentation, K-LEAN entry, prior session evidence)
- ASSUMED means you have a reasonable belief but no hard evidence. State the assumption explicitly.
- UNKNOWN means you have no basis for a judgment. Do not guess.

### Step 3: Risk Assessment

```
Confidence Score: [KNOWN count] / [total questions] = [percentage]%
Risk Level: HIGH (< 50%) | MEDIUM (50-75%) | LOW (> 75%)
```

If Risk Level is HIGH:
- Do NOT proceed with implementation
- Execute gap-closing actions for UNKNOWN items first
- Recommend /deep-research or specific file reads

If Risk Level is MEDIUM:
- Proceed with caution
- Flag ASSUMED items as verification checkpoints during implementation
- Consider /self-correct before committing

If Risk Level is LOW:
- Proceed normally
- ASSUMED items become post-implementation verification items

### Step 4: Output

Present the assessment table + risk level, then ask:

```
Confidence: [X/Y] ([percentage]%)
Risk: [HIGH/MEDIUM/LOW]
Unknowns: [count] requiring action
Assumptions: [count] requiring verification

Proceed? [Y / research unknowns first / verify assumptions first]
```

## What This Skill Does NOT Do

- Does not replace /deep-research (confidence identifies gaps; deep-research fills them)
- Does not replace fleet review (confidence is pre-implementation; fleet reviews output)
- Does not auto-research unknowns (it surfaces them for human decision on what to investigate)

## Design Rationale

From Compound Knowledge Plugin fleet review (2026-03-24): /kw:confidence is a genuine gap in our setup. We have no explicit "what do I know vs. what don't I know" assessment. Instincts encode past knowledge; fleet reviews evaluate output; but nothing surfaces uncertainty about the CURRENT task in real time. This prevents research rabbit holes (exploring what you already know) and implementation failures (building on unverified assumptions). Ferengi ROI: 5-minute assessment prevents 30-60 minutes of wasted exploration.
