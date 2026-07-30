#!/usr/bin/env node
/**
 * SessionStart hook: Builds fragility score cache from git history.
 *
 * Runs 2 batched git commands for the entire repo:
 * 1. git log (churn, recency, bug-fix, co-change)
 * 2. git log (author-file mapping)
 * Plus fs.statSync for file sizes.
 *
 * Writes: ~/.claude/cache/fragility-scores.json
 * Budget: 2-5 seconds (acceptable for SessionStart).
 * Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  CACHE_VERSION, MAX_CACHE_SIZE, MAX_FILES,
  round2, authorSignal, computeScore, computeAxes, getStation, getTopSignal
} = require('./lib/fragility-scoring');

const CACHE_PATH = path.join(os.homedir(), '.claude', 'cache', 'fragility-scores.json');
const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const BUG_FIX_PATTERN = /\b(fix|bug|patch|hotfix|resolve)\b/i;

function getGitRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch { return null; }
}

function getTrackedFiles(gitRoot) {
  try {
    const output = execFileSync('git', ['ls-files'], {
      cwd: gitRoot, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim().split('\n').filter(Boolean).slice(0, MAX_FILES);
  } catch { return []; }
}

function parseGitLog(gitRoot) {
  let output;
  try {
    output = execFileSync('git', [
      'log', '--since=90 days ago', '--name-only', '--format=COMMIT:%H %ct %s'
    ], {
      cwd: gitRoot, encoding: 'utf8', timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024
    });
  } catch {
    return { fileCommits: {}, fileBugFixes: {}, coChangeMap: {}, fileLastCommitTs: {} };
  }

  const fileCommits = {};
  const fileBugFixes = {};
  const coChangeMap = {};
  const fileLastCommitTs = {}; // file -> Unix timestamp of most recent commit

  const lines = output.split('\n');
  let isBugFix = false;
  let commitFiles = [];
  let currentTimestamp = 0;

  for (const line of lines) {
    if (line.startsWith('COMMIT:')) {
      // Process previous commit's files
      if (commitFiles.length > 0) {
        processCommitFiles(commitFiles, isBugFix, currentTimestamp, fileCommits, fileBugFixes, coChangeMap, fileLastCommitTs);
      }
      // Parse: COMMIT:<hash> <timestamp> <subject...>
      const parts = line.slice(7).split(' ');
      currentTimestamp = parseInt(parts[1], 10) || 0;
      const subject = parts.slice(2).join(' ');
      isBugFix = BUG_FIX_PATTERN.test(subject);
      commitFiles = [];
    } else if (line.trim()) {
      commitFiles.push(line.trim());
    }
  }
  // Process last commit
  if (commitFiles.length > 0) {
    processCommitFiles(commitFiles, isBugFix, currentTimestamp, fileCommits, fileBugFixes, coChangeMap, fileLastCommitTs);
  }

  return { fileCommits, fileBugFixes, coChangeMap, fileLastCommitTs };
}

function processCommitFiles(files, isBugFix, timestamp, fileCommits, fileBugFixes, coChangeMap, fileLastCommitTs) {
  // Cap files per commit to prevent massive merge commits from skewing data
  const capped = files.slice(0, 50);
  for (const f of capped) {
    fileCommits[f] = (fileCommits[f] || 0) + 1;
    if (isBugFix) fileBugFixes[f] = (fileBugFixes[f] || 0) + 1;
    // Track most recent commit timestamp per file (git log is reverse-chronological)
    if (!(f in fileLastCommitTs) || timestamp > fileLastCommitTs[f]) {
      fileLastCommitTs[f] = timestamp;
    }
    if (!coChangeMap[f]) coChangeMap[f] = {};
    for (const other of capped) {
      if (other !== f) {
        coChangeMap[f][other] = (coChangeMap[f][other] || 0) + 1;
      }
    }
  }
}

function getAuthorMap(gitRoot) {
  const authorMap = {};
  try {
    const output = execFileSync('git', [
      'log', '--since=90 days ago', '--format=AUTHOR:%an', '--name-only'
    ], {
      cwd: gitRoot, encoding: 'utf8', timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024
    });
    let currentAuthor = null;
    for (const line of output.split('\n')) {
      if (line.startsWith('AUTHOR:')) {
        currentAuthor = line.slice(7).trim();
      } else if (line.trim() && currentAuthor) {
        const f = line.trim();
        if (!authorMap[f]) authorMap[f] = new Set();
        authorMap[f].add(currentAuthor);
      }
    }
  } catch { /* return empty map */ }
  return authorMap;
}

function getFileLineCount(gitRoot, filePath) {
  try {
    const fullPath = path.join(gitRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return content.split('\n').length;
  } catch { return 0; }
}

function hasTestFile(filePath, trackedFilesSet) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);

  const candidates = [
    path.join(dir, `${base}.test${ext}`),
    path.join(dir, `${base}.spec${ext}`),
    path.join(dir, '__tests__', `${base}${ext}`),
    path.join(dir, '__tests__', `${base}.test${ext}`),
  ];
  if (ext === '.py') {
    candidates.push(path.join(dir, `test_${base}.py`));
  }

  for (const c of candidates) {
    if (trackedFilesSet.has(c.replace(/\\/g, '/'))) return true;
  }
  return false;
}

function buildBlastRadius(coChangeMap, file) {
  const coChanges = coChangeMap[file];
  if (!coChanges) return [];
  return Object.entries(coChanges)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([f]) => f);
}


function main() {
  let cwd;
  try {
    const input = fs.readFileSync(0, 'utf8');
    const hookData = JSON.parse(input);
    cwd = hookData.cwd || process.env.CWD || process.cwd();
  } catch {
    cwd = process.env.CWD || process.cwd();
  }

  const gitRoot = getGitRoot(cwd);
  if (!gitRoot) {
    process.exit(0);
  }

  const trackedFiles = getTrackedFiles(gitRoot);
  if (trackedFiles.length === 0) {
    process.exit(0);
  }

  const trackedFilesSet = new Set(trackedFiles.map(f => f.replace(/\\/g, '/')));
  const { fileCommits, fileBugFixes, coChangeMap, fileLastCommitTs } = parseGitLog(gitRoot);
  const authorMap = getAuthorMap(gitRoot);

  const commitCounts = Object.values(fileCommits);
  const maxCommits = commitCounts.length > 0 ? Math.max(...commitCounts) : 1;
  // Recency uses 30-day decay window (files >30 days score 0 recency).
  // Git log uses 90-day window for churn/bugfix/cochange data.
  // Intentional: recency rewards recent activity, churn captures longer trends.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const files = {};
  let totalScore = 0;
  let highRiskCount = 0;

  for (const filePath of trackedFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    const commits = fileCommits[normalized] || 0;

    const signals = {
      churn: round2(maxCommits > 0 ? Math.min(1, commits / maxCommits) : 0),
      authors: round2(authorSignal(authorMap[normalized]?.size || 0)),
      size: round2(Math.min(1, getFileLineCount(gitRoot, filePath) / 500)),
      coupling: round2((() => {
        const co = coChangeMap[normalized];
        if (!co) return 0;
        const maxCo = Math.max(...Object.values(co));
        return commits > 0 ? Math.min(1, maxCo / commits) : 0;
      })()),
      recency: round2((() => {
        const ts = fileLastCommitTs[normalized];
        if (!ts) return 0;
        const ageMs = Date.now() - (ts * 1000);
        return Math.max(0, 1 - (ageMs / THIRTY_DAYS_MS));
      })()),
      bugFix: round2(commits > 0 ? (fileBugFixes[normalized] || 0) / commits : 0),
      testCoverage: round2(hasTestFile(normalized, trackedFilesSet) ? 0.0 : 1.0),
    };

    const score = computeScore(signals);
    const { station } = getStation(score);
    const topSignal = getTopSignal(signals);
    const blastRadius = buildBlastRadius(coChangeMap, normalized);

    const axisResult = computeAxes(signals);
    const axes = axisResult ? axisResult.axes : null;
    const dominantAxis = axisResult ? axisResult.dominantAxis : null;

    files[normalized] = { score, station, signals, blastRadius, topSignal, axes, dominantAxis };
    totalScore += score;
    if (station >= 2) highRiskCount++;
  }

  const cache = {
    version: CACHE_VERSION,
    timestamp: new Date().toISOString(),
    gitRoot: gitRoot.replace(/\\/g, '/'),
    files,
    stats: {
      totalFiles: trackedFiles.length,
      avgScore: round2(totalScore / trackedFiles.length),
      highRiskCount,
    },
  };

  // Write cache atomically
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    let json = JSON.stringify(cache, null, 2);

    // Size cap: prune lowest-scored files if over 1MB
    if (json.length > MAX_CACHE_SIZE) {
      const sorted = Object.entries(cache.files).sort(([, a], [, b]) => a.score - b.score);
      // Estimate-based batch removal with correctness fallback (max 3 passes)
      for (let pass = 0; pass < 3 && json.length > MAX_CACHE_SIZE && sorted.length > 0; pass++) {
        const avgEntrySize = Math.ceil(json.length / Math.max(1, sorted.length + Object.keys(cache.files).length));
        const entriesToRemove = Math.ceil((json.length - MAX_CACHE_SIZE) / avgEntrySize) + 1;
        for (let i = 0; i < entriesToRemove && sorted.length > 0; i++) {
          const [key] = sorted.shift();
          delete cache.files[key];
        }
        json = JSON.stringify(cache, null, 2);
      }
      // Recompute stats after pruning for consistency
      let prunedTotal = 0;
      let prunedHighRisk = 0;
      for (const entry of Object.values(cache.files)) {
        prunedTotal += entry.score;
        if (entry.station >= 2) prunedHighRisk++;
      }
      const fileCount = Object.keys(cache.files).length;
      cache.stats.totalFiles = fileCount;
      cache.stats.avgScore = round2(fileCount > 0 ? prunedTotal / fileCount : 0);
      cache.stats.highRiskCount = prunedHighRisk;
      json = JSON.stringify(cache, null, 2);
    }

    // Integrity hash for accidental corruption detection (not security/tamper-resistance).
    // 16-char truncation is sufficient — cache is advisory-only, not access control.
    cache._hash = crypto.createHash('sha256')
      .update(JSON.stringify({ v: cache.version, files: cache.files, stats: cache.stats }))
      .digest('hex').slice(0, 16);
    json = JSON.stringify(cache, null, 2);

    const tmpPath = CACHE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf8');
    fs.renameSync(tmpPath, CACHE_PATH);
  } catch { /* never block session start */ }

  const output = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Fragility cache: ${cache.stats.totalFiles} files scored, ${highRiskCount} high-risk (Station 2+), avg score ${cache.stats.avgScore}.`,
    },
  });
  process.stdout.write(output + '\n');
  process.exit(0);
}

main();
