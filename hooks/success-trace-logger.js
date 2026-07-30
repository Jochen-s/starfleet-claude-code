#!/usr/bin/env node
/**
 * Stop hook: Logs successful session execution traces for the learning pipeline.
 *
 * When a session ends WITHOUT user corrections AND with 3+ tool actions, captures
 * the tool sequence, files modified, and tasks completed. This enables learning
 * from what WORKED, not just what failed.
 *
 * Source: Meta-Harness pattern (Stanford, arxiv:2603.28052).
 *
 * Event:  Stop
 * Class:  QUALITY (gated in quick mode)
 * Budget: <50ms. Pure filesystem, no network. Always exits 0.
 *
 * Data sources (all in ~/.claude/cache/):
 *   recent-actions.jsonl     -- rolling tool action buffer (written by action-logger)
 *   learnings-queue.json     -- correction queue (if entries match session_id, skip)
 *   task-completions.jsonl   -- task completion events (written by task-completed-tracker)
 *   session-checkpoint.json  -- hull integrity at session end
 *
 * Output: ~/.claude/cache/success-traces.jsonl
 * Rotation: cap at 100 entries; keep newest 75 when rotating.
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('success-trace-logger')) process.exit(0);

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_DIR         = path.join(os.homedir(), '.claude', 'cache');
const RECENT_ACTIONS    = path.join(CACHE_DIR, 'recent-actions.jsonl');
const LEARNINGS_QUEUE   = path.join(CACHE_DIR, 'learnings-queue.json');
const TASK_COMPLETIONS  = path.join(CACHE_DIR, 'task-completions.jsonl');
const SESSION_CHECKPOINT= path.join(CACHE_DIR, 'session-checkpoint.json');
const SUCCESS_TRACES    = path.join(CACHE_DIR, 'success-traces.jsonl');

const MIN_TOOL_ACTIONS  = 3;     // Minimum actions to consider a session worth tracing
const MAX_TRACES        = 100;   // Rotate when hitting this count
const KEEP_TRACES       = 75;    // Entries to retain after rotation
const MAX_CACHE_BYTES   = 32 * 1024; // 32KB guard for all cache reads

// ---------------------------------------------------------------------------
// Safe readers
// ---------------------------------------------------------------------------

/**
 * Read a JSON file returning `fallback` on any error or oversized content.
 * Never throws.
 */
function safeReadJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.length > MAX_CACHE_BYTES) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Read a JSONL file into an array of parsed objects.
 * Skips unparseable lines. Returns [] on any error.
 */
function safeReadJsonl(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.length > MAX_CACHE_BYTES) return [];
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

/**
 * Load tool actions from recent-actions.jsonl.
 * Returns all entries; caller filters by session if needed.
 * Actions written by action-logger have: { ts, tool, file, intent, session, success }
 */
function loadActions() {
  return safeReadJsonl(RECENT_ACTIONS);
}

/**
 * Check whether the learnings-queue contains any correction entries for the
 * current session. If so, the session had user corrections and is NOT a clean
 * success trace.
 *
 * learnings-queue.json is a JSON array of objects with { sessionId, type, ... }.
 * A "correction" type means the user steered the session -- skip tracing.
 *
 * Uses a dedicated reader with a larger size cap (512KB) because the queue
 * can grow beyond the generic 32KB guard used for other cache files.
 * Fails open (returns false) on any read/parse error to never block tracing
 * due to a temporarily corrupt queue file.
 *
 * Returns true if corrections exist for sessionId, false otherwise.
 */
function hasCorrections(sessionId) {
  if (!sessionId) return false;
  try {
    const raw = fs.readFileSync(LEARNINGS_QUEUE, 'utf8');
    // 512KB cap: a 100-entry queue with large messages should never exceed this
    if (raw.length > 512 * 1024) return false;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue)) return false;
    return queue.some(entry =>
      entry && entry.sessionId === sessionId && entry.type === 'correction'
    );
  } catch {
    // Fail open: if queue unreadable, treat as no corrections so tracing proceeds
    return false;
  }
}

/**
 * Count completed tasks for the current session from task-completions.jsonl.
 * task-completions entries have: { ts, session_id, task_id, task_subject, task_status }
 */
function countCompletedTasks(sessionId) {
  const completions = safeReadJsonl(TASK_COMPLETIONS);
  if (!sessionId) return completions.filter(e => e.task_status === 'completed').length;
  return completions.filter(
    e => e.session_id === sessionId && e.task_status === 'completed'
  ).length;
}

/**
 * Extract hull integrity label from session-checkpoint.json.
 * Falls back to 'Unknown' if unavailable.
 */
function loadHullIntegrity() {
  const checkpoint = safeReadJson(SESSION_CHECKPOINT, {});
  return (checkpoint && typeof checkpoint.hullIntegrity === 'string')
    ? checkpoint.hullIntegrity
    : 'Unknown';
}

/**
 * Build tool sequence array, tool counts, and unique files modified from actions.
 * Filters to actions belonging to sessionId when provided; otherwise uses all.
 * Extracts file basenames from Edit/Write tool entries.
 *
 * Returns:
 *   { tool_sequence, tool_counts, files_modified, total_actions }
 */
function extractActionData(actions, sessionId) {
  // Filter to this session's actions if session_id is available on entries
  // action-logger stores session as entry.session (not session_id)
  const relevant = sessionId
    ? actions.filter(e => !e.session || e.session === sessionId)
    : actions;

  const tool_sequence = relevant.map(e => e.tool).filter(Boolean);
  const tool_counts = {};
  for (const tool of tool_sequence) {
    tool_counts[tool] = (tool_counts[tool] || 0) + 1;
  }

  // Deduplicate modified file basenames from Edit/Write entries
  const seenFiles = new Set();
  const files_modified = [];
  for (const entry of relevant) {
    if ((entry.tool === 'Edit' || entry.tool === 'Write') && entry.file) {
      const basename = path.basename(entry.file);
      if (basename && !seenFiles.has(basename)) {
        seenFiles.add(basename);
        files_modified.push(basename);
      }
    }
  }

  return {
    tool_sequence,
    tool_counts,
    files_modified,
    total_actions: relevant.length,
  };
}

// ---------------------------------------------------------------------------
// Trace output
// ---------------------------------------------------------------------------

/**
 * Load current success-traces.jsonl as an array.
 * Handles missing file gracefully.
 */
function loadTraces() {
  return safeReadJsonl(SUCCESS_TRACES);
}

/**
 * Atomically write the traces array back to success-traces.jsonl.
 * Uses tmp + rename for crash safety.
 */
function writeTraces(traces) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const jsonl = traces.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tmpPath = SUCCESS_TRACES + '.tmp';
    fs.writeFileSync(tmpPath, jsonl, 'utf8');
    fs.renameSync(tmpPath, SUCCESS_TRACES);
  } catch {
    // Never block the agent on write failure
  }
}

/**
 * Append a new trace entry. Rotates when MAX_TRACES is reached.
 */
function appendTrace(entry) {
  let traces = loadTraces();
  traces.push(entry);

  // Rotate: keep newest KEEP_TRACES when we hit MAX_TRACES
  if (traces.length >= MAX_TRACES) {
    traces = traces.slice(-KEEP_TRACES);
  }

  writeTraces(traces);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Read stdin synchronously (Stop event JSON payload)
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

  // Guard: skip if stop hook is already active (prevent re-entrant stops)
  if (hookData.stop_hook_active) {
    process.exit(0);
  }

  // Circuit breaker: skip if this hook has failed too many consecutive times
  if (!shouldRun('success-trace-logger')) {
    process.exit(0);
  }

  try {
    const sessionId = (hookData && hookData.session_id) || '';

    // Gate 1: skip if user made corrections this session (not a clean success)
    if (hasCorrections(sessionId)) {
      recordSuccess('success-trace-logger');
      process.exit(0);
    }

    // Load and filter actions for this session
    const actions = loadActions();
    const { tool_sequence, tool_counts, files_modified, total_actions } =
      extractActionData(actions, sessionId);

    // Gate 2: minimum action threshold -- skip trivial sessions
    if (total_actions < MIN_TOOL_ACTIONS) {
      recordSuccess('success-trace-logger');
      process.exit(0);
    }

    // Collect remaining fields
    const tasks_completed = countCompletedTasks(sessionId);
    const hull_at_end     = loadHullIntegrity();

    const entry = {
      timestamp:        new Date().toISOString(),
      session_id:       sessionId || 'unknown',
      tool_sequence,
      tool_counts,
      files_modified,
      tasks_completed,
      hull_at_end,
      duration_actions: total_actions,
    };

    appendTrace(entry);
    recordSuccess('success-trace-logger');
  } catch {
    recordFailure('success-trace-logger');
  }

  process.exit(0);
}

main();
