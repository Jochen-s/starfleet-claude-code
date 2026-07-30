---
name: retro
description: Structured session retrospective measuring skill accuracy, governance friction, and instinct proposals. Invoke after L3+ quality gate work or significant implementation sessions.
---

# /retro -- Session Retrospective

Run a structured retrospective after significant work sessions. Measures exactly three things to keep signal high and noise low.

## When to Invoke

- After any L3+ quality gate work
- After sessions with 3+ tool failures
- After sessions that changed 5+ files
- On user request

Do NOT invoke after trivial sessions (single file edits, Q&A, quick fixes).

## Process

### Step 1: Gather Evidence (automated)

Collect from available sources (do not block if a source is unavailable):

```
1. git diff --stat HEAD~5  (approximate session changes; adjust N if session had more/fewer commits)
2. Read captain-log or recent-actions.jsonl if available
3. Count PostToolUseFailure events if hook data available
4. List skills invoked this session (from conversation context)
```

### Step 2: Measure Three Metrics

**Metric 1: Skill Accuracy**
For each skill invoked this session:
- Was it the RIGHT skill for the task? (yes/no)
- Did it produce correct output? (yes/no)
- If no: what went wrong? (wrong-skill / incomplete-output / template-anchored / other)

Output as structured table:
```
| Skill | Right Skill? | Correct Output? | Issue |
|-------|-------------|-----------------|-------|
| /fleet-command | yes | yes | - |
| /kln:learn | yes | no | incomplete-output: missed related_to |
```

**Metric 2: Governance Friction**
Identify the single highest-friction governance event this session:
- Which gate/hook/instinct caused the most friction?
- Was the friction justified (caught a real issue) or unjustified (false positive)?
- Specific description (not vague "things were slow")

Output as:
```
Friction: [gate/hook/instinct name]
Justified: [yes/no]
Description: [1 sentence, specific]
```

**Metric 3: Instinct Proposals**
Based on session evidence, propose 0-2 instinct changes:
- New instinct (only if a pattern repeated 3+ times this session)
- Modify existing instinct (confidence adjustment, scope change)
- Retire instinct (if evidence shows it's no longer needed)

Each proposal must include:
```
Action: [add/modify/retire]
Target: [instinct name or "new: proposed-name"]
Evidence: [specific session event that justifies this]
Confidence: [0.0-1.0]
```

### Step 3: Output Report

Present the three metrics in a structured report. Then ask user:

```
Retrospective complete.

Skill Accuracy: [N/M correct] ([percentage]%)
Friction Point: [name] -- [justified/unjustified]
Instinct Proposals: [count]

Actions available:
1. Save to K-LEAN (type: retrospective, priority based on findings)
2. Apply instinct proposals (requires /evolve-yourself or manual edit)
3. Both
4. Skip (no action)
```

### Step 3.5: Contradiction Check (before persist)

For each proposed K-LEAN entry from the retrospective:
1. Run `/kln:find` on the entry's keywords. If `/kln:find` is unavailable, fall back to: `grep -i '<keyword>' ~/.knowledge-db/entries.jsonl | head -5`
2. If any existing entry contradicts the new finding, present both and ask:
   "This contradicts [entry-id]: [title]. Supersede, keep both, or discard?"
3. Do NOT auto-save contradicting entries
4. If neither `/kln:find` nor grep is available, note "contradiction check skipped (K-LEAN unavailable)" and proceed with user warning

This follows the same contradiction resolution protocol as `/kln:learn` Step 2. See that skill for the canonical procedure.

### Step 4: Persist (if user approves)

Save retrospective to K-LEAN via knowledge-capture.py:
```bash
~/.venvs/knowledge-db/Scripts/python.exe ~/.claude/scripts/knowledge-capture.py \
    --json-input '{
      "title": "Retro: [date] [session summary]",
      "insight": "[structured metrics summary]",
      "type": "finding",
      "priority": "[based on friction severity]",
      "keywords": ["retrospective", "session-review", "[friction-source]"],
      "source": "conv:[date]",
      "memory_type": "episodic"
    }' --json
```

## What This Skill Does NOT Do

- Does not auto-apply instinct changes (requires human approval)
- Does not review code quality (use /evaluate or /simplify for that)
- Does not replace /handoff (retro is backward-looking; handoff is forward-looking)
- Does not run fleet reviews (retro is lightweight; fleet is heavyweight)

## Design Rationale

Per fleet review 2026-03-24: Holodeck Commander Governance specified exactly 3 metrics to prevent retrospective bloat. SWE-Skills-Bench finding (6% harmful skills) is only actionable if /retro is structured enough to surface those candidates through Metric 1 (Skill Accuracy). Ferengi finding: retros are only profit if someone acts on them; hence the explicit action gate in Step 3.
