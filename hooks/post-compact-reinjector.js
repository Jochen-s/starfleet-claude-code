#!/usr/bin/env node
/**
 * Post-Compact Context Re-injector -- SessionStart hook (compact matcher)
 *
 * Fires after auto or manual compaction to re-inject critical context that
 * compaction may have lost. Stdout gets added to Claude's conversation context.
 *
 * Reads from cache files written by other hooks (e.g., context-threshold-monitor):
 * - session-checkpoint.json: hull tier, recent files, current task
 * - metabolic-state.json: NORMAL/FOCUS/CRISIS/RECOVERY state
 * - context-monitor-state.json: which thresholds have been crossed
 * - budget-state.json: instruction shedding status
 *
 * IMPORTANT: Keep output concise -- every token counts post-compaction.
 * Target: <500 tokens of re-injected context.
 *
 * Quality Ceiling Architecture: 1M window, 400K ceiling (40%).
 * Configure via CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.length > 32 * 1024) return null; // safety cap
    return JSON.parse(raw);
  } catch { return null; }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Only fire on compact events
      if (data.source !== 'compact') return;

      const lines = [];
      lines.push('[Post-Compaction Context Recovery]');

      // 1. Hull integrity state
      const checkpoint = readJson(path.join(CACHE_DIR, 'session-checkpoint.json'));
      if (checkpoint) {
        const tier = checkpoint.hullIntegrity || 'Unknown';
        const used = checkpoint.usedPct || 0;
        lines.push(`Hull integrity: ${tier} (${used}% used). Quality ceiling at 40% (400K tokens).`);

        if (checkpoint.currentTask) {
          lines.push(`Active task: ${String(checkpoint.currentTask).slice(0, 120)}`);
        }

        if (checkpoint.recentFiles && checkpoint.recentFiles.length > 0) {
          const files = checkpoint.recentFiles.slice(0, 8).join(', ');
          lines.push(`Recent files: ${files}`);
        }
      }

      // 2. Metabolic state
      const metabolic = readJson(path.join(CACHE_DIR, 'metabolic-state.json'));
      if (metabolic && metabolic.state !== 'NORMAL') {
        lines.push(`Metabolic state: ${metabolic.state}${metabolic.focusIntent ? ' (focus: ' + metabolic.focusIntent + ')' : ''}`);
      }

      // 3. Threshold crossing state
      const monitorState = readJson(path.join(CACHE_DIR, 'context-monitor-state.json'));
      if (monitorState) {
        const crossed = [];
        if (monitorState.criticalCrossed) crossed.push('Critical');
        else if (monitorState.redCrossed) crossed.push('Red');
        else if (monitorState.amberCrossed) crossed.push('Amber');
        if (crossed.length > 0) {
          lines.push(`Pre-compaction thresholds crossed: ${crossed.join(', ')}`);
        }
      }

      // 4. Instruction shedding status
      const budget = readJson(path.join(CACHE_DIR, 'budget-state.json'));
      if (budget && budget.shedLevel > 0) {
        lines.push(`Instruction shedding was active (level ${budget.shedLevel}). MEMORY.md may need restoration.`);
      }

      // 5. Task snapshot (if available)
      const taskSnapshot = readJson(path.join(CACHE_DIR, 'task-snapshot.json'));
      if (taskSnapshot && taskSnapshot.tasks) {
        const active = taskSnapshot.tasks.filter(t => t.status === 'in_progress');
        if (active.length > 0) {
          const names = active.slice(0, 3).map(t => String(t.subject || 'unnamed').slice(0, 60));
          lines.push(`In-progress tasks: ${names.join('; ')}`);
        }
      }

      // Only output if we have meaningful context to re-inject
      if (lines.length > 1) {
        // Output to stdout -- this gets added to Claude's context
        const output = {
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: lines.join('\n')
          }
        };
        process.stdout.write(JSON.stringify(output));
      }
    } catch {
      // Silent fail -- never break session start
    }
    process.exit(0);
  });
}

main();
