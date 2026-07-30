#!/usr/bin/env node
/**
 * PostToolUse hook: Auto-fix diagnostics — silent linting after Edit/Write.
 *
 * Runs py_compile + ruff on Python files, JSON syntax validation after
 * every Edit/Write. Errors injected as additionalContext with
 * "Fix silently, don't announce."
 *
 * Source: AIPass (A-001 from assimilation assessment)
 *
 * Constraints:
 * - Must complete in <200ms (target <100ms for PostToolUse)
 * - Gated behind metabolic state: skip in CRISIS/FOCUS
 * - Same-file dedup: skip if just checked this file in last 5 seconds
 * - Circuit breaker integrated
 * - Always exits 0 — never blocks the pipeline
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('auto-fix-diagnostics')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
const { redactSecrets } = require('./lib/redact-secrets');

const HOOK_NAME = 'auto-fix-diagnostics';
const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const METABOLIC_FILE = path.join(CACHE_DIR, 'metabolic-state.json');
const DEDUP_FILE = path.join(CACHE_DIR, 'autofix-dedup.json');
const DEDUP_WINDOW_MS = 5000; // Skip re-check within 5 seconds
const EXEC_TIMEOUT_MS = 3000; // Hard timeout for external tool calls
const TOOL_UNAVAILABLE = '__tool_unavailable__';

/**
 * Read metabolic state. Returns state string or 'NORMAL' on error.
 */
function getMetabolicState() {
  try {
    const data = JSON.parse(fs.readFileSync(METABOLIC_FILE, 'utf8'));
    return data.state || 'NORMAL';
  } catch { return 'NORMAL'; }
}

/**
 * Check if we recently checked this file (dedup within DEDUP_WINDOW_MS).
 * Returns true if we should skip.
 */
function isDuplicate(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8'));
    const data = Object.create(null);
    Object.assign(data, raw);
    const entry = data[filePath];
    if (entry && (Date.now() - entry) < DEDUP_WINDOW_MS) return true;
  } catch { /* no dedup file yet */ }
  return false;
}

/**
 * Record that we checked a file.
 */
function recordCheck(filePath) {
  try {
    let data = Object.create(null);
    try { Object.assign(data, JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8'))); } catch { /* fresh */ }
    data[filePath] = Date.now();
    // Prune old entries (>60s) to prevent unbounded growth
    const cutoff = Date.now() - 60000;
    for (const key of Object.keys(data)) {
      if (data[key] < cutoff) delete data[key];
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(DEDUP_FILE, JSON.stringify(data), 'utf8');
  } catch { /* never block on dedup write failure */ }
}

/**
 * Run py_compile on a Python file. Returns error string or null.
 * Uses execFileSync (no shell) to prevent command injection.
 */
function checkPython(filePath) {
  try {
    execFileSync('python3', [
      '-c',
      'import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)',
      filePath
    ], { timeout: EXEC_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] });
    return null;
  } catch (err) {
    // Detect spawn/timeout errors and feed them to circuit breaker
    if (err.code === 'ENOENT' || err.code === 'ETIMEDOUT' || err.killed) {
      recordFailure(HOOK_NAME);
      return TOOL_UNAVAILABLE;
    }
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    if (stderr) return redactSecrets(stderr.split('\n').slice(-3).join(' '));
    return null;
  }
}

/**
 * Run ruff check on a Python file. Returns error string or null.
 * Uses execFileSync (no shell) to prevent command injection.
 */
function checkRuff(filePath) {
  try {
    execFileSync('ruff', ['check', '--no-fix', '--quiet', filePath], {
      timeout: EXEC_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return null;
  } catch (err) {
    // Detect spawn/timeout errors and feed them to circuit breaker
    if (err.code === 'ENOENT' || err.code === 'ETIMEDOUT' || err.killed) {
      recordFailure(HOOK_NAME);
      return TOOL_UNAVAILABLE;
    }
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    if (stdout) {
      const lines = stdout.split('\n').slice(0, 3);
      return redactSecrets(lines.join('; '));
    }
    return null;
  }
}

/**
 * Validate JSON syntax. Returns error string or null.
 * Skips files larger than 256KB to stay within latency budget.
 */
function checkJSON(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 256 * 1024) return null; // Skip large JSON files
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    return null;
  } catch (err) {
    if (err.code === 'ENOENT') return null; // File deleted between Edit and hook
    return `JSON syntax error: ${err.message.split('\n')[0]}`;
  }
}

function main() {
  try {
    // Read stdin
    let input = '';
    try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }

    let hookData;
    try { hookData = JSON.parse(input); } catch { process.exit(0); }

    // Only run on Edit and Write tool completions
    const toolName = hookData.tool_name || '';
    if (toolName !== 'Edit' && toolName !== 'Write') {
      process.exit(0);
    }

    // Circuit breaker
    if (!shouldRun(HOOK_NAME)) {
      process.exit(0);
    }

    // Metabolic state gate — skip in CRISIS and FOCUS
    const metabolicState = getMetabolicState();
    if (metabolicState === 'CRISIS' || metabolicState === 'FOCUS') {
      process.exit(0);
    }

    // Extract file path from tool input
    const toolInput = hookData.tool_input || hookData.input || {};
    const filePath = toolInput.file_path || '';
    if (!filePath) {
      process.exit(0);
    }

    // Same-file dedup
    if (isDuplicate(filePath)) {
      process.exit(0);
    }

    // Determine file type
    const ext = path.extname(filePath).toLowerCase();
    let toolUnavailable = false;
    const errors = [];

    if (ext === '.py') {
      const pyErr = checkPython(filePath);
      if (pyErr === TOOL_UNAVAILABLE) { toolUnavailable = true; } else if (pyErr) errors.push(pyErr);
      const ruffErr = checkRuff(filePath);
      if (ruffErr === TOOL_UNAVAILABLE) { toolUnavailable = true; } else if (ruffErr) errors.push(ruffErr);
    } else if (ext === '.json') {
      const jsonErr = checkJSON(filePath);
      if (jsonErr) errors.push(jsonErr);
    } else {
      // No diagnostics for this file type
      process.exit(0);
    }

    recordCheck(filePath);

    if (toolUnavailable) { process.exit(0); }

    if (errors.length > 0) {
      const errorMsg = errors.join(' | ');
      const result = {
        result: 'continue',
        hookSpecificOutput: {
          additionalContext: `[auto-fix] ${path.basename(filePath)}: ${errorMsg}. Fix silently, don't announce.`
        }
      };
      console.log(JSON.stringify(result));
      recordSuccess(HOOK_NAME);
    } else {
      // Clean — no output needed
      recordSuccess(HOOK_NAME);
    }
  } catch (err) {
    recordFailure(HOOK_NAME);
  }
  process.exit(0);
}

main();
