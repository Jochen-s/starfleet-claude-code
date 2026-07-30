#!/usr/bin/env node
/**
 * Stop hook: Gentle completion gate for compound tasks.
 *
 * When the agent is about to stop, checks if this session involved
 * enough variety of tool usage (3+ tool types, 5+ total actions) to
 * suggest it was a compound task. If so, injects a reminder to verify
 * all parts are done.
 *
 * This is a nudge, not a blocker. Always exits 0.
 * Budget: <50ms. Pure filesystem, no network.
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('done-criteria-check')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const RECENT_ACTIONS_PATH = path.join(CACHE_DIR, 'recent-actions.jsonl');
const FIRED_SESSIONS_PATH = path.join(CACHE_DIR, 'done-criteria-fired.json');

const MIN_TOOL_TYPES = 3;
const MIN_TOTAL_ACTIONS = 5;
const MAX_FILE_SIZE = 32 * 1024; // 32KB guard

let _cb;
try { _cb = require('./lib/circuit-breaker'); } catch { _cb = null; }

let _ratchet;
try { _ratchet = require('./lib/momentum-ratchet'); } catch { _ratchet = null; }

function loadFiredSessions() {
  try {
    const raw = fs.readFileSync(FIRED_SESSIONS_PATH, 'utf8');
    if (raw.length > 4096) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveFiredSessions(data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    // Trim to last 100 sessions to avoid unbounded growth
    const keys = Object.keys(data);
    if (keys.length > 100) {
      const trimmed = {};
      keys.slice(-100).forEach(k => { trimmed[k] = data[k]; });
      data = trimmed;
    }
    const tmpPath = FIRED_SESSIONS_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
    fs.renameSync(tmpPath, FIRED_SESSIONS_PATH);
  } catch {
    // Non-fatal — dedup best-effort
  }
}

function readRecentActions() {
  try {
    if (!fs.existsSync(RECENT_ACTIONS_PATH)) return [];
    const raw = fs.readFileSync(RECENT_ACTIONS_PATH, 'utf8');
    if (raw.length > MAX_FILE_SIZE) return [];
    return raw.trim().split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
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

  // Guard against Stop hook loops
  if (hookData.stop_hook_active) {
    process.exit(0);
  }

  // Circuit breaker
  if (_cb && !_cb.shouldRun('done-criteria-check')) {
    process.exit(0);
  }

  const sessionId = hookData.session_id || '';

  try {
    // Dedup: only fire once per session
    const firedSessions = loadFiredSessions();
    if (sessionId && firedSessions[sessionId]) {
      process.exit(0);
    }

    // Read action buffer and filter to this session
    const allActions = readRecentActions();
    const sessionActions = sessionId
      ? allActions.filter(a => a.session === sessionId)
      : allActions;

    if (sessionActions.length < MIN_TOTAL_ACTIONS) {
      if (_cb) _cb.recordSuccess('done-criteria-check');
      process.exit(0);
    }

    const uniqueToolTypes = new Set(
      sessionActions.map(a => a.tool).filter(Boolean)
    );

    if (uniqueToolTypes.size < MIN_TOOL_TYPES) {
      if (_cb) _cb.recordSuccess('done-criteria-check');
      process.exit(0);
    }

    // Thresholds met: mark fired and emit reminder
    if (sessionId) {
      firedSessions[sessionId] = Date.now();
      saveFiredSessions(firedSessions);
    }

    const toolCount = uniqueToolTypes.size;
    const actionCount = sessionActions.length;

    const message =
      `This session involved ${toolCount} tool types across ${actionCount} operations. ` +
      `Before stopping, verify all parts of your task are complete: ` +
      `files saved, commands run, outputs confirmed, and nothing left in progress.`;

    let ratchetMessage = '';
    if (_ratchet) {
      try {
        const counts = _ratchet.detectArtifacts(sessionActions);
        ratchetMessage = ' ' + _ratchet.formatMessage(counts);
      } catch { /* non-critical */ }
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: message + ratchetMessage
      }
    };

    process.stdout.write(JSON.stringify(output));

    // Silent cross-session firing log (30-day calibration, no SessionStart injection yet)
    // Source: Laurenzo study -- stop violations as leading quality indicator.
    // Log firing events for future analysis of baseline firing rate.
    try {
      const logPath = path.join(CACHE_DIR, 'done-criteria-firings.jsonl');
      // Rotate if over 64KB: atomic tmp+rename to prevent data loss
      try {
        const logStat = fs.statSync(logPath);
        if (logStat.size > 64 * 1024) {
          const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
          const tmp = logPath + '.tmp.' + process.pid;
          fs.writeFileSync(tmp, lines.slice(-50).join('\n') + '\n');
          fs.renameSync(tmp, logPath);
        }
      } catch { /* file doesn't exist yet -- fine, append will create it */ }
      const entry = JSON.stringify({
        ts: Date.now(),
        session: sessionId,
        toolTypes: toolCount,
        actions: actionCount,
      });
      fs.appendFileSync(logPath, entry + '\n');
    } catch { /* non-critical */ }

    if (_cb) _cb.recordSuccess('done-criteria-check');
  } catch (e) {
    if (_cb) _cb.recordFailure('done-criteria-check');
  }

  process.exit(0);
}

main();
