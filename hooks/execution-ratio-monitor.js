#!/usr/bin/env node
/**
 * PostToolUse hook: Monitors planning-vs-execution ratio.
 *
 * Reads the recent-actions.jsonl buffer (written by action-logger) and
 * warns when a session is over-indexing on reconnaissance (Read, Glob,
 * Grep, WebFetch, WebSearch, Agent-explore) relative to execution
 * (Edit, Write, substantive Bash).
 *
 * Trigger conditions (all must be true):
 *   - Total tool calls in buffer >= 15
 *   - Planning ratio > 80%
 *   - Last warning was > 5 minutes ago (rate limit)
 *   - Current session matches stored session (reset on new session)
 *
 * Budget: <5ms. Reads one small JSONL file + one small JSON state file.
 * Always exits 0. No network. No transcript reads.
 *
 * Event type: PostToolUse
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('execution-ratio-monitor')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const ACTIONS_FILE = path.join(CACHE_DIR, 'recent-actions.jsonl');
const STATE_FILE = path.join(CACHE_DIR, 'exec-ratio-state.json');

const MIN_TOTAL_CALLS = 15;
const PLANNING_RATIO_THRESHOLD = 0.80; // 80%
const RATE_LIMIT_MS = 5 * 60 * 1000;  // 5 minutes
const MAX_FILE_SIZE = 32 * 1024;       // 32KB guard

// Read:Edit ratio canary (Laurenzo study: collapse from 6.6 to 2.0 = quality regression)
// Only Edit counts (not Write for new files) -- edits without prior reads are the signal.
const MIN_EDIT_COUNT = 8;              // Don't warn on small sessions
const READ_EDIT_RATIO_THRESHOLD = 2.5; // Below this = editing without reading
const READ_EDIT_RATE_LIMIT_MS = 5 * 60 * 1000;

// --- Circuit breaker (optional) ---
let _cb = null;
try { _cb = require('./lib/circuit-breaker'); } catch { /* unavailable — degrade gracefully */ }

// --- Tool classification ---

/**
 * PLANNING tools: gather information without mutating state.
 * EXECUTION tools: mutate files or run substantive commands.
 * NEUTRAL tools: bookkeeping — ignored in ratio calculation.
 *
 * @param {string} toolName
 * @param {object} toolInput
 * @returns {'planning'|'execution'|'neutral'}
 */
function classifyTool(toolName, toolInput) {
  // Neutral — task management and utility tools
  const NEUTRAL = new Set([
    'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
    'Skill', 'AskUserQuestion',
  ]);
  if (NEUTRAL.has(toolName)) return 'neutral';

  // Pure planning tools
  const PLANNING = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
  if (PLANNING.has(toolName)) return 'planning';

  // Agent: classify by subagent_type if available
  if (toolName === 'Agent') {
    const subtype = (toolInput && (toolInput.subagent_type || '')).toLowerCase();
    if (subtype === 'explore' || subtype === 'haiku-explorer') return 'planning';
    // Other agent subtypes are neutral (could be worker agents)
    return 'neutral';
  }

  // Pure execution tools
  if (toolName === 'Edit' || toolName === 'Write') return 'execution';

  // Bash: execution only for substantive commands (not just ls/cat/echo/pwd/which)
  if (toolName === 'Bash') {
    const cmd = typeof toolInput?.command === 'string' ? toolInput.command.trim() : '';
    // Read-only bash patterns — treat as planning
    const READ_ONLY_PATTERN = /^\s*(ls|cat|head|tail|echo|pwd|which|type|env|printenv|diff|stat|file|wc|sort|uniq|test\s|-[a-z])/i;
    if (READ_ONLY_PATTERN.test(cmd) && !containsWriteIndicator(cmd)) {
      return 'planning';
    }
    return 'execution';
  }

  // Default: unknown tools are neutral
  return 'neutral';
}

/**
 * Heuristic: does this bash command contain a write/mutation indicator?
 * Used to override the read-only pattern when a command pipes into a write.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function containsWriteIndicator(cmd) {
  return (
    />>?/.test(cmd) ||            // redirect write or append
    /\b(rm|mv|cp|mkdir|touch|chmod|chown|ln|install|deploy|npm\s+install|pip\s+install|apt|brew)\b/.test(cmd) ||
    /-(exec|delete)\b/.test(cmd)  // find -exec rm, find -delete
  );
}

// --- State helpers ---

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    if (raw.length > 4096) return null; // oversized — ignore
    const state = JSON.parse(raw);
    if (typeof state === 'object' && state !== null) return state;
  } catch { /* file absent or corrupt */ }
  return null;
}

function saveState(state) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmpPath = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpPath, STATE_FILE);
  } catch { /* non-critical — never block agent */ }
}

// --- Buffer reader ---

function readActionBuffer() {
  try {
    const raw = fs.readFileSync(ACTIONS_FILE, 'utf8');
    if (raw.length > MAX_FILE_SIZE) return [];
    return raw.trim().split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return null; // file absent — signal to exit silently
  }
}

// --- Main ---

function main() {
  // Read stdin synchronously (standard hook pattern)
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  // Circuit breaker check
  if (_cb && !_cb.shouldRun('execution-ratio-monitor')) {
    process.exit(0);
  }

  try {
    const sessionId = hookData.session_id || '';

    // Read action buffer — exit silently if file doesn't exist yet
    const buffer = readActionBuffer();
    if (buffer === null) {
      if (_cb) _cb.recordSuccess('execution-ratio-monitor');
      process.exit(0);
    }

    // Load state; reset on new session
    let state = loadState();
    const now = Date.now();

    if (!state || (sessionId && state.sessionId !== sessionId)) {
      state = { lastWarning: 0, sessionId };
    }

    // Count planning vs execution calls in the buffer
    // Also count Read vs Edit specifically for the Read:Edit canary
    let planningCount = 0;
    let executionCount = 0;
    let readCount = 0;
    let editCount = 0;

    for (const entry of buffer) {
      const toolName = entry.tool || '';
      const toolInput = toolName === 'Bash' ? { command: entry.file || '' } : {};
      const category = classifyTool(toolName, toolInput);
      if (category === 'planning') planningCount++;
      else if (category === 'execution') executionCount++;
      // Read:Edit canary -- only count Edit (not Write) to avoid penalizing new file creation
      if (toolName === 'Read') readCount++;
      if (toolName === 'Edit') editCount++;
    }

    const total = planningCount + executionCount;

    // --- Read:Edit Ratio Canary (Laurenzo study) ---
    // Runs BEFORE planning ratio gates so process.exit(0) doesn't skip it.
    // Detects editing without prior reading -- orthogonal to planning ratio.
    // Source: Stella Laurenzo 6,852-session study -- Read:Edit collapse from 6.6 to 2.0
    // correlated with quality regression and 122x cost spike.
    // Threshold 2.5 chosen as early-warning midpoint: healthy=6.6, regression floor=2.0.
    // Uses outer `state` object directly (no double loadState).
    try {
      if (editCount >= MIN_EDIT_COUNT) {
        const readEditRatio = readCount / editCount;
        if (readEditRatio < READ_EDIT_RATIO_THRESHOLD) {
          const lastReadEditWarn = state.lastReadEditWarning || 0;
          if (now - lastReadEditWarn >= READ_EDIT_RATE_LIMIT_MS) {
            state.lastReadEditWarning = now;
            saveState(state);
            process.stderr.write(
              '\n' +
              `Sensor alert: Read:Edit ratio ${readEditRatio.toFixed(1)} (${readCount} reads / ${editCount} edits).\n` +
              `Below ${READ_EDIT_RATIO_THRESHOLD} threshold. Verify each edited file was read before modification.\n` +
              '\n'
            );
          }
        }
      }
    } catch { /* fail-open */ }

    // Gate 1: minimum sample size
    if (total < MIN_TOTAL_CALLS) {
      if (_cb) _cb.recordSuccess('execution-ratio-monitor');
      process.exit(0);
    }

    const planningRatio = planningCount / total;

    // Gate 2: ratio threshold
    if (planningRatio <= PLANNING_RATIO_THRESHOLD) {
      if (_cb) _cb.recordSuccess('execution-ratio-monitor');
      process.exit(0);
    }

    // Gate 3: rate limit
    if (now - state.lastWarning < RATE_LIMIT_MS) {
      if (_cb) _cb.recordSuccess('execution-ratio-monitor');
      process.exit(0);
    }

    // All gates passed — emit warning and update state
    state.lastWarning = now;
    saveState(state);

    const planningPct = Math.round(planningRatio * 100);
    const executionPct = 100 - planningPct;

    process.stderr.write(
      '\n' +
      `Tactical alert: ${planningPct}% reconnaissance, ${executionPct}% action (${planningCount}/${total} planning calls).\n` +
      'Consider engaging -- execute changes rather than gathering more data.\n' +
      '\n'
    );

    if (_cb) _cb.recordSuccess('execution-ratio-monitor');
  } catch {
    if (_cb) _cb.recordFailure('execution-ratio-monitor');
  }

  process.exit(0);
}

main();
