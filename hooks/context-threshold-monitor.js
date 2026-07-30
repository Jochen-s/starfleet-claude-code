#!/usr/bin/env node
/**
 * Context Threshold Monitor — Hull Integrity System
 * PostToolUse hook that monitors context window usage.
 *
 * Quality Ceiling Architecture (1M context window, 400K quality ceiling):
 * - Green (0-24%): No action (~0-240K tokens)
 * - Amber (25-32%): Checkpoint, console note (~250-320K tokens)
 * - Red (33-37%): Full checkpoint, "Wrap current task, plan for /compact" (~330-370K tokens)
 * - Critical (38-40%): "Run /compact NOW" (~380-400K quality ceiling)
 * - CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40: Aligns autocompact with quality ceiling
 *
 * Rationale: 1M window is a safety net, not a target. Quality degrades
 * above ~400K tokens. The 400K-835K range is emergency buffer.
 *
 * ASSUMPTION: 1M context window (Max plan default since 2026-03-13).
 * LIMITATION: Hooks cannot detect absolute window size or condition autocompact
 * dynamically. model.display_name is available but CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
 * is a static env var read once at startup. If plan drops to 200K, change override to 80.
 *
 * Crossing logic: only triggers when threshold is FIRST crossed.
 * Rate limits: Amber 5min, Red 3min, Critical 2min.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
// child_process used in runRetention() via execFileSync (no shell injection)

const HOME_DIR = os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.claude', 'cache');
const STATE_FILE = path.join(CACHE_DIR, 'context-monitor-state.json');
const CHECKPOINT_FILE = path.join(CACHE_DIR, 'session-checkpoint.json');
const HOOKS_DIR = path.join(HOME_DIR, '.claude', 'hooks');

// Quality Ceiling thresholds (percentage of context USED)
// Calibrated for 1M window with 400K quality ceiling (~40%)
// The 400K-835K range is emergency buffer; system autocompact at ~83.5%
// NOTE: On non-Max plans (200K window), these thresholds fire earlier in
// absolute tokens (e.g., Amber at 50K). This is acceptable — the percentage-
// based quality degradation applies regardless of window size.
const AMBER_THRESHOLD = 25;
const RED_THRESHOLD = 33;
const CRITICAL_THRESHOLD = 38;

// Rate limits per tier
const AMBER_RATE_MS = 5 * 60 * 1000;
const RED_RATE_MS = 3 * 60 * 1000;
const CRITICAL_RATE_MS = 2 * 60 * 1000;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Schema migration: if old 2-tier state, reset
      if (!('amberCrossed' in state)) {
        return freshState(state.sessionId);
      }
      // Merge with defaults so new fields (velocityHistory, lastVelocityWarning)
      // are populated even for existing state files (schema forward-compat).
      const defaults = freshState(state.sessionId);
      return Object.assign({}, defaults, state);
    }
  } catch (e) {}
  return freshState(null);
}

// Context velocity tracking (Laurenzo study: rapid consumption = thrashing trajectory)
const VELOCITY_WINDOW = 5;           // Track last N used_pct readings
const VELOCITY_WARN_THRESHOLD = 1.0; // 1% per tool call = hitting Amber in <25 calls
const VELOCITY_RATE_LIMIT_MS = 3 * 60 * 1000; // 3 minutes
const COMPACTION_DROP_THRESHOLD = 20; // >20% drop between calls = compaction detected

function freshState(sessionId) {
  return {
    lastAmber: 0,
    lastRed: 0,
    lastCritical: 0,
    amberCrossed: false,
    redCrossed: false,
    criticalCrossed: false,
    sessionId: sessionId,
    velocityHistory: [],       // last N used_pct readings
    lastVelocityWarning: 0,
  };
}

function saveState(state) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmpPath = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    fs.renameSync(tmpPath, STATE_FILE);
  } catch (e) {}
}

function writeCheckpoint(data, used) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const checkpoint = {
      schema_version: 2,
      timestamp: new Date().toISOString(),
      sessionId: data.session_id || null,
      usedPct: used,
      hullIntegrity: getTierLabel(used),
      currentTask: null,
      recentFiles: [],
      projectPath: process.env.CWD || process.cwd()
    };

    // Try to extract task and files from tool_input safely
    // Validate file_path: reject path traversal and non-string values
    if (data.tool_input?.file_path && typeof data.tool_input.file_path === 'string') {
      const fp = data.tool_input.file_path;
      if (!fp.includes('..') && fp.length < 500) {
        checkpoint.recentFiles.push(fp);
      }
    }

    // Read existing checkpoint to preserve recentFiles
    try {
      if (fs.existsSync(CHECKPOINT_FILE)) {
        const prev = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        if (prev.recentFiles) {
          const combined = [...new Set([...checkpoint.recentFiles, ...prev.recentFiles])];
          checkpoint.recentFiles = combined.slice(0, 20);
        }
        if (prev.currentTask) checkpoint.currentTask = prev.currentTask;
      }
    } catch (e) {}

    const tmpCheckpoint = CHECKPOINT_FILE + '.tmp';
    fs.writeFileSync(tmpCheckpoint, JSON.stringify(checkpoint, null, 2));
    fs.renameSync(tmpCheckpoint, CHECKPOINT_FILE);
    return true;
  } catch (e) {
    return false;
  }
}

function getTierLabel(used) {
  if (used >= CRITICAL_THRESHOLD) return 'Critical';
  if (used >= RED_THRESHOLD) return 'Red';
  if (used >= AMBER_THRESHOLD) return 'Amber';
  return 'Green';
}

// --- Metabolic State Machine ---
const METABOLIC_FILE = path.join(CACHE_DIR, 'metabolic-state.json');
const ACTIONS_FILE = path.join(CACHE_DIR, 'recent-actions.jsonl');
const FAILURE_STATE_FILE = path.join(CACHE_DIR, 'failure-state.json');
const FOCUS_CONSECUTIVE = 5; // same-intent actions to enter FOCUS
const FOCUS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const RECOVERY_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TRANSITIONS = 10;

function loadMetabolicState() {
  try {
    const raw = fs.readFileSync(METABOLIC_FILE, 'utf8');
    if (raw.length > 16 * 1024) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveMetabolicState(state) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmpPath = METABOLIC_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpPath, METABOLIC_FILE);
  } catch { /* non-critical */ }
}

function getRecentIntents() {
  try {
    const raw = fs.readFileSync(ACTIONS_FILE, 'utf8');
    if (raw.length > 32 * 1024) return [];
    return raw.trim().split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function getFailureCount() {
  try {
    const raw = fs.readFileSync(FAILURE_STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    return state.consecutiveFailures || 0;
  } catch { return 0; }
}

// Intents with no associated topic — should not trigger FOCUS
const NULL_TOPIC_INTENTS = new Set(['research', 'unknown', 'bash-generic', 'code-generic', 'version-control', 'planning']);

// --- Fatigue Signals (re-read ratio + scope scatter) ---
// Source: claude-bootstrap Mnemos 4-dimension fatigue model. Assimilation 2026-04-04.
const REREAD_WARN_THRESHOLD = 0.3;  // 30%+ reads are re-reads = context degradation
const SCATTER_WARN_THRESHOLD = 8;   // 8+ unique directories = high scope scatter

function computeFatigueSignals(actions) {
  if (!actions || actions.length < 5) return null;

  // Re-read ratio: files Read more than once in this session
  const readFiles = {};
  let totalReads = 0;
  let reReads = 0;

  // Scope scatter: unique directories touched
  const directories = new Set();

  for (const action of actions) {
    const tool = action.tool || action.toolName || '';
    const filePath = action.file || action.filePath || '';

    if (filePath) {
      const dir = filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '') || '/';
      directories.add(dir);
    }

    if (tool === 'Read' && filePath) {
      totalReads++;
      readFiles[filePath] = (readFiles[filePath] || 0) + 1;
      if (readFiles[filePath] > 1) reReads++;
    }
  }

  const reReadRatio = totalReads > 0 ? reReads / totalReads : 0;
  const scopeScatter = directories.size;

  return {
    reReadRatio: Math.round(reReadRatio * 100) / 100,
    scopeScatter,
    totalReads,
    reReads,
    fatigueWarning: reReadRatio >= REREAD_WARN_THRESHOLD || scopeScatter >= SCATTER_WARN_THRESHOLD,
    signals: [
      reReadRatio >= REREAD_WARN_THRESHOLD ? `Re-read ratio ${Math.round(reReadRatio * 100)}% (${reReads}/${totalReads} reads are re-reads, indicating context loss)` : null,
      scopeScatter >= SCATTER_WARN_THRESHOLD ? `Scope scatter: ${scopeScatter} directories touched (high context switching)` : null,
    ].filter(Boolean),
  };
}

/**
 * Compute metabolic state based on action patterns and system health.
 * States: NORMAL -> FOCUS -> CRISIS -> RECOVERY -> NORMAL
 *
 * Accepts currentIntent to avoid race condition with action-logger
 * (both are PostToolUse hooks that may run in parallel).
 */
function computeMetabolicState(hullTier, used, sessionId, currentIntent) {
  const now = Date.now();
  const prev = loadMetabolicState() || {
    state: 'NORMAL', enteredAt: now, focusIntent: null, sessionId: null, transitions: []
  };

  // Session binding: reset on new session to prevent stale CRISIS
  if (sessionId && prev.sessionId && prev.sessionId !== sessionId) {
    const fresh = { state: 'NORMAL', enteredAt: now, focusIntent: null, sessionId, transitions: [] };
    saveMetabolicState(fresh);
    return fresh;
  }

  let newState = prev.state;
  let focusIntent = prev.focusIntent;

  // Read actions buffer once (fixes double-read performance issue)
  const actions = getRecentIntents();
  // Include current intent to avoid race with action-logger
  if (currentIntent) {
    actions.push({ intent: currentIntent, ts: now });
  }

  // RECOVERY -> NORMAL: 5min elapsed
  if (prev.state === 'RECOVERY') {
    if (now - prev.enteredAt >= RECOVERY_DURATION_MS) {
      newState = 'NORMAL';
      focusIntent = null;
    }
  }

  // CRISIS -> RECOVERY: post-compaction hull drops below Red
  if (prev.state === 'CRISIS') {
    if (hullTier !== 'Red' && hullTier !== 'Critical') {
      newState = 'RECOVERY';
      focusIntent = null;
    }
  }

  // FOCUS -> NORMAL: intent changes or 10min timeout
  if (prev.state === 'FOCUS') {
    const latest = actions.length > 0 ? actions[actions.length - 1] : null;
    if (now - prev.enteredAt >= FOCUS_TIMEOUT_MS) {
      newState = 'NORMAL';
      focusIntent = null;
    } else if (latest && latest.intent !== prev.focusIntent) {
      newState = 'NORMAL';
      focusIntent = null;
    }
  }

  // NORMAL -> CRISIS: hull Red + 3+ failures
  if (newState === 'NORMAL' || newState === 'FOCUS') {
    const failures = getFailureCount();
    if ((hullTier === 'Red' || hullTier === 'Critical') && failures >= 3) {
      newState = 'CRISIS';
      focusIntent = null;
    }
  }

  // NORMAL -> FOCUS: 5 consecutive same-intent actions (only actionable intents)
  if (newState === 'NORMAL') {
    if (actions.length >= FOCUS_CONSECUTIVE) {
      const recent = actions.slice(-FOCUS_CONSECUTIVE);
      const intents = recent.map(a => a.intent);
      const candidate = intents[0];
      if (intents.every(i => i === candidate) && !NULL_TOPIC_INTENTS.has(candidate)) {
        newState = 'FOCUS';
        focusIntent = candidate;
      }
    }
  }

  // Record transition
  const transitions = prev.transitions || [];
  if (newState !== prev.state) {
    transitions.push({ from: prev.state, to: newState, at: now });
    while (transitions.length > MAX_TRANSITIONS) transitions.shift();
  }

  const metabolic = {
    state: newState,
    enteredAt: newState !== prev.state ? now : prev.enteredAt,
    focusIntent,
    sessionId: sessionId || prev.sessionId,
    transitions,
  };

  saveMetabolicState(metabolic);
  return metabolic;
}

/**
 * Strip ANSI escape sequences and control characters for safe terminal display.
 */
function sanitizeForDisplay(str) {
  return String(str)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // CSI sequences
    .replace(/\x1b\][^\x07]*\x07/g, '')        // OSC sequences
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '') // control chars (keep \t \n)
    .slice(0, 80);
}

/**
 * Read active task info from cache files (set by pre-compact-retention).
 * Returns a short string like "Task: 'Phase 5' in progress" or null.
 * Only called in Red/Critical zones — not on every PostToolUse.
 */
function getActiveTaskInfo() {
  try {
    // Try task-snapshot.json first (team tasks)
    const snapshotFile = path.join(CACHE_DIR, 'task-snapshot.json');
    if (fs.existsSync(snapshotFile)) {
      const stat = fs.statSync(snapshotFile);
      // Only use if recent (< 30 min old)
      if (Date.now() - stat.mtimeMs < 30 * 60 * 1000) {
        const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
        if (snapshot.tasks && Array.isArray(snapshot.tasks)) {
          const active = snapshot.tasks.filter(t => t.status === 'in_progress');
          if (active.length > 0) {
            const names = active.slice(0, 2).map(t => sanitizeForDisplay(t.subject || 'unnamed')).join(', ');
            return `${active.length} task(s) in progress: ${names}`;
          }
        }
      }
    }
  } catch { /* ignore */ }

  try {
    // Fallback: session-checkpoint.json currentTask
    const checkpointFile = path.join(CACHE_DIR, 'session-checkpoint.json');
    if (fs.existsSync(checkpointFile)) {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      if (checkpoint.currentTask) {
        return `Current task: ${sanitizeForDisplay(checkpoint.currentTask)}`;
      }
    }
  } catch { /* ignore */ }

  return null;
}

// --- Rate Limit Visibility (T2.4, OAuth Usage API) ---
// Source: claude-usage-report (abhiyankhanal). Assimilation 2026-04-04.
const RATE_CACHE_PATH = path.join(CACHE_DIR, 'rate-limit-cache.json');
const RATE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min cache

function getRateLimitInfo() {
  try {
    const raw = fs.readFileSync(RATE_CACHE_PATH, 'utf8');
    if (raw.length > 8 * 1024) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - (cached.timestamp || 0) < RATE_CACHE_TTL_MS) {
      return cached.data;
    }
  } catch { /* no cache or stale */ }

  // Try to fetch from OAuth API (async-safe: we just try, don't block)
  try {
    const credsPath = path.join(HOME_DIR, '.claude', '.credentials.json');
    if (!fs.existsSync(credsPath)) return null;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const token = creds.claudeAiOauth?.accessToken;
    if (!token) return null;

    // Use sync HTTPS request via child_process (keeps hook sync)
    const { execFileSync } = require('child_process');
    const result = execFileSync('node', ['-e', `
      const https = require('https');
      const options = {
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        headers: { 'Authorization': 'Bearer ${token}', 'anthropic-beta': 'oauth-2025-04-20' },
        timeout: 3000
      };
      const req = https.get(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => process.stdout.write(data));
      });
      req.on('error', () => process.exit(0));
      req.on('timeout', () => { req.destroy(); process.exit(0); });
    `], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });

    if (result) {
      const data = JSON.parse(result);
      // Cache it
      const cacheData = { timestamp: Date.now(), data };
      const tmp = RATE_CACHE_PATH + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(cacheData), 'utf8');
      fs.renameSync(tmp, RATE_CACHE_PATH);
      return data;
    }
  } catch { /* non-critical */ }
  return null;
}

function formatRateLimit(info) {
  if (!info) return null;
  const parts = [];
  if (info.five_hour?.utilization != null) {
    const pct = Math.round(info.five_hour.utilization * 100);
    if (pct > 50) {
      const resetAt = info.five_hour.resets_at ? new Date(info.five_hour.resets_at).toLocaleTimeString() : '?';
      parts.push(`5h usage: ${pct}% (resets ${resetAt})`);
    }
  }
  if (info.seven_day?.utilization != null) {
    const pct = Math.round(info.seven_day.utilization * 100);
    if (pct > 30) {
      parts.push(`Weekly: ${pct}%`);
    }
  }
  return parts.length > 0 ? parts.join(' | ') : null;
}

function runRetention() {
  // Hardcoded path to our own retention script — no user input
  const { execFileSync } = require('child_process');
  const retentionScript = path.join(HOOKS_DIR, 'pre-compact-retention.js');
  if (fs.existsSync(retentionScript)) {
    try {
      execFileSync('node', [retentionScript], {
        stdio: 'ignore',
        timeout: 10000,
        env: { ...process.env }, // Explicitly forward CWD and session env
        cwd: process.cwd()
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const remaining = data.context_window?.remaining_percentage;
      const sessionId = data.session_id;

      // Validate session_id format (used in file paths and state binding)
      if (sessionId && (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionId))) {
        return;
      }

      if (remaining == null) return;

      const used = 100 - Math.round(remaining);
      const now = Date.now();
      const state = loadState();

      // Compute metabolic state (writes to cache for intent-context.js and measurer)
      // Classify current intent inline to avoid race with action-logger
      const hullTier = getTierLabel(used);
      let currentIntent = null;
      try {
        const classifier = require('./lib/intent-classifier');
        const toolName = data.tool_name || '';
        const toolInput = data.tool_input || {};
        const result = classifier.classifyIntent(toolName, toolInput);
        currentIntent = result.intent;
      } catch { /* classifier unavailable — degrade gracefully */ }
      // Skip metabolic computation in Green zone when already NORMAL (F-001 optimization)
      if (hullTier !== 'Green') {
        computeMetabolicState(hullTier, used, sessionId, currentIntent);
      } else {
        // In Green: only compute if previous state was non-NORMAL (needs transition back)
        const prevMetabolic = loadMetabolicState();
        if (prevMetabolic && prevMetabolic.state !== 'NORMAL') {
          computeMetabolicState(hullTier, used, sessionId, currentIntent);
        }
      }

      // Reset state on new session
      if (sessionId && state.sessionId !== sessionId) {
        Object.assign(state, freshState(sessionId));
      }

      // --- Context Velocity Tracking (Laurenzo study) ---
      // Detect rapid context consumption and compaction events.
      if (!state.velocityHistory) state.velocityHistory = [];
      const prevUsed = state.velocityHistory.length > 0
        ? state.velocityHistory[state.velocityHistory.length - 1] : null;

      // Compaction detection: sudden drop means context was compacted
      // prevUsed === null on first call (no history yet) -- skip detection
      if (prevUsed !== null && prevUsed - used > COMPACTION_DROP_THRESHOLD) {
        // Reset velocity history after compaction (baseline is now different)
        state.velocityHistory = [used];
      } else {
        state.velocityHistory.push(used);
        if (state.velocityHistory.length > VELOCITY_WINDOW) {
          state.velocityHistory.shift();
        }
      }

      // Compute velocity: average pct increase per tool call over the window
      if (state.velocityHistory.length >= 3) {
        const hist = state.velocityHistory;
        const delta = hist[hist.length - 1] - hist[0];
        const velocity = delta / (hist.length - 1);

        if (velocity >= VELOCITY_WARN_THRESHOLD) {
          if (!state.lastVelocityWarning) state.lastVelocityWarning = 0;
          if (now - state.lastVelocityWarning >= VELOCITY_RATE_LIMIT_MS) {
            state.lastVelocityWarning = now;
            const callsToAmber = AMBER_THRESHOLD > used
              ? Math.round((AMBER_THRESHOLD - used) / velocity) : 0;
            console.log('');
            console.log('\x1b[33mContext velocity alert: ' + velocity.toFixed(1) + '% per tool call (threshold: ' + VELOCITY_WARN_THRESHOLD + '%)\x1b[0m');
            if (callsToAmber > 0) {
              console.log('\x1b[2m   At this rate, hull Amber in ~' + callsToAmber + ' tool calls. Consider pausing to verify task scope.\x1b[0m');
            }
            console.log('');
          }
        }
      }
      saveState(state);

      // Critical tier (38-40%) — at quality ceiling, 43% buffer before system autocompact
      if (used >= CRITICAL_THRESHOLD) {
        const justCrossed = !state.criticalCrossed;
        state.criticalCrossed = true;
        state.redCrossed = true;
        state.amberCrossed = true;

        if (justCrossed || (now - state.lastCritical > CRITICAL_RATE_MS)) {
          state.lastCritical = now;
          saveState(state);
          writeCheckpoint(data, used);

          const remaining_to_ceiling = Math.max(0, 40 - used);
          const taskInfo = getActiveTaskInfo();
          console.log('');
          console.log('\x1b[5;31mHull Integrity CRITICAL: ' + used + '% — Run /compact NOW!\x1b[0m');
          if (remaining_to_ceiling > 0) {
            console.log('\x1b[31m   ' + remaining_to_ceiling + '% to quality ceiling (40%). Quality degrades beyond 400K tokens.\x1b[0m');
          } else {
            console.log('\x1b[31m   Quality ceiling exceeded. Operating in degraded quality zone (' + used + '% of 40% ceiling).\x1b[0m');
          }
          if (taskInfo) {
            console.log('\x1b[31m   ' + taskInfo + ' — complete or checkpoint before compact\x1b[0m');
          }
          console.log('');
        }
        return;
      }

      // Red tier (33-37%) — wrap up, plan for compact
      if (used >= RED_THRESHOLD) {
        const justCrossed = !state.redCrossed;
        state.redCrossed = true;
        state.amberCrossed = true;

        if (justCrossed || (now - state.lastRed > RED_RATE_MS)) {
          state.lastRed = now;
          saveState(state);
          writeCheckpoint(data, used);
          runRetention();

          const taskInfo = getActiveTaskInfo();
          console.log('');
          console.log('\x1b[31mHull Integrity RED: ' + used + '% — Wrap current task, plan for /compact\x1b[0m');
          console.log('\x1b[2m   Checkpoint saved. State preserved to activeContext + session-checkpoint.json\x1b[0m');
          if (taskInfo) {
            console.log('\x1b[33m   ' + taskInfo + ' — consider completing before compact\x1b[0m');
          }
          // Fatigue signals at Red (stronger warning)
          const fatigue = computeFatigueSignals(actions);
          if (fatigue && fatigue.fatigueWarning) {
            for (const signal of fatigue.signals) {
              console.log('\x1b[31m   Fatigue: ' + signal + '\x1b[0m');
            }
          }
          console.log('\x1b[33m   Instruction shedding active. MEMORY.md may be trimmed to conserve context.\x1b[0m');
          console.log('');
        }
        return;
      }

      // Amber tier (25-32%) — checkpoint, heads up
      if (used >= AMBER_THRESHOLD) {
        const justCrossed = !state.amberCrossed;
        state.amberCrossed = true;

        if (justCrossed || (now - state.lastAmber > AMBER_RATE_MS)) {
          state.lastAmber = now;
          saveState(state);

          writeCheckpoint(data, used);
          const success = runRetention();

          console.log('');
          if (success) {
            console.log('\x1b[33mHull Integrity AMBER: ' + used + '% — Checkpoint saved\x1b[0m');
            console.log('\x1b[2m   State preserved to activeContext + session-checkpoint.json\x1b[0m');
          } else {
            console.log('\x1b[33mHull Integrity AMBER: ' + used + '% — Checkpoint written\x1b[0m');
          }

          // Fatigue signals (re-read ratio + scope scatter)
          const fatigue = computeFatigueSignals(actions);
          if (fatigue && fatigue.fatigueWarning) {
            for (const signal of fatigue.signals) {
              console.log('\x1b[33m   Fatigue: ' + signal + '\x1b[0m');
            }
          }

          // Rate limit visibility (cached, 30-min TTL)
          const rateInfo = getRateLimitInfo();
          const rateStr = formatRateLimit(rateInfo);
          if (rateStr) {
            console.log('\x1b[2m   Rate limits: ' + rateStr + '\x1b[0m');
          }

          console.log('\x1b[2m   Consider running `/kln:remember` to capture session learnings before context pressure increases.\x1b[0m');
          console.log('');
        }
      }

      // Green tier (0-24%) — no action needed
    } catch (e) {
      // Silent fail - don't break the tool use
    }
  });
}

main();
