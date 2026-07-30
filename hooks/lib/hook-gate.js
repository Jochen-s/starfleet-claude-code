/**
 * Effort-based hook gating library.
 *
 * Usage:
 *   const { shouldFire, getProfile, getInjectionBudget, consumeInjectionBudget } = require('./lib/hook-gate');
 *   if (!shouldFire('my-hook-name')) process.exit(0);
 *
 * Reads effort profile from ~/.claude/cache/current-effort-profile.json
 * Reads taxonomy from ./lib/hook-taxonomy.json
 * Default profile: 'standard' (QUALITY hooks fire, OBSERVABILITY gated)
 *
 * Injection budget: tracks tokens injected per turn via shared state file.
 * All operations are sync and <2ms.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILE_PATH = path.join(os.homedir(), '.claude', 'cache', 'current-effort-profile.json');
const TAXONOMY_PATH = path.join(__dirname, 'hook-taxonomy.json');
const BUDGET_PATH = path.join(os.homedir(), '.claude', 'cache', 'injection-budget.json');

const DEFAULT_PROFILE = 'standard';
const MAX_INJECTION_TOKENS = 1000;
const BUDGET_TTL_MS = 30000; // 30s - reset budget between turns

let _taxonomyCache = null;
let _taxonomyCacheMtime = 0;

function loadTaxonomy() {
  try {
    const stat = fs.statSync(TAXONOMY_PATH);
    if (_taxonomyCache && stat.mtimeMs === _taxonomyCacheMtime) {
      return _taxonomyCache;
    }
    const raw = fs.readFileSync(TAXONOMY_PATH, 'utf8');
    _taxonomyCache = JSON.parse(raw);
    _taxonomyCacheMtime = stat.mtimeMs;
    return _taxonomyCache;
  } catch {
    return null;
  }
}

function getProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return data.profile || data.level || DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * Check if a hook should fire based on current effort profile.
 * Returns true if the hook should run, false if it should be gated.
 *
 * NEVER_GATE and INFRASTRUCTURE hooks always return true.
 * Unknown hooks always return true (fail-open for safety).
 */
function shouldFire(hookName) {
  const taxonomy = loadTaxonomy();
  if (!taxonomy) return true; // fail-open if taxonomy missing

  // Normalize hook name (strip path, extension)
  const normalized = path.basename(hookName).replace(/\.(js|sh|mjs)$/, '');

  const hookInfo = taxonomy.hooks[normalized];
  if (!hookInfo) return true; // unknown hook = fail-open

  const hookClass = hookInfo.class;

  // NEVER_GATE and INFRASTRUCTURE always fire
  if (hookClass === 'NEVER_GATE' || hookClass === 'INFRASTRUCTURE') {
    return true;
  }

  const profile = getProfile();
  const rules = taxonomy.gating_rules[profile];
  if (!rules) return true; // unknown profile = fail-open

  return rules.active_classes.includes(hookClass);
}

/**
 * Get remaining injection token budget for this turn.
 */
function getInjectionBudget() {
  try {
    const raw = fs.readFileSync(BUDGET_PATH, 'utf8');
    const data = JSON.parse(raw);
    // Reset if stale (new turn)
    if (Date.now() - data.timestamp > BUDGET_TTL_MS) {
      return MAX_INJECTION_TOKENS;
    }
    return Math.max(0, MAX_INJECTION_TOKENS - (data.consumed || 0));
  } catch {
    return MAX_INJECTION_TOKENS;
  }
}

/**
 * Consume injection budget tokens. Returns actual tokens consumed (may be less than requested).
 */
function consumeInjectionBudget(tokens) {
  let data = { consumed: 0, timestamp: Date.now() };
  try {
    const raw = fs.readFileSync(BUDGET_PATH, 'utf8');
    data = JSON.parse(raw);
    if (Date.now() - data.timestamp > BUDGET_TTL_MS) {
      data = { consumed: 0, timestamp: Date.now() };
    }
  } catch {
    // fresh budget
  }

  const available = Math.max(0, MAX_INJECTION_TOKENS - data.consumed);
  const actual = Math.min(tokens, available);
  data.consumed += actual;
  data.timestamp = data.timestamp || Date.now();

  try {
    const tmp = BUDGET_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, BUDGET_PATH);
  } catch {
    // non-fatal
  }

  return actual;
}

module.exports = { shouldFire, getProfile, getInjectionBudget, consumeInjectionBudget };
