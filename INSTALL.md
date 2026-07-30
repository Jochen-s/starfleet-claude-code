# Installation Guide

> "Engage." -- Captain Picard

Step-by-step setup for Starfleet Claude Code. Assumes you have Claude Code installed and working.

---

## Prerequisites

- **Claude Code** installed and configured ([docs](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js** 18+ (hooks are JavaScript)
- **Git** (for cloning)
- A terminal: bash, zsh, PowerShell, or MINGW64

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/Jochen-s/starfleet-claude-code.git
cd starfleet-claude-code
```

---

## Step 2: Install Skills

Skills are the slash commands (`/bridge-briefing`, `/klingon-review`, etc.). Each skill is a directory containing a `SKILL.md` file and optional persona subdirectories.

```bash
# Create the skills directory if it doesn't exist
mkdir -p ~/.claude/skills

# Copy all skills
cp -r skills/* ~/.claude/skills/
```

This installs:

| Skill | Command | What It Does |
|-------|---------|-------------|
| `bridge-briefing` | `/bridge-briefing` | 5-officer quality deliberation |
| `klingon-review` | `/klingon-review` | 3-warrior security red team |
| `romulan-intel` | `/romulan-intel` | 3-operative strategic intelligence |
| `ferengi-audit` | `/ferengi-audit` | 3-merchant cost optimization |
| `fleet-command` | `/fleet-command` | Multi-faction orchestrator |
| `borg-assimilate` | `/borg-assimilate` | Learning and pattern extraction |
| `opponents-view` | `/opponents-view` | 10-dimension broad analysis |
| `effort-profile` | `/effort` | Token budget profiles |
| `evaluate` | `/evaluate` | Quality evaluation |
| `reflect` | `/reflect` | Session reflection |
| `counselors-log` | `/counselors-log` | Structured session journaling |
| `experiment-loop` | `/experiment-loop` | Autonomous single-file optimization |
| `deep-research` | `/deep-research` | Parallel multi-band research orchestrator |
| `self-correct` | `/self-correct` | Pre-execution adversarial gate |
| `holodeck` | `/holodeck` | Expert persona analysis (8 historical/fictional experts) |
| `adversarial-debate` | `/adversarial-debate` | Multi-reviewer adversarial cross-challenge |
| `away-team` | `/away-team` | Coordinated multi-agent execution |
| `away-mission-qa` | `/away-mission-qa` | Browser QA with health scoring |
| `codex` | `/codex` | Cross-model review (Codex/Gemini) |
| `confidence` | `/confidence` | Epistemic state assessment |
| `containment-field` | `/containment-field` | Edit scope restriction |
| `evolve-yourself` | `/evolve-yourself` | Instinct promotion and export |
| `long-range-sensors` | `/long-range-sensors` | Post-deploy regression canary |
| `make-it-so` | `/make-it-so` | Release pipeline (test, review, commit, PR) |
| `red-alert` | `/red-alert` | Multi-phase security health check |
| `relief-on-station` | `/relief-on-station` | Context exhaustion recovery |
| `retro` | `/retro` | Session retrospective |
| `test-hooks` | `/test-hooks` | Hook health verification |
| `curator-gate` | `/curator-gate` | Instinct persistence quality gate (4-stage pipeline) |
| `doc-garden` | `/doc-garden` | Knowledge hygiene scanner |
| `research-protocol` | `/research-protocol` | Two-loop research orchestrator (deep-research + experiment-loop) |
| `scientific-research` | `/scientific-research` | Citation-backed scientific research with evidence grading |

**Verify**: Run `ls ~/.claude/skills/bridge-briefing/SKILL.md`: should exist.

---

## Step 2b: Install Scripts (Optional)

Scripts are standalone tools invoked by skills. They live in `~/.claude/scripts/`.

```bash
mkdir -p ~/.claude/scripts
cp scripts/*.py scripts/*.json ~/.claude/scripts/
```

This installs:
- `verify-citations.py`: citation verification for grounded research (requires Python 3.8+, no pip deps)
- `klean-schema.json`: JSON Schema for knowledge entry validation

---

## Step 3: Install Hooks

Hooks are lifecycle scripts that fire automatically during Claude Code operation. They power the SAGE behavioral patterns.

```bash
# Create the hooks directory if it doesn't exist
mkdir -p ~/.claude/hooks/lib

# Copy all hooks
cp hooks/*.js ~/.claude/hooks/
cp hooks/lib/*.js ~/.claude/hooks/lib/
```

### Register Hooks in settings.json

Claude Code needs to know about hooks via `~/.claude/settings.json`. Open the file (create it if it doesn't exist):

```bash
# If the file doesn't exist yet:
cp examples/settings.json.example ~/.claude/settings.json

# If you already have a settings.json, merge the hooks section manually
```

The example settings.json registers the core hooks across five lifecycle events:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Edit|Write|Bash",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/fragility-hook.js" }
        ]
      },
      {
        "matcher": "Read|Edit|Write|Bash",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/intent-context.js" }
        ]
      },
      {
        "matcher": "mcp__context7__query-docs",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/annotation-injector.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/action-logger.js" },
          { "type": "command", "command": "node ~/.claude/hooks/context-threshold-monitor.js" },
          { "type": "command", "command": "node ~/.claude/hooks/loop-detector.js" },
          { "type": "command", "command": "node ~/.claude/hooks/execution-ratio-monitor.js" },
          { "type": "command", "command": "node ~/.claude/hooks/auto-fix-diagnostics.js" }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/instruction-surface-measurer.js" },
          { "type": "command", "command": "node ~/.claude/hooks/fragility-cache-builder.js" },
          { "type": "command", "command": "node ~/.claude/hooks/instinct-decay.js" }
        ]
      },
      {
        "matcher": "compact",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/post-compact-reinjector.js" }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/captain-log.js" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/instinct-injector.js" }
        ]
      }
    ]
  }
}
```

**Hook lifecycle events explained**:

| Event | When It Fires | Example Hooks |
|-------|---------------|---------------|
| `SessionStart` | Once when Claude Code starts | Instruction measurer, instinct decay, fragility cache |
| `PreToolUse` | Before every tool invocation | Intent context routing, fragility checks |
| `PostToolUse` | After every tool invocation | Action logger, context threshold monitor, execution ratio |
| `Stop` | When session ends | Captain's log (handoff generator) |
| `SubagentStart` | When a subagent is spawned | Instinct injector |

**Important**: Hook configuration is read at session start only. If you edit `settings.json`, close and restart your Claude Code session for changes to take effect.

**Quality Ceiling**: The hull integrity thresholds are calibrated for a **1M token context window** (Claude Max plan). If you use 1M context, set:

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40
```

This triggers autocompact at 40% (400K tokens) instead of the default 80%, because agent coherence degrades above ~400K tokens due to attention dilution. **If you use 200K context windows** (Pro/default plan), the default 80% autocompact is already correct and you do not need to set this variable. See the README Hull Integrity section for a full threshold table by window size.

### Optional Integrations

Some skills and hooks integrate with external MCP servers or Claude Code features. Everything degrades gracefully when these are absent: no crashes, just reduced functionality.

| Integration | Used By | What Happens Without It |
|-------------|---------|------------------------|
| Context7 MCP (`mcp__context7__*`) | `annotation-injector` hook | Annotation injection is silently skipped |
| Worktree support (`EnterWorktree`) | `experiment-loop` skill | Skill cannot run; tells user worktrees are required |
| Subagent spawning (`Agent` tool) | `bridge-briefing`, `fleet-command`, `deep-research` | Multi-agent skills cannot dispatch reviewers |

All hooks and the core skill set (single-agent skills like `/klingon-review`, `/evaluate`, `/self-correct`) work without any external integrations.

---

## Step 4: Install Agents

Agents are reusable subagent profiles that define capabilities and model preferences.

```bash
mkdir -p ~/.claude/agents
cp agents/*.md ~/.claude/agents/
```

This installs:

| Agent | Purpose |
|-------|---------|
| `commit-analyzer.md` | Analyzes git commits for patterns |
| `devils-advocate.md` | Adversarial review from opposing perspective |

---

## Step 5: Install Instincts

Instincts are confidence-scored behavioral rules injected into subagents. They decay over time if not validated (Trust Tensor Decay, SAGE Pattern 5).

```bash
mkdir -p ~/.claude/instincts
cp instincts/*.md ~/.claude/instincts/
```

Included instincts:

| Instinct | Confidence | Rule |
|----------|------------|------|
| `read-before-edit` | 0.95 | Always read a file before modifying it |
| `hooks-always-exit-zero` | 0.90 | All hooks must exit with code 0 |
| `atomic-file-writes` | 0.80 | Use temp file + rename for state files |
| `verify-background-results` | 0.70 | Check async results for freshness |
| `capability-readiness` | 0.70 | Verify understanding before implementation |
| `scope-gate` | 0.65 | Pre-implementation scope verification |
| `context-bundle-assembly` | 0.70 | Pre-load subagent context bundles |
| `input-classification` | 0.90 | Context guardrail for input routing |
| `dead-element-rule` | 0.90 | Never leave dead elements; archive instead of delete |

Instinct format is simple markdown:

```markdown
**Confidence**: 0.95
**Source**: correction-capture (12 observations)

Always read a file with the Read tool before modifying it with Edit or Write.
Never guess file contents or structure from memory alone.
```

Optional fields for Trust Tensor Decay:
- `**Last validated**: 2026-03-01`: resets the decay clock
- `**Decay floor**: 0.5`: minimum confidence (default: 0.30)

---

## Step 6: Install Rules

Rules are always-on guidelines loaded into every session.

```bash
mkdir -p ~/.claude/rules
cp rules/*.md ~/.claude/rules/
```

Included rules:

| Rule | Purpose |
|------|---------|
| `risk-classification.md` | Action Stations: classify changes by blast radius (Station 0-3) |
| `voice-output.md` | TTS marker guidelines for voice output integration |

---

## Step 7: Configure CLAUDE.md

The global `CLAUDE.md` file sets defaults across all projects. Copy the example and customize:

```bash
cp examples/CLAUDE.md.example ~/.claude/CLAUDE.md
```

Key sections to customize:
- **Core Rules**: Keep or modify the defaults
- **Quality Gates**: The 8-level ladder (L1 self-check through L8 bridge briefing)
- **Subagent Defaults**: Role assignments by capability
- **Self-Learning**: Knowledge base configuration

Per-project overrides go in `{project}/CLAUDE.md`. Machine-specific settings go in `{project}/CLAUDE.local.md` (gitignored).

---

## Step 8: Configure IDENTITY.md (Optional but Recommended)

The Identity Manifest (SAGE Pattern 1) documents the instruction load order and behavioral constants. It is classified as Tier 0: never shed, even under maximum memory pressure.

```bash
cp examples/IDENTITY.md.example ~/.claude/IDENTITY.md
```

The Identity Manifest defines:

1. **Load order**: Which instruction source wins when two conflict
2. **Priority resolution**: Project overrides global, local overrides project
3. **Behavioral constants**: Hooks exit 0, writes are atomic, circuit breakers at 3 failures, 50ms hook budget, 32KB cache file cap, no network in SessionStart

---

## Step 9: Verify Installation

### Check file structure

```bash
# Skills installed?
ls ~/.claude/skills/bridge-briefing/SKILL.md
ls ~/.claude/skills/klingon-review/SKILL.md
ls ~/.claude/skills/fleet-command/

# Hooks installed? (spot-check a few)
ls ~/.claude/hooks/action-logger.js
ls ~/.claude/hooks/fragility-hook.js
ls ~/.claude/hooks/loop-detector.js
ls ~/.claude/hooks/lib/circuit-breaker.js

# Instincts installed?
ls ~/.claude/instincts/read-before-edit.md

# Rules installed?
ls ~/.claude/rules/risk-classification.md

# Identity Manifest?
ls ~/.claude/IDENTITY.md
```

### Test a skill

Start a new Claude Code session and run:

```
/bridge-briefing "Add a caching layer to the API"
```

Expected output:
- A Bridge Briefing with assessments from 5 officers
- Each officer provides a SCORE (0-100), CONFIDENCE (0.0-1.0), and VERDICT
- A final verdict: ENGAGE, ENGAGE WITH CAUTION, ALL STOP, or CAPTAIN'S CALL

### Test hull integrity

The context threshold monitor runs automatically as a PostToolUse hook. As your session progresses and the context window fills, you will see hull integrity alerts:

- **Amber** (25%): "Hull Integrity AMBER -- Checkpoint saved"
- **Red** (33%): "Hull Integrity RED -- Wrap current task, plan for /compact"
- **Critical** (38%): Blinking "Hull Integrity CRITICAL -- Run /compact NOW!"

---

## Step 10: Star Trek Persona (Optional)

To get the full Star Trek experience, add persona configuration to your voice output rule. The included `voice-output.md` rule supports TTS markers and persona adoption.

The included `voice-output.md` has a generic persona system with Star Trek examples. To activate Captain Picard, add a persona field to your voice profile. Example behavior:

- Addresses the user as "Number One"
- Responds to "Jean-Luc" or "Captain"
- Measured, thoughtful, diplomatic tone
- Occasional Shakespearean flourish
- Natural use of "Make it so", "Engage", "Indeed"

To customize, edit the persona section in `voice-output.md` or create your own rule file.

---

## Troubleshooting

### Skills don't appear

Skills must be directories containing a `SKILL.md` file, not flat files. Verify:

```bash
ls ~/.claude/skills/bridge-briefing/SKILL.md
# Should output the file path. If not, the directory structure is wrong.
```

### Hooks don't fire

1. Check `~/.claude/settings.json` has the hooks registered
2. Restart Claude Code (hook config is read at session start only)
3. Verify Node.js is available: `node --version`

### Instincts not injected

The instinct injector fires on `SubagentStart`. It requires:
- Instinct files in `~/.claude/instincts/` with a `**Confidence**:` field
- The `SubagentStart` hook registered in `settings.json`
- Files under 4KB each, maximum 20 files

### Permission errors on Windows

Use forward slashes in paths. If copying to `~/.claude/` fails, try the explicit path:

```bash
# Find your home directory
echo $HOME

# Use explicit path
cp -r skills/* "$HOME/.claude/skills/"
```

### "Hooks must exit 0" errors

All hooks must exit with code 0 regardless of internal errors. If you write custom hooks, wrap all logic in try/catch:

```javascript
try {
  // your hook logic
} catch (e) {
  // log but don't throw
}
process.exit(0);
```

---

## Next Steps

- Read the [README](README.md) for a full overview of all factions and SAGE patterns
- Read the [ATTRIBUTION](ATTRIBUTION.md) for credits and sources
- Try `/fleet-command standard "your project direction"` for a multi-faction review
- Try `/ferengi-audit` to optimize your token spend
- Add your own instincts to `~/.claude/instincts/` as you discover patterns

> "There are four lights." -- Captain Picard, on standing firm under pressure
