#!/usr/bin/env node
/**
 * SessionStart hook: Computes effective confidence for instinct files.
 *
 * Decay formula: effective = max(floor, raw - min(raw - floor, 0.05 * weeks_since_validated))
 * - Default floor: 0.3 (instincts never fully vanish)
 * - Decay rate: 0.05/week
 * - Optional frontmatter: **Last validated**: YYYY-MM-DD, **Decay floor**: N.N
 *
 * Session decay: additional -0.1 if sessions_since_validated > SESSION_DECAY_THRESHOLD (10)
 * NOTE: Session count is approximate -- concurrent sessions may cause minor count drift.
 * This is acceptable; session decay is a coarse signal, not a precise counter.
 *
 * Backpressure gate: if |raw - effective| < MIN_CONFIDENCE_DELTA (0.05),
 *   snap effective back to raw. Only meaningful decay is reported.
 *
 * Schema v2 fields: **Schema version**: N, **Superseded by**: <file or "none">
 *   If superseded, an advisory warning is emitted.
 *
 * Writes: ~/.claude/cache/instinct-effective-scores.json
 *         ~/.claude/cache/session-count.json (incremented each run)
 * Budget: <50ms. Pure filesystem. Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const OUTPUT_FILE = path.join(CACHE_DIR, 'instinct-effective-scores.json');
const SESSION_COUNT_FILE = path.join(CACHE_DIR, 'session-count.json');
const GLOBAL_INSTINCTS_DIR = path.join(CLAUDE_DIR, 'instincts');

const DEFAULT_FLOOR = 0.3;
const DECAY_RATE = 0.05; // per week
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 4 * 1024; // 4KB per instinct file
const MAX_FILE_COUNT = 20;
const SESSION_DECAY_THRESHOLD = 10;
const SESSION_DECAY_PENALTY = 0.1;
const MIN_CONFIDENCE_DELTA = 0.05;

// ---- Parsers ----------------------------------------------------------------

function parseConfidence(content) {
  const match = content.match(/(?:\*\*Confidence\*\*:|^confidence:)\s*([\d.]+)/m);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val >= 0 && val <= 1) return val;
  }
  return null;
}

function parseLastValidated(content) {
  // **Last validated**: 2026-02-27
  const match = content.match(/\*\*Last validated\*\*:\s*(\d{4}-\d{2}-\d{2})/m);
  if (match) {
    const date = new Date(match[1]);
    if (!isNaN(date.getTime())) return date.getTime();
  }
  return null;
}

function parseLastValidatedSession(content) {
  // **Last validated session**: 42
  const match = content.match(/\*\*Last validated session\*\*:\s*(\d+)/m);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val >= 0) return val;
  }
  return null;
}

function parseDecayFloor(content) {
  // **Decay floor**: 0.5
  const match = content.match(/\*\*Decay floor\*\*:\s*([\d.]+)/m);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val >= 0 && val <= 1) return val;
  }
  return DEFAULT_FLOOR;
}

function parseSchemaVersion(content) {
  // **Schema version**: 2
  const match = content.match(/\*\*Schema version\*\*:\s*(\d+)/m);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val >= 1) return val;
  }
  return 1;
}

function parseSupersededBy(content) {
  // **Superseded by**: newer-instinct.md  OR  **Superseded by**: none
  const match = content.match(/\*\*Superseded by\*\*:\s*(\S+)/m);
  if (match) {
    const val = match[1].trim();
    return val.toLowerCase() === 'none' ? null : val;
  }
  return null;
}

// ---- Session counter --------------------------------------------------------

function readSessionCount() {
  try {
    const raw = fs.readFileSync(SESSION_COUNT_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.count === 'number' && data.count >= 0) return data.count;
  } catch { /* file absent or corrupt -- start at 0 */ }
  return 0;
}

function writeSessionCount(count) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data = {
      count,
      last_incremented: new Date().toISOString(),
    };
    const tmpPath = SESSION_COUNT_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, SESSION_COUNT_FILE);
  } catch { /* non-critical */ }
}

// ---- Core computation -------------------------------------------------------

function getFileMtime(filePath) {
  try {
    return fs.lstatSync(filePath).mtimeMs;
  } catch { return Date.now(); }
}

function computeEffective(raw, floor, weeksSinceValidated) {
  if (weeksSinceValidated <= 0) return raw;
  const decay = Math.min(raw - floor, DECAY_RATE * weeksSinceValidated);
  return Math.min(raw, Math.max(floor, raw - decay));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---- Directory processor ----------------------------------------------------

function processInstinctDir(dir, now, currentSession, results, supersededWarnings) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(0, MAX_FILE_COUNT);

    for (const f of files) {
      try {
        const filePath = path.join(dir, f);
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) continue;
        if (stat.size > MAX_FILE_SIZE) continue;

        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) continue;

        const raw = parseConfidence(content);
        if (raw === null) continue;

        const lastValidated = parseLastValidated(content) || stat.mtimeMs;
        const floor = parseDecayFloor(content);
        const weeksSince = Math.max(0, (now - lastValidated) / MS_PER_WEEK);

        // Time-based effective score
        let effective = computeEffective(raw, floor, weeksSince);

        // Backpressure gate: suppress trivial time-decay noise BEFORE session demotion
        // This keeps time and session as independent signals
        const timeDelta = raw - round2(effective);
        let backpressureApplied = false;
        if (Math.abs(timeDelta) < MIN_CONFIDENCE_DELTA) {
          effective = raw;
          backpressureApplied = true;
        }

        // Session-based decay (applied unconditionally after backpressure)
        const lastValidatedSession = parseLastValidatedSession(content);
        let sessionsSinceValidated = null;
        let sessionDemoted = false;
        if (lastValidatedSession !== null && currentSession !== null) {
          sessionsSinceValidated = Math.max(0, currentSession - lastValidatedSession);
          if (sessionsSinceValidated > SESSION_DECAY_THRESHOLD) {
            effective = Math.max(floor, effective - SESSION_DECAY_PENALTY);
            sessionDemoted = true;
          }
        }

        effective = round2(effective);
        const decayed = effective < raw;

        // Schema v2 fields
        const schemaVersion = parseSchemaVersion(content);
        const supersededBy = parseSupersededBy(content);

        const name = f.replace(/\.md$/, '');

        // Collect superseded warnings for advisory
        if (supersededBy) {
          supersededWarnings.push({ name, supersededBy });
        }

        results[name] = {
          raw,
          effective,
          floor,
          decayed,
          backpressure_applied: backpressureApplied,
          lastValidated: new Date(lastValidated).toISOString().slice(0, 10),
          weeksSince: round2(weeksSince),
          sessions_since_validated: sessionsSinceValidated,
          session_demoted: sessionDemoted,
          schema_version: schemaVersion,
          superseded_by: supersededBy,
          source: dir,
        };
      } catch { /* skip unreadable files */ }
    }
  } catch { /* dir doesn't exist -- normal */ }
}

// ---- Main -------------------------------------------------------------------

function main() {
  let cwd = process.cwd();
  try {
    const input = fs.readFileSync(0, 'utf8');
    const hookData = JSON.parse(input);
    if (hookData.cwd && typeof hookData.cwd === 'string') {
      const resolved = path.resolve(hookData.cwd);
      if (!resolved.startsWith('\\\\') && !resolved.startsWith('//')) {
        cwd = resolved;
      }
    }
  } catch { /* use process.cwd() */ }

  const now = Date.now();

  // Increment session counter
  const previousCount = readSessionCount();
  const currentSession = previousCount + 1;
  writeSessionCount(currentSession);

  const results = {};
  const supersededWarnings = [];

  // Project-specific instincts
  const projectDir = path.join(cwd, '.claude', 'instincts');
  processInstinctDir(projectDir, now, currentSession, results, supersededWarnings);

  // Global instincts
  processInstinctDir(GLOBAL_INSTINCTS_DIR, now, currentSession, results, supersededWarnings);

  // Write effective scores
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const output = {
      timestamp: new Date(now).toISOString(),
      session_count: currentSession,
      instincts: results,
    };
    const tmpPath = OUTPUT_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2), 'utf8');
    fs.renameSync(tmpPath, OUTPUT_FILE);
  } catch { /* non-critical */ }

  // --- Stagnation Detection (T2.1, source: A-Evolve FailurePatternDetector) ---
  // If no new instinct files created in STAGNATION_SESSIONS sessions, flag it.
  const STAGNATION_SESSIONS = 15;
  let stagnationWarning = null;
  try {
    const allDirs = [projectDir, GLOBAL_INSTINCTS_DIR];
    let newestInstinctMs = 0;
    for (const dir of allDirs) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const f of files) {
          const stat = fs.statSync(path.join(dir, f));
          // Use birthtime (creation) not mtime (last validation update)
          const created = stat.birthtimeMs || stat.mtimeMs;
          if (created > newestInstinctMs) newestInstinctMs = created;
        }
      } catch { /* dir may not exist */ }
    }

    // Also check K-LEAN DB for new entries
    let newestKleanMs = 0;
    try {
      const kleanPath = path.join(cwd, '.knowledge-db', 'entries.jsonl');
      const kleanStat = fs.statSync(kleanPath);
      newestKleanMs = kleanStat.mtimeMs;
    } catch { /* no K-LEAN DB */ }

    const newestLearningMs = Math.max(newestInstinctMs, newestKleanMs);
    if (newestLearningMs > 0) {
      // Estimate sessions since last learning (using session count file timestamps)
      const daysSinceLastLearning = (now - newestLearningMs) / (24 * 60 * 60 * 1000);
      // Rough estimate: ~2 sessions per day
      const estimatedSessionsSince = Math.round(daysSinceLastLearning * 2);
      if (estimatedSessionsSince >= STAGNATION_SESSIONS) {
        stagnationWarning = `Learning stagnation: ~${estimatedSessionsSince} sessions since last new learning (${Math.round(daysSinceLastLearning)}d). Consider running /kln:learn or /borg-assimilate.`;
      }
    }
  } catch { /* non-critical */ }

  // --- Failure Pattern Surfacing (T3.1, source: A-Evolve FailurePatternDetector) ---
  let failurePatternAdvisory = null;
  try {
    const { getTopPatterns } = require('./lib/failure-pattern-aggregator');
    const patterns = getTopPatterns(3);
    if (patterns.length > 0) {
      const lines = patterns.map(p => `  ${p.type} (${p.count}x): ${p.suggestedFix || p.representative?.hypothesis || 'no fix recorded'}`);
      failurePatternAdvisory = `Recurring failure patterns:\n${lines.join('\n')}`;
    }
  } catch { /* aggregator may not exist yet */ }

  // Build advisory
  const total = Object.keys(results).length;

  // --- Graduated Evolution Scope (T2.2, source: A-Evolve AdaptiveEvolve) ---
  // When instinct count is high, raise acceptance bar to prevent bloat.
  const INSTINCT_CAP = 20; // hard cap from instinct-injector
  const HIGH_WATERMARK = 16;
  let graduatedScopeAdvisory = null;
  const headroom = INSTINCT_CAP - total;
  if (total >= HIGH_WATERMARK && headroom <= 4) {
    graduatedScopeAdvisory = `Instinct saturation: ${total}/${INSTINCT_CAP} (${headroom} headroom). New instincts require confidence >= 0.80 and curator-gate approval. Consider consolidating or retiring low-confidence instincts.`;
  }
  const decayedCount = Object.values(results).filter(r => r.decayed).length;
  const sessionDemotedCount = Object.values(results).filter(r => r.session_demoted).length;
  const backpressureCount = Object.values(results).filter(r => r.backpressure_applied).length;

  if (total > 0) {
    const parts = [
      `Instinct decay: ${total} instincts, ${decayedCount} decayed below raw confidence`,
      `${backpressureCount} snapped by backpressure gate`,
      `${sessionDemotedCount} demoted by session threshold`,
    ];

    for (const { name, supersededBy } of supersededWarnings) {
      parts.push(`WARNING: Instinct ${name} is superseded by ${supersededBy}`);
    }

    if (stagnationWarning) {
      parts.push(stagnationWarning);
    }

    if (failurePatternAdvisory) {
      parts.push(failurePatternAdvisory);
    }

    if (graduatedScopeAdvisory) {
      parts.push(graduatedScopeAdvisory);
    }

    const advisory = parts.join('. ') + '.';
    const hookOutput = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: advisory,
      },
    });
    process.stdout.write(hookOutput + '\n');
  }

  process.exit(0);
}

main();
