---
name: effort-profile
description: "Adjust reasoning depth and workflow behavior — quick/standard/thorough profiles. Trigger: go faster, be more thorough, reasoning depth, effort level."
invocation: /effort <profile>
arguments:
  profile:
    description: "quick | standard | thorough (omit to show current)"
    required: false
---

# Effort Profile Skill

Adjusts Claude's reasoning depth and workflow behavior for the session.

## Usage

```
/effort quick      # Fast mode — typos, lookups, simple edits
/effort standard   # Default — features, refactoring, moderate tasks
/effort thorough   # Deep mode — architecture, security, critical code
/effort            # Show current profile and options
```

## Profiles

### quick (green)

**For**: Typos, simple edits, file reads, lookups, one-line changes.

**Behavior**:
- Medium reasoning effort
- Skip brainstorming
- Minimal verification
- Direct answers without elaboration
- Do NOT use `superpowers:brainstorming` or `superpowers:verification-before-completion` unless explicitly asked

**Session instruction**: "Skip brainstorming. Minimal verification. Direct answers. Don't use superpowers:brainstorming or superpowers:verification-before-completion unless explicitly asked."

---

### standard (default)

**For**: Features, refactoring, moderate bug fixes, multi-step tasks.

**Behavior**:
- High reasoning effort (default)
- Standard verification before completion
- Follow workflow defaults from CLAUDE.md
- Use superpowers as directed by CLAUDE.md quality gates

**Session instruction**: "Follow standard workflow defaults from CLAUDE.md."

---

### thorough (orange)

**For**: Architecture decisions, security-critical code, complex debugging, irreversible changes.

**Behavior**:
- Maximum reasoning effort
- MANDATORY brainstorming before any creative/feature work
- Run `/evaluate` after every implementation
- Use `superpowers:verification-before-completion` before claiming done
- Consider adversarial review for critical changes
- Apply full Failure-Mode Checklist for Station 2+ actions

**Session instruction**: "MANDATORY: Use superpowers:brainstorming before any creative work. Run /evaluate after every implementation. Use superpowers:verification-before-completion before claiming done. Consider adversarial review for critical changes."

---

## Mechanism

When a profile is selected, this skill:

1. Writes profile state to `~/.claude/cache/current-effort-profile.json`:
   ```json
   {
     "profile": "<quick|standard|thorough>",
     "setAt": "<ISO timestamp>"
   }
   ```

2. Outputs the session-level behavioral instruction for the selected profile

3. Displays a confirmation showing what changed

## Implementation Steps

When this skill is invoked, Claude should:

1. Parse the profile argument from the `/effort` invocation
2. If no argument given, read `~/.claude/cache/current-effort-profile.json` and show current profile
3. Validate the profile is one of: `quick`, `standard`, `thorough`
4. Write the profile state using the Write tool to `~/.claude/cache/current-effort-profile.json`:
   ```json
   {"profile": "<name>", "setAt": "<ISO timestamp>"}
   ```
5. Output the behavioral instruction and confirmation (see format below)

## Confirmation Output Format

```
Effort profile set: [PROFILE NAME]

Reasoning: [medium|high|max]
Brainstorming: [skipped|optional|mandatory]
Verification: [minimal|standard|mandatory]

Session instruction active:
"[instruction text]"
```

## Notes

- Profile persists for the current session only (written to cache, not settings)
- `standard` is always the fallback if no profile is set
- `thorough` overrides any shortcuts — even if a task seems simple
- Profile does not affect tool permissions, only behavioral guidance
