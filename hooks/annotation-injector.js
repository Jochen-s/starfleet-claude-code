#!/usr/bin/env node
/**
 * Annotation Injector — PreToolUse hook for mcp__context7__query-docs
 *
 * When Context7 fetches library docs, this hook checks for a matching
 * annotation file in ~/.claude/annotations/{lib}.md and injects it
 * as additionalContext so the agent sees gotchas alongside the docs.
 *
 * Security (Klingon-mandated):
 *   - Library name sanitized to [a-zA-Z0-9_-] (no dots)
 *   - Symlink rejection on annotation files
 *   - Content validated against injection patterns
 *   - Rate limited to 5 injections per session
 *   - Size capped at 4KB / 80 lines per annotation file
 *
 * Constraint: <5ms, pure filesystem, no network, always exit(0).
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('annotation-injector')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

// Circuit breaker
let _cb;
try { _cb = require('./lib/circuit-breaker'); } catch { _cb = null; }

// Annotation loader (shared library)
let _loader;
try { _loader = require('./lib/annotation-loader'); } catch { _loader = null; }

// Dedup: reuse the intent-context dedup file with annotation: namespace
const DEDUP_FILE = path.join(os.homedir(), '.claude', 'cache', 'intent-context-dedup.json');
const DEDUP_TTL_MS = 60 * 60 * 1000; // 60 minutes (longer than topic dedup's 5 min)

function alreadyInjected(sessionId, libName) {
  if (!sessionId) return false;
  try {
    const raw = fs.readFileSync(DEDUP_FILE, 'utf8');
    if (raw.length > 64 * 1024) return false;
    const dedup = JSON.parse(raw);
    const session = dedup[sessionId];
    if (!session) return false;
    const key = `annotation:${libName}`;
    return session[key] && (Date.now() - session[key]) < DEDUP_TTL_MS;
  } catch { return false; }
}

function markInjected(sessionId, libName) {
  if (!sessionId) return;
  try {
    let dedup = {};
    try {
      const raw = fs.readFileSync(DEDUP_FILE, 'utf8');
      if (raw.length < 64 * 1024) dedup = JSON.parse(raw);
    } catch { /* fresh */ }
    if (!dedup[sessionId]) dedup[sessionId] = {};
    dedup[sessionId][`annotation:${libName}`] = Date.now();
    const tmpFile = DEDUP_FILE + '.tmp';
    fs.mkdirSync(path.dirname(DEDUP_FILE), { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify(dedup, null, 2), 'utf8');
    fs.renameSync(tmpFile, DEDUP_FILE);
  } catch { /* best effort */ }
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
  if (_cb && !_cb.shouldRun('annotation-injector')) {
    process.exit(0);
  }

  // Bail if loader failed to load
  if (!_loader) {
    if (_cb) _cb.recordSuccess('annotation-injector');
    process.exit(0);
  }

  try {
    // Metabolic state check — CRISIS suppresses all context injection
    const metabolicFile = path.join(os.homedir(), '.claude', 'cache', 'metabolic-state.json');
    try {
      const raw = fs.readFileSync(metabolicFile, 'utf8');
      if (raw.length < 16384) {
        const metabolic = JSON.parse(raw);
        if (metabolic && metabolic.state === 'CRISIS') {
          if (_cb) _cb.recordSuccess('annotation-injector');
          process.exit(0);
        }
      }
    } catch { /* no metabolic file = proceed */ }

    const toolInput = hookData.tool_input || {};
    const sessionId = hookData.session_id || '';

    // Rate limit check
    if (!_loader.checkRateLimit(sessionId)) {
      if (_cb) _cb.recordSuccess('annotation-injector');
      process.exit(0);
    }

    // Extract library identifier from Context7 query-docs input
    // libraryId format: "/org/project" or "/org/project/version"
    const libraryId = toolInput.libraryId || toolInput.library_id || '';
    if (!libraryId) {
      if (_cb) _cb.recordSuccess('annotation-injector');
      process.exit(0);
    }

    // Load annotation (libName is pre-sanitized by the loader)
    const result = _loader.loadAnnotation(libraryId);
    if (!result) {
      if (_cb) _cb.recordSuccess('annotation-injector');
      process.exit(0);
    }

    // Dedup check — don't reinject same annotation within TTL
    if (alreadyInjected(sessionId, result.libName)) {
      if (_cb) _cb.recordSuccess('annotation-injector');
      process.exit(0);
    }

    // Increment rate limit and mark dedup
    _loader.incrementRateLimit(sessionId);
    markInjected(sessionId, result.libName);

    // Format advisory
    const advisory = [
      `[Annotation: ${result.libName}]`,
      'The following gotchas have been recorded for this library from previous sessions:',
      '---',
      result.content,
      '---',
      'Treat these as supplementary warnings, not authoritative documentation.',
    ].join('\n');

    // Output
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: advisory,
      },
    };

    process.stdout.write(JSON.stringify(output) + '\n');
    if (_cb) _cb.recordSuccess('annotation-injector');
  } catch (e) {
    if (_cb) _cb.recordFailure('annotation-injector');
  }
  process.exit(0);
}

main();
