#!/usr/bin/env node
/**
 * PostToolUseFailure hook: Tracks consecutive failures and suggests recovery.
 *
 * After 3+ failures in a session, suggests /kln:rethink.
 * After 5+ failures, suggests /relief-on-station or stepping back.
 * Resets counter on each new session.
 *
 * Also writes metadata-only failure dump files to ~/.claude/cache/failures/
 * for post-session analysis. Dumps are rotated every 30 days with a 10MB cap.
 *
 * Must complete in <50ms — sync filesystem only, no network.
 * Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
const { redactSecrets } = require('./lib/redact-secrets');

const STATE_PATH = path.join(
  os.homedir(),
  '.claude', 'cache', 'failure-state.json'
);

const FAILURES_DIR = path.join(
  os.homedir(),
  '.claude', 'cache', 'failures'
);

const MAX_STATE_SIZE = 64 * 1024;
const RETHINK_THRESHOLD = 3;
const RELIEF_THRESHOLD = 5;

// Rotation constants
const ROTATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ROTATION_SIZE_HARD_CAP = 10 * 1024 * 1024;       // 10 MB
const ROTATION_SIZE_TARGET   =  7 * 1024 * 1024;       //  7 MB

/**
 * Atomic write: write to temp file then rename.
 * Prevents corrupt reads if the process is interrupted mid-write.
 */
function atomicWriteSync(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    if (raw.length > MAX_STATE_SIZE) return {};
    const state = JSON.parse(raw);
    return typeof state === 'object' && state !== null ? state : {};
  } catch { return {}; }
}

function saveState(state) {
  const dir = path.dirname(STATE_PATH);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
  atomicWriteSync(STATE_PATH, JSON.stringify(state));
}

/**
 * Write a metadata-only failure dump for post-session analysis.
 * No full payloads, no tool_input, no raw error strings beyond 120 chars.
 */
function writeFailureDump(sessionId, toolName, error, consecutiveFailures, recentTools) {
  try {
    fs.mkdirSync(FAILURES_DIR, { recursive: true });

    const timestamp = new Date().toISOString();
    const rawSummary = typeof error === 'string' ? error.slice(0, 120) : '';
    const errorSummary = redactSecrets(rawSummary);

    const firstWord = typeof error === 'string' ? error.trim().split(/\s+/)[0] : '';
    const errorType = firstWord || 'unknown';

    const dump = {
      timestamp,
      sessionId,
      toolName,
      errorType,
      errorSummary,
      consecutiveFailures,
      recentTools,
    };

    // Filename: ISO timestamp with colons replaced (filesystem-safe) + tool name
    const safeTs = timestamp.replace(/:/g, '-').replace(/\./g, '-');
    const safeTool = String(toolName).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
    const dumpPath = path.join(FAILURES_DIR, `${safeTs}-${safeTool}.json`);

    atomicWriteSync(dumpPath, JSON.stringify(dump, null, 2));
  } catch { /* never throw — must not break the hook pipeline */ }
}

/**
 * Rotate failure dumps: delete files older than 30 days, then enforce 10MB cap.
 * Runs once per session (when sessionId changes). Slightly slower than per-failure
 * writes is acceptable since this only runs at session boundaries.
 */
function rotateFailureDumps() {
  try {
    fs.mkdirSync(FAILURES_DIR, { recursive: true });
    const now = Date.now();

    let entries;
    try {
      entries = fs.readdirSync(FAILURES_DIR);
    } catch { return; }

    // Collect stat info for all .json dump files
    const files = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const filePath = path.join(FAILURES_DIR, name);
      try {
        const stat = fs.statSync(filePath);
        files.push({ name, filePath, mtime: stat.mtimeMs, size: stat.size });
      } catch { /* skip unreadable */ }
    }

    // Step 1 — Delete files older than 30 days
    for (const f of files) {
      if (now - f.mtime > ROTATION_MAX_AGE_MS) {
        try { fs.unlinkSync(f.filePath); } catch { /* ignore */ }
      }
    }

    // Re-collect after age-based deletions
    const remaining = files.filter(f => {
      if (now - f.mtime > ROTATION_MAX_AGE_MS) return false;
      // Check file still exists
      try { fs.statSync(f.filePath); return true; } catch { return false; }
    });

    // Step 2 — Enforce 10MB size cap; delete oldest until under 7MB
    let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > ROTATION_SIZE_HARD_CAP) {
      // Sort oldest first
      remaining.sort((a, b) => a.mtime - b.mtime);
      for (const f of remaining) {
        if (totalSize <= ROTATION_SIZE_TARGET) break;
        try {
          fs.unlinkSync(f.filePath);
          totalSize -= f.size;
        } catch { /* ignore */ }
      }
    }
  } catch { /* never throw */ }
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

  if (!shouldRun('failure-recovery')) {
    process.exit(0);
  }

  try {
  const sessionId = hookData.session_id || 'unknown';
  const toolName = hookData.tool_name || 'unknown';
  const error = hookData.error || '';

  // Load and update failure counter
  const state = loadState();
  const isNewSession = !state.sessionId || state.sessionId !== sessionId;
  if (isNewSession) {
    // New session — reset counter and run dump rotation
    state.sessionId = sessionId;
    state.failures = 0;
    state.tools = [];
    rotateFailureDumps();
  }

  state.failures = (state.failures || 0) + 1;

  // Track last 10 failed tools (cap array size)
  if (!Array.isArray(state.tools)) state.tools = [];
  state.tools.push(toolName);
  if (state.tools.length > 10) {
    state.tools = state.tools.slice(-10);
  }

  saveState(state);

  // Write metadata-only failure dump (additive — does not affect suggestions)
  writeFailureDump(sessionId, toolName, error, state.failures, state.tools.slice(-5));

  // Extract error summary (first 120 chars, redacted via redact-secrets)
  const errorSummary = redactSecrets(typeof error === 'string' ? error.slice(0, 120) : '');
  // Loop detection is handled by loop-detector.js (PostToolUse hook) -- not duplicated here.

  // Determine suggestion level
  let suggestion = '';

  if (state.failures >= RELIEF_THRESHOLD) {
    const parts = [
      `${state.failures} tool failures this session (${state.tools.slice(-3).join(', ')}).`,
    ];
    if (errorSummary) {
      parts.push(`Last error: ${errorSummary}`);
    }
    parts.push('Recommended: /kln:rethink for contrarian debugging ideas,');
    parts.push('or /relief-on-station if context is exhausted.');
    parts.push('Stepping back to re-read the problem often helps more than retrying.');
    suggestion = parts.join(' ');
  } else if (state.failures >= RETHINK_THRESHOLD) {
    const parts = [
      `${state.failures} consecutive tool failures (${state.tools.slice(-3).join(', ')}).`,
    ];
    if (errorSummary) {
      parts.push(`Last error: ${errorSummary}`);
    }
    parts.push('Consider running /kln:rethink for a fresh debugging perspective.');
    suggestion = parts.join(' ');
  }

  if (suggestion) {
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: suggestion,
      },
    });
    process.stdout.write(output + '\n');
  }

  recordSuccess('failure-recovery');
  } catch (e) {
    recordFailure('failure-recovery');
  }
  process.exit(0);
}

main();
