#!/usr/bin/env node
/**
 * PostToolUse hook: Logs recent actions to a circular buffer.
 *
 * Maintains a rolling JSONL log of the last 50 tool actions.
 * Used by metabolic state machine (P3) and instinct outcome tracking (P5).
 *
 * Budget: <10ms. Pure filesystem, no network. Always exits 0.
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('action-logger')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const BUFFER_PATH = path.join(CACHE_DIR, 'recent-actions.jsonl');
const FRICTION_PATH = path.join(CACHE_DIR, 'friction-log.jsonl');
const MAX_ENTRIES = 50;
const MAX_FRICTION_ENTRIES = 100;
const MAX_FILE_SIZE = 32 * 1024; // 32KB cap

let _cb;
try { _cb = require('./lib/circuit-breaker'); } catch { _cb = null; }

let _classifier;
try { _classifier = require('./lib/intent-classifier'); } catch { _classifier = null; }

function readBuffer() {
  try {
    const raw = fs.readFileSync(BUFFER_PATH, 'utf8');
    if (raw.length > MAX_FILE_SIZE) {
      // Corrupted or oversized — start fresh
      return [];
    }
    return raw.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeBuffer(entries) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const jsonl = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tmpPath = BUFFER_PATH + '.tmp';
    fs.writeFileSync(tmpPath, jsonl, 'utf8');
    fs.renameSync(tmpPath, BUFFER_PATH);
  } catch { /* never block the agent */ }
}

// --- Instinct outcome tracking (Pattern 5) ---
const OUTCOMES_PATH = path.join(CACHE_DIR, 'instinct-outcomes.json');
const MAX_OUTCOMES = 100;

function loadOutcomes() {
  try {
    const raw = fs.readFileSync(OUTCOMES_PATH, 'utf8');
    if (raw.length > MAX_FILE_SIZE) return { outcomes: [] };
    return JSON.parse(raw);
  } catch { return { outcomes: [] }; }
}

function saveOutcomes(data) {
  try {
    const tmpPath = OUTCOMES_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, OUTCOMES_PATH);
  } catch { /* non-critical */ }
}

/**
 * Check for instinct-related behavioral patterns in the action buffer.
 * Conservative: only 2 instincts have reliable auto-detection initially.
 */
function checkInstinctOutcomes(buffer, currentEntry) {
  if (buffer.length < 2) return;

  const prev = buffer[buffer.length - 2];
  const curr = currentEntry;

  // Pattern 1: read-before-edit — positive signal for "read-before-edit" instinct
  // Edit/Write preceded by Read of the same file = good practice
  if ((curr.tool === 'Edit' || curr.tool === 'Write') && prev.tool === 'Read') {
    if (curr.file && prev.file && curr.file === prev.file) {
      recordOutcome('read-before-edit', 'positive', curr.ts);
    }
  }

  // Pattern 2: edit-without-read — negative signal for "read-before-edit" instinct
  // Edit/Write NOT preceded by Read of the same file
  if ((curr.tool === 'Edit' || curr.tool === 'Write') && prev.tool !== 'Read') {
    if (curr.file) {
      // Check if any recent Read in buffer was for this file
      const recentReads = buffer.slice(-5).filter(
        e => e.tool === 'Read' && e.file === curr.file
      );
      if (recentReads.length === 0) {
        recordOutcome('read-before-edit', 'negative', curr.ts);
      }
    }
  }
}

function recordOutcome(instinct, signal, ts) {
  const data = loadOutcomes();
  data.outcomes.push({ instinct, signal, ts });
  // Trim to max
  if (data.outcomes.length > MAX_OUTCOMES) {
    data.outcomes = data.outcomes.slice(-MAX_OUTCOMES);
  }
  saveOutcomes(data);
}

// --- Friction logging (GAAI-inspired automatic friction detection) ---

function readFrictionLog() {
  try {
    const raw = fs.readFileSync(FRICTION_PATH, 'utf8');
    if (raw.length > MAX_FILE_SIZE) return [];
    return raw.trim().split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function writeFrictionLog(entries) {
  try {
    const trimmed = entries.slice(-MAX_FRICTION_ENTRIES);
    const jsonl = trimmed.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tmpPath = FRICTION_PATH + '.tmp';
    fs.writeFileSync(tmpPath, jsonl, 'utf8');
    fs.renameSync(tmpPath, FRICTION_PATH);
  } catch { /* never block the agent */ }
}

function detectFriction(buffer, currentEntry) {
  if (buffer.length < 3) return;

  const recent = buffer.slice(-5);
  const detected = [];

  // Pattern 1: Consecutive failures (3+ failures in a row)
  const recentFailures = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    if (!recent[i].success) recentFailures.push(recent[i]);
    else break;
  }
  if (recentFailures.length >= 3) {
    detected.push({
      ts: Date.now(),
      type: 'consecutive-failures',
      count: recentFailures.length,
      tools: recentFailures.map(f => f.tool),
      file: currentEntry.file || '',
      session: currentEntry.session,
    });
  }

  // Pattern 2: Same-file retry (Edit/Write on same file 3+ times in last 5 actions)
  if (currentEntry.file && (currentEntry.tool === 'Edit' || currentEntry.tool === 'Write')) {
    const sameFileEdits = recent.filter(
      e => e.file === currentEntry.file && (e.tool === 'Edit' || e.tool === 'Write')
    );
    if (sameFileEdits.length >= 3) {
      detected.push({
        ts: Date.now(),
        type: 'edit-churn',
        count: sameFileEdits.length,
        file: currentEntry.file,
        session: currentEntry.session,
      });
    }
  }

  // Pattern 3: Tool oscillation (Read→Edit→Read→Edit on same file = unclear state)
  if (recent.length >= 4) {
    const last4 = recent.slice(-4);
    const isOscillation = last4[0].tool === 'Read' && last4[1].tool === 'Edit'
      && last4[2].tool === 'Read' && last4[3].tool === 'Edit'
      && last4[0].file && last4.every(e => e.file === last4[0].file);
    if (isOscillation) {
      detected.push({
        ts: Date.now(),
        type: 'tool-oscillation',
        file: last4[0].file,
        session: currentEntry.session,
      });
    }
  }

  // Only read/write friction log when patterns actually fired
  if (detected.length > 0) {
    const frictionEntries = readFrictionLog();
    frictionEntries.push(...detected);
    writeFrictionLog(frictionEntries);
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

  // Circuit breaker check
  if (_cb && !_cb.shouldRun('action-logger')) {
    process.exit(0);
  }

  try {
    const toolName = hookData.tool_name || '';
    const toolInput = hookData.tool_input || {};
    const sessionId = hookData.session_id || '';

    // Extract file path from tool input
    const file = toolInput.file_path || toolInput.filePath || toolInput.command || '';

    // Classify intent
    let intent = 'unknown';
    if (_classifier) {
      const result = _classifier.classifyIntent(toolName, toolInput);
      intent = result.intent;
    }

    // Determine success from hook context
    const success = hookData.tool_error == null;

    // Build entry
    const entry = {
      ts: Date.now(),
      tool: toolName,
      file: typeof file === 'string' ? file.slice(0, 200) : '', // truncate long commands
      intent,
      session: sessionId,
      success,
    };

    // Read existing buffer, append, trim
    const buffer = readBuffer();
    buffer.push(entry);

    // Check instinct outcomes before trimming (needs full recent history)
    checkInstinctOutcomes(buffer, entry);

    // Detect friction patterns (GAAI-inspired automatic signal)
    detectFriction(buffer, entry);

    // Trim to MAX_ENTRIES (keep most recent)
    const trimmed = buffer.slice(-MAX_ENTRIES);

    writeBuffer(trimmed);

    if (_cb) _cb.recordSuccess('action-logger');
  } catch (e) {
    if (_cb) _cb.recordFailure('action-logger');
  }

  process.exit(0);
}

main();
