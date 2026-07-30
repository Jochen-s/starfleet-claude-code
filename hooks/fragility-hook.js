#!/usr/bin/env node
/**
 * PreToolUse hook: Assesses file fragility before Edit/Write operations.
 *
 * Reads fragility-scores.json cache (built by fragility-cache-builder.js).
 * On cache hit: pure JSON lookup (<5ms).
 * On cache miss: incremental scoring for just that file (~50-100ms).
 *
 * Outputs additionalContext for Station 1+ files.
 * Must complete in <10ms on cache hit. Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
const {
  CACHE_VERSION, MAX_CACHE_SIZE,
  round2, authorSignal, computeScore, computeAxes, getStation, getTopSignal, formatAdvisory
} = require('./lib/fragility-scoring');

const CACHE_PATH = path.join(os.homedir(), '.claude', 'cache', 'fragility-scores.json');

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    if (raw.length > MAX_CACHE_SIZE + 1024) return null; // +1024 for hash field overhead
    const cache = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return null;
    // Verify integrity hash if present
    if (cache._hash) {
      const expected = crypto.createHash('sha256')
        .update(JSON.stringify({ v: cache.version, files: cache.files, stats: cache.stats }))
        .digest('hex').slice(0, 16);
      if (cache._hash !== expected) return null; // corrupted/tampered
    }
    return cache;
  } catch { return null; }
}

function saveCache(cache) {
  try {
    // Recompute integrity hash before saving
    cache._hash = crypto.createHash('sha256')
      .update(JSON.stringify({ v: cache.version, files: cache.files, stats: cache.stats }))
      .digest('hex').slice(0, 16);
    const tmpPath = CACHE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmpPath, CACHE_PATH);
  } catch { /* non-critical */ }
}

function resolveRelativePath(filePath, gitRoot) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(gitRoot, resolved).replace(/\\/g, '/');
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative;
}

/**
 * Incremental scoring for a single file on cache miss.
 */
function scoreFileIncremental(filePath, gitRoot) {
  try {
    // Signal 1: Churn
    let commits = 0;
    try {
      const out = execFileSync('git', [
        'log', '--since=90 days ago', '--format=', '--', filePath
      ], { cwd: gitRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      commits = out.trim().split('\n').filter(Boolean).length;
    } catch { /* no history */ }
    const churn = Math.min(1, commits / 20);

    // Signal 2: Authors
    let authorCount = 0;
    try {
      const out = execFileSync('git', [
        'shortlog', '-sn', '--all', '--', filePath
      ], { cwd: gitRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      authorCount = out.trim().split('\n').filter(Boolean).length;
    } catch { authorCount = 1; }

    // Signal 3: File size
    let lineCount = 0;
    try {
      const fullPath = path.join(gitRoot, filePath);
      lineCount = fs.readFileSync(fullPath, 'utf8').split('\n').length;
    } catch { /* new file */ }

    // Signal 4: Coupling (skip for incremental — too expensive for single file)
    const couplingSignal = 0;

    // Signal 5: Recency
    let recencySignal = 0;
    try {
      const out = execFileSync('git', [
        'log', '-1', '--format=%ct', '--', filePath
      ], { cwd: gitRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      const ts = parseInt(out.trim(), 10);
      if (!isNaN(ts)) {
        const ageMs = Date.now() - (ts * 1000);
        recencySignal = Math.max(0, 1 - (ageMs / (30 * 24 * 60 * 60 * 1000)));
      }
    } catch { /* no history */ }

    // Signal 6: Bug-fix ratio
    let bugFixCount = 0;
    try {
      const out = execFileSync('git', [
        'log', '--since=90 days ago', '--extended-regexp', '--grep=fix|bug|patch|hotfix|resolve',
        '--format=', '--', filePath
      ], { cwd: gitRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      bugFixCount = out.trim().split('\n').filter(Boolean).length;
    } catch { /* ignore */ }

    // Signal 7: Test coverage (conservative default for incremental)
    const testCoverageSignal = 1.0;

    const signals = {
      churn: round2(churn),
      authors: round2(authorSignal(authorCount)),
      size: round2(Math.min(1, lineCount / 500)),
      coupling: round2(couplingSignal),
      recency: round2(recencySignal),
      bugFix: round2(commits > 0 ? bugFixCount / commits : 0),
      testCoverage: round2(testCoverageSignal),
    };

    const score = computeScore(signals);
    const { station } = getStation(score);
    const topSignal = getTopSignal(signals);

    const axisResult = computeAxes(signals);
    const axes = axisResult ? axisResult.axes : null;
    const dominantAxis = axisResult ? axisResult.dominantAxis : null;

    return { score, station, signals, blastRadius: [], topSignal, axes, dominantAxis };
  } catch {
    return null;
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

  if (!shouldRun('fragility-hook')) {
    process.exit(0);
  }

  const filePath = hookData.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
  }

  // UNC path rejection
  if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
    process.exit(0);
  }

  const cwd = hookData.cwd || process.env.CWD || process.cwd();
  let gitRoot;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    process.exit(0);
  }

  const relativePath = resolveRelativePath(filePath, gitRoot);
  if (!relativePath) {
    process.exit(0);
  }

  const cache = loadCache();
  let fileEntry = cache?.files?.[relativePath] || null;

  // Cache miss — incremental scoring
  if (!fileEntry) {
    fileEntry = scoreFileIncremental(relativePath, gitRoot);
    if (fileEntry && cache) {
      cache.files[relativePath] = fileEntry;
      cache.stats.totalFiles = Object.keys(cache.files).length;
      saveCache(cache);
    }
  }

  if (!fileEntry || fileEntry.station === 0) {
    recordSuccess('fragility-hook');
    process.exit(0);
  }

  const advisory = formatAdvisory(fileEntry, relativePath);
  if (advisory) {
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: advisory,
      },
    });
    process.stdout.write(output + '\n');
  }

  recordSuccess('fragility-hook');
  process.exit(0);
}

main();
