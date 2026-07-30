/**
 * Shared circuit breaker for Claude Code hooks.
 *
 * Usage:
 *   const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
 *   if (!shouldRun('my-hook-name')) process.exit(0);
 *   try { ... recordSuccess('my-hook-name'); }
 *   catch (e) { recordFailure('my-hook-name'); }
 *
 * State file: ~/.claude/cache/hook-circuit-breaker.json
 * Trips after 3 consecutive failures. Auto-resets after 30 minutes.
 * All operations are sync and <5ms.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_PATH = path.join(os.homedir(), '.claude', 'cache', 'hook-circuit-breaker.json');
const MAX_FAILURES = 3;
const RESET_MS = 30 * 60 * 1000; // 30 minutes
const MAX_STATE_SIZE = 64 * 1024;

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    if (raw.length > MAX_STATE_SIZE) return {};
    const state = JSON.parse(raw);
    return typeof state === 'object' && state !== null ? state : {};
  } catch { return {}; }
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_PATH);
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
    const tmpPath = STATE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpPath, STATE_PATH);
  } catch { /* never break caller */ }
}

/**
 * Check if a hook should run. Returns false if circuit is open (tripped).
 */
function shouldRun(hookName) {
  const state = loadState();
  const entry = state[hookName];
  if (!entry) return true;

  if (entry.failures >= MAX_FAILURES) {
    // Check if reset period has elapsed
    const elapsed = Date.now() - (entry.lastFailure || 0);
    if (elapsed >= RESET_MS) {
      // Auto-reset — give it another chance
      delete state[hookName];
      saveState(state);
      return true;
    }
    return false; // Circuit open — skip
  }

  return true;
}

/**
 * Record a successful execution. Resets failure counter.
 */
function recordSuccess(hookName) {
  const state = loadState();
  if (state[hookName]) {
    delete state[hookName];
    saveState(state);
  }
}

/**
 * Record a failed execution. Increments failure counter.
 */
function recordFailure(hookName) {
  const state = loadState();
  const entry = state[hookName] || { failures: 0 };
  entry.failures = (entry.failures || 0) + 1;
  entry.lastFailure = Date.now();
  state[hookName] = entry;
  saveState(state);
}

// ---------------------------------------------------------------------------
// Hook Runtime Profiles
// ---------------------------------------------------------------------------

/**
 * Hook criticality tiers.
 * Hooks not listed default to 'standard'.
 *
 * critical: Always runs. Security, session integrity, data safety.
 * standard: Runs in standard + strict profiles. Most hooks.
 * optional: Runs only in strict profile. Nice-to-have enhancements.
 */
const HOOK_TIERS = {
  // Critical — never skip
  'protect-secrets':     'critical',
  'stop-task-checker':   'critical',
  'captain-log':         'critical',
  'correction-capture':  'critical',
  'action-logger':       'critical',
  'project-state-loader':'critical',
  'project-state-saver': 'critical',
  'instinct-injector':   'critical',
  'instinct-decay':      'critical',
  'context-threshold-monitor': 'critical',

  // Standard — runs in standard + strict profiles
  'fragility-hook':      'standard',
  'fragility-cache-builder': 'standard',
  'failure-recovery':    'standard',
  'intent-context':      'standard',
  'annotation-injector': 'standard',
  'instruction-surface-measurer': 'standard',

  // Standard — PostToolUse linting (metabolic-gated, dedup-protected)
  // Note: Python checks ~400ms on Windows due to process spawn; non-Python <110ms
  'auto-fix-diagnostics':'standard',

  // Optional — only in strict profile
  'freshness-guard':     'optional',
  'read-budget':         'optional',
  'console-log-warn':    'optional',
  'permission-logger':   'optional',
  'gate-tracker':        'optional',
  'auto-reflect-trigger':'optional',
  'execution-ratio-monitor': 'optional',
  'dotfiles-auto-backup':'optional',
  'stt-dedup-guard':     'optional',
};

/** Profile hierarchy: which tiers run at each level */
const PROFILE_INCLUDES = {
  minimal:  new Set(['critical']),
  standard: new Set(['critical', 'standard']),
  strict:   new Set(['critical', 'standard', 'optional']),
};

/**
 * Check if a hook should run given the current profile.
 * Reads CLAUDE_HOOK_PROFILE env var (minimal/standard/strict).
 * Default: standard.
 *
 * @param {string} hookName
 * @returns {boolean}
 */
function shouldRunProfile(hookName) {
  const profile = (process.env.CLAUDE_HOOK_PROFILE || 'standard').toLowerCase();
  const allowed = PROFILE_INCLUDES[profile] || PROFILE_INCLUDES.standard;
  const tier = HOOK_TIERS[hookName] || 'standard';
  return allowed.has(tier);
}

module.exports = { shouldRun, recordSuccess, recordFailure, shouldRunProfile };
