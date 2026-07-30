#!/usr/bin/env node
/**
 * SessionStart hook: Measures total always-on instruction surface.
 * Counts lines in CLAUDE.md, rules, MEMORY.md, and project configs.
 * Outputs a budget report. Must complete in <50ms — pure filesystem reads.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const BUDGET = 150; // Documented attention ceiling in lines

const MAX_FILE_SIZE = 256 * 1024; // 256KB cap per file
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const PRIORITIES_FILE = path.join(CACHE_DIR, 'instruction-priorities.json');
const BUDGET_STATE_FILE = path.join(CACHE_DIR, 'budget-state.json');
const SHED_CONTEXT_FILE = path.join(CACHE_DIR, 'shed-context.json');
const SHED_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function countLines(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function hasPathScope(filePath) {
  // Check if a rule file has paths: frontmatter (path-scoped, not always-on)
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Match YAML frontmatter with paths: field
    return /^---[\s\S]*?^paths:\s*\[/m.test(content);
  } catch { return false; }
}

function countDirLines(dirPath, ext, separateScoped) {
  let alwaysOn = 0;
  let scoped = 0;
  try {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith(ext));
    for (const f of files) {
      const fp = path.join(dirPath, f);
      const lines = countLines(fp);
      if (separateScoped && hasPathScope(fp)) {
        scoped += lines;
      } else {
        alwaysOn += lines;
      }
    }
  } catch { /* dir may not exist */ }
  return separateScoped ? { alwaysOn, scoped } : { alwaysOn: alwaysOn + scoped, scoped: 0 };
}

/**
 * Generate instruction-priorities.json with sensible defaults.
 * Tier 0: Core (never shed), Tier 1: Important (shed at Critical), Tier 2: Nice-to-have (shed at Red).
 */
function generatePriorityTiers(cwd) {
  const priorities = { version: 1, generated: new Date().toISOString(), sources: {} };

  if (fs.existsSync(path.join(CLAUDE_DIR, 'IDENTITY.md'))) priorities.sources['~/.claude/IDENTITY.md'] = 0;
  if (fs.existsSync(path.join(CLAUDE_DIR, 'CLAUDE.md'))) priorities.sources['~/.claude/CLAUDE.md'] = 0;

  try {
    const rulesDir = path.join(CLAUDE_DIR, 'rules');
    for (const r of fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))) {
      priorities.sources[`rules:${r}`] = hasPathScope(path.join(rulesDir, r)) ? 2 : 0;
    }
  } catch { /* no rules dir */ }

  priorities.sources['project:CLAUDE.md'] = 1;
  priorities.sources['project:CLAUDE.local.md'] = 1;
  priorities.sources['memory:MEMORY.md'] = 1;
  priorities.sources['memory:topic-files'] = 2;

  // RECOVERY mode: restore tiers gradually
  try {
    const metabolicPath = path.join(CACHE_DIR, 'metabolic-state.json');
    if (fs.existsSync(metabolicPath)) {
      const metabolic = JSON.parse(fs.readFileSync(metabolicPath, 'utf8'));
      if (metabolic.state === 'RECOVERY') {
        const elapsed = Date.now() - (metabolic.enteredAt || 0);
        // Immediately restore Tier 1, Tier 2 after 5 minutes
        priorities._metabolicNote = 'RECOVERY mode active';
        if (elapsed < 5 * 60 * 1000) {
          priorities._recoveryTierCap = 1; // Only Tier 0+1 active
        }
        // After 5min: all tiers restored (no cap needed)
      }
    }
  } catch { /* non-critical */ }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmpFile = PRIORITIES_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmpFile, JSON.stringify(priorities, null, 2), 'utf8');
    fs.renameSync(tmpFile, PRIORITIES_FILE);
  } catch { /* non-critical */ }
}

/**
 * Check budget-state.json for recent shedding.
 * Returns advisory string or null if no recent shed.
 */
function checkPostShedState() {
  try {
    if (!fs.existsSync(BUDGET_STATE_FILE)) return null;
    const state = JSON.parse(fs.readFileSync(BUDGET_STATE_FILE, 'utf8'));
    if (!state.shedLevel || state.shedLevel === 0) return null;
    const age = Date.now() - new Date(state.timestamp).getTime();
    if (age > SHED_EXPIRY_MS) return null;
    return `Post-compaction: instruction surface was shed to level ${state.shedLevel}. MEMORY.md trimmed to essentials. Shed context preserved — persist key learnings to long-term memory.`;
  } catch { return null; }
}

/**
 * Auto-restore MEMORY.md from shed-context.json when shed state expires.
 * Guards: (1) MEMORY.md must show shed header, (2) hull must be below Red,
 * (3) shed-context must not be from a different session still active,
 * (4) marks restored to prevent re-entry if cleanup fails.
 */
function autoRestoreMemory(cwd) {
  try {
    if (!fs.existsSync(SHED_CONTEXT_FILE)) return;
    const shedContext = JSON.parse(fs.readFileSync(SHED_CONTEXT_FILE, 'utf8'));
    if (!shedContext.originalMemory) return;
    // Re-entry guard: already restored but cleanup failed
    if (shedContext.restored) return;

    // Hull pressure check: don't restore if still under pressure
    const checkpointPath = path.join(CACHE_DIR, 'session-checkpoint.json');
    try {
      if (fs.existsSync(checkpointPath)) {
        const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        const cpAge = Date.now() - new Date(checkpoint.timestamp).getTime();
        // If checkpoint is recent and hull is still Red+, don't restore
        if (cpAge < 15 * 60 * 1000 && checkpoint.usedPct >= 55) return;
      }
    } catch { /* proceed with restore if checkpoint unreadable */ }

    const projectKey = cwd.replace(/\\/g, '/').replace(/[/:]/g, '-').replace(/^-+/, '');
    const memoryPath = path.join(CLAUDE_DIR, 'projects', projectKey, 'memory', 'MEMORY.md');
    if (!fs.existsSync(memoryPath)) return;

    const current = fs.readFileSync(memoryPath, 'utf8');
    if (current.includes('Shed Level')) {
      const tmpMemory = memoryPath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpMemory, shedContext.originalMemory, 'utf8');
      fs.renameSync(tmpMemory, memoryPath);
      // Mark restored before cleanup to prevent re-entry if unlink fails
      shedContext.restored = true;
      try {
        const tmpShed = SHED_CONTEXT_FILE + '.tmp.' + process.pid;
        fs.writeFileSync(tmpShed, JSON.stringify(shedContext, null, 2), 'utf8');
        fs.renameSync(tmpShed, SHED_CONTEXT_FILE);
      } catch {}
      try { fs.unlinkSync(BUDGET_STATE_FILE); } catch {}
      try { fs.unlinkSync(SHED_CONTEXT_FILE); } catch {}
    }
  } catch { /* non-critical */ }
}

function main() {
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  // Determine project cwd from hook input — validate to prevent path traversal
  let cwd = process.cwd();
  try {
    const hookData = JSON.parse(input);
    if (hookData.cwd && typeof hookData.cwd === 'string') {
      const resolved = path.resolve(hookData.cwd);
      // Reject UNC paths on Windows and verify normalization
      if (!resolved.startsWith('\\\\') && !resolved.startsWith('//') &&
          resolved === path.normalize(resolved)) {
        try {
          const stat = fs.statSync(resolved);
          if (stat.isDirectory()) cwd = resolved;
        } catch { /* use process.cwd() */ }
      }
    }
  } catch { /* use process.cwd() */ }

  const breakdown = {};

  // Identity Manifest (Tier 0 — never shed)
  breakdown['IDENTITY.md'] = countLines(path.join(CLAUDE_DIR, 'IDENTITY.md'));

  // Global CLAUDE.md
  breakdown['Global CLAUDE.md'] = countLines(path.join(CLAUDE_DIR, 'CLAUDE.md'));

  // Rules (separate always-on from path-scoped)
  const rules = countDirLines(path.join(CLAUDE_DIR, 'rules'), '.md', true);
  breakdown['Rules (always-on)'] = rules.alwaysOn;
  breakdown['Rules (path-scoped)'] = rules.scoped;

  // MEMORY.md (project-specific auto-memory)
  // Normalize case + separators to match Claude Code's project key derivation
  const projectKey = cwd.replace(/\\/g, '/').replace(/[/:]/g, '-').replace(/^-+/, '');
  const memoryDir = path.join(CLAUDE_DIR, 'projects', projectKey, 'memory');
  const memoryPath = path.join(memoryDir, 'MEMORY.md');
  breakdown['MEMORY.md'] = countLines(memoryPath);

  // Project CLAUDE.md
  breakdown['Project CLAUDE.md'] = countLines(path.join(cwd, 'CLAUDE.md'));

  // Project CLAUDE.local.md
  breakdown['CLAUDE.local.md'] = countLines(path.join(cwd, 'CLAUDE.local.md'));

  // Always-on = everything except path-scoped rules
  const scopedLines = breakdown['Rules (path-scoped)'] || 0;
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const alwaysOn = total - scopedLines;

  let status = 'OK';
  if (alwaysOn > BUDGET + 50) status = 'OVER';
  else if (alwaysOn > BUDGET) status = 'WARN';

  // Build breakdown string
  const parts = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  // Hook health check: verify all hook command files exist
  const missing = [];
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
    const hooks = settings.hooks || {};
    for (const [, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        for (const h of (group.hooks || [])) {
          if (h.type !== 'command') continue;
          // Extract file path from command (handles "node path/file.js" and bare commands)
          const match = h.command.match(/"([^"\r\n]+\.(js|py|sh))"|(\S+\.(js|py|sh))/);
          if (match) {
            const filePath = match[1] || match[3];
            const resolved = path.resolve(filePath);
            // Only check files under ~/.claude/ or known system paths
            if (resolved.startsWith(CLAUDE_DIR + path.sep) || resolved.startsWith(CLAUDE_DIR)) {
              try { fs.statSync(resolved); } catch { missing.push(path.basename(resolved)); }
            }
          }
        }
      }
    }
  } catch { /* settings read failed — skip health check */ }

  let healthNote = '';
  if (missing.length > 0) {
    healthNote = ` MISSING HOOKS: ${missing.join(', ')}`;
  }

  // Generate priority tiers (auto, every session start)
  generatePriorityTiers(cwd);

  // Check for post-compaction shed state
  const shedAdvisory = checkPostShedState();

  // Auto-restore MEMORY.md if shed state expired
  if (!shedAdvisory) {
    autoRestoreMemory(cwd);
  }

  let reason = `Instruction surface: ${alwaysOn} always-on lines (budget: ${BUDGET}), ${scopedLines} path-scoped. Status: ${status}. [${parts}]${healthNote}`;
  if (shedAdvisory) {
    reason += ` | ${shedAdvisory}`;
  }

  const output = JSON.stringify({
    result: 'continue',
    reason,
    hookSpecificOutput: {
      additionalContext: reason
    }
  });
  process.stdout.write(output + '\n');

  process.exit(0);
}

main();
