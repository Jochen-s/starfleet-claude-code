#!/usr/bin/env node
/**
 * Intent-Routed Context Loading — PreToolUse hook
 *
 * Infers the agent's current intent from the tool being called and
 * injects the most relevant memory topic file as additionalContext.
 * Fires on Edit|Write|Bash only.
 *
 * Design: docs/plans/2026-02-26-intent-routed-context-design.md
 * Constraint: <50ms, pure filesystem, no network, always exit(0).
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('intent-context')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const DEDUP_FILE = path.join(CLAUDE_DIR, 'cache', 'intent-context-dedup.json');
const MAX_TOPIC_LINES = 80;
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level cache: cwd string → { memDir, projectKey } or null
// Populated once per process invocation (one cwd per hook call).
let _memDirCache = null;

// Circuit breaker
let _cb;
try { _cb = require('./lib/circuit-breaker'); } catch { _cb = null; }

// In-process topic cache (only helps within a single invocation)
const _topicCache = {};

// Metabolic state file (written by context-threshold-monitor.js)
const METABOLIC_FILE = path.join(CLAUDE_DIR, 'cache', 'metabolic-state.json');

function loadMetabolicState() {
  try {
    const raw = fs.readFileSync(METABOLIC_FILE, 'utf8');
    if (raw.length > 16 * 1024) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/**
 * Walk up from cwd until we find a ~/.claude/projects/{key}/memory dir.
 * Returns { memDir, projectKey } or null if none found.
 */
function findProjectMemoryDir(cwd) {
  if (_memDirCache !== null) return _memDirCache;

  const normalized = (cwd || '').replace(/\\/g, '/');
  let current = normalized;

  while (current && current.length > 3) {
    // Convert path to Claude project key: replace / and : with -
    const key = current.replace(/:/g, '-').replace(/\//g, '-');
    const memDir = path.join(CLAUDE_DIR, 'projects', key, 'memory');
    if (fs.existsSync(memDir)) {
      _memDirCache = { memDir, projectKey: key };
      return _memDirCache;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  _memDirCache = null;
  return null;
}

// Shared intent classification (also used by action-logger.js)
const { classifyIntent } = require('./lib/intent-classifier');

function loadTopic(name, memDir) {
  // Path traversal guard — reject names with separators or parent refs
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null;
  if (_topicCache[name]) return _topicCache[name];
  try {
    const content = fs.readFileSync(path.join(memDir, name), 'utf8');
    const lines = content.split('\n').slice(0, MAX_TOPIC_LINES).join('\n');
    _topicCache[name] = lines;
    return lines;
  } catch {
    return null;
  }
}

function loadDedup() {
  try {
    const raw = fs.readFileSync(DEDUP_FILE, 'utf8');
    if (raw.length > 64 * 1024) return {}; // cap file size
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function alreadyInjected(sessionId, scopedTopic) {
  if (!sessionId) return false;
  const dedup = loadDedup();
  const session = dedup[sessionId];
  if (!session || !session[scopedTopic]) return false;
  return (Date.now() - session[scopedTopic]) < DEDUP_TTL_MS;
}

function markInjected(sessionId, scopedTopic) {
  if (!sessionId) return;
  try {
    const dedup = loadDedup();
    const now = Date.now();
    // Prune expired entries across all sessions (keep recent 10 sessions max)
    const pruned = {};
    const sessionIds = Object.keys(dedup);
    // Always include current session
    pruned[sessionId] = dedup[sessionId] || {};
    pruned[sessionId][scopedTopic] = now;
    // Keep up to 9 other recent sessions with non-expired entries
    let kept = 0;
    for (const sid of sessionIds) {
      if (sid === sessionId || kept >= 9) continue;
      const entries = dedup[sid];
      if (!entries || typeof entries !== 'object') continue;
      const fresh = {};
      for (const [t, ts] of Object.entries(entries)) {
        if (typeof ts === 'number' && (now - ts) < DEDUP_TTL_MS) fresh[t] = ts;
      }
      if (Object.keys(fresh).length > 0) { pruned[sid] = fresh; kept++; }
    }
    fs.mkdirSync(path.dirname(DEDUP_FILE), { recursive: true });
    // Atomic write: temp file + rename
    const tmpFile = DEDUP_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(pruned, null, 2), 'utf8');
    fs.renameSync(tmpFile, DEDUP_FILE);
  } catch {
    // Best effort — no injection is better than a crash
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
  if (_cb && !_cb.shouldRun('intent-context')) {
    process.exit(0);
  }

  try {
    // Metabolic state check — CRISIS suppresses all context injection
    const metabolic = loadMetabolicState();
    if (metabolic && metabolic.state === 'CRISIS') {
      if (_cb) _cb.recordSuccess('intent-context');
      process.exit(0);
    }

    const toolName = hookData.tool_name;
    const toolInput = hookData.tool_input || {};
    const sessionId = hookData.session_id || '';
    const cwd = hookData.cwd || '';

    // Resolve memory directory for this project (walk up from cwd)
    const memResult = findProjectMemoryDir(cwd);
    if (!memResult) {
      if (_cb) _cb.recordSuccess('intent-context');
      process.exit(0);
    }
    const { memDir, projectKey } = memResult;

    // Classify intent
    const { intent, topic } = classifyIntent(toolName, toolInput);

    // FOCUS mode — only inject if intent matches focusIntent
    if (metabolic && metabolic.state === 'FOCUS' && metabolic.focusIntent) {
      if (intent !== metabolic.focusIntent) {
        if (_cb) _cb.recordSuccess('intent-context');
        process.exit(0);
      }
    }

    // No topic to inject
    if (!topic) {
      if (_cb) _cb.recordSuccess('intent-context');
      process.exit(0);
    }

    // Project-scoped dedup key — prevents cross-project collisions
    const scopedTopic = `${projectKey}:${topic}`;

    // De-duplication check
    if (alreadyInjected(sessionId, scopedTopic)) {
      if (_cb) _cb.recordSuccess('intent-context');
      process.exit(0);
    }

    // Load topic content
    const content = loadTopic(topic, memDir);
    if (!content) {
      if (_cb) _cb.recordSuccess('intent-context');
      process.exit(0);
    }

    // Mark as injected
    markInjected(sessionId, scopedTopic);

    // Format advisory
    const advisory = `[Intent Context: ${intent}]\nLoaded from: ${topic}\n---\n${content}`;

    // Output
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: advisory,
      },
    };

    process.stdout.write(JSON.stringify(output) + '\n');
    if (_cb) _cb.recordSuccess('intent-context');
  } catch (e) {
    if (_cb) _cb.recordFailure('intent-context');
  }
  process.exit(0);
}

main();
