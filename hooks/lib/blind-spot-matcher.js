/**
 * Blind Spot Matcher Library
 *
 * Matches user messages against blind spot trigger keywords.
 * Respects confidence scoring, decay, and expiry.
 * Used by auto-recall.js to inject domain-specific blind spots.
 *
 * Source: claude-octopus blind-spot library pattern. Assimilation 2026-04-04.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BLIND_SPOTS_PATH = path.join(__dirname, 'blind-spots.json');
const MIN_MATCHING_KEYWORDS = 2;
const MIN_CONFIDENCE = 0.5;

let _cache = null;
let _cacheMtime = 0;

function loadBlindSpots() {
  try {
    const stat = fs.statSync(BLIND_SPOTS_PATH);
    if (_cache && stat.mtimeMs === _cacheMtime) return _cache;

    const raw = fs.readFileSync(BLIND_SPOTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    _cache = data;
    _cacheMtime = stat.mtimeMs;
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if a blind spot entry has expired based on decay class and last_validated.
 */
function isExpired(entry) {
  if (!entry.last_validated) return false;
  const validated = new Date(entry.last_validated).getTime();
  if (isNaN(validated)) return false;

  const now = Date.now();
  const daysSince = (now - validated) / (24 * 60 * 60 * 1000);
  const rules = loadBlindSpots()?._rules || {};
  const expireDays = rules.auto_expire_after_days || 180;

  return daysSince > expireDays;
}

/**
 * Compute effective confidence with time decay.
 */
function effectiveConfidence(entry) {
  const raw = entry.confidence || 0.5;
  if (!entry.last_validated) return raw;

  const validated = new Date(entry.last_validated).getTime();
  if (isNaN(validated)) return raw;

  const daysSince = (Date.now() - validated) / (24 * 60 * 60 * 1000);
  const rules = loadBlindSpots()?._rules || {};
  const decayDays = rules.decay_schedule_days || 90;

  // Decay rate based on decay_class
  const decayRates = { slow: 0.5, medium: 1.0, fast: 2.0 };
  const rate = decayRates[entry.decay_class] || 1.0;

  const decayFraction = Math.min(1, (daysSince / decayDays) * rate);
  const floor = 0.3;
  return Math.max(floor, raw - (raw - floor) * decayFraction * 0.5);
}

/**
 * Match blind spots against tokenized query words.
 * Returns array of { entry, matchCount, effectiveConf } sorted by match quality.
 */
function matchBlindSpots(queryWords) {
  const data = loadBlindSpots();
  if (!data || !data.entries) return [];

  const querySet = new Set(queryWords.map(w => w.toLowerCase()));
  const results = [];

  for (const entry of data.entries) {
    if (isExpired(entry)) continue;

    const conf = effectiveConfidence(entry);
    if (conf < MIN_CONFIDENCE) continue;

    // Count keyword matches
    let matchCount = 0;
    for (const kw of (entry.trigger_keywords || [])) {
      // Support multi-word keywords by checking if all parts are in query
      const kwParts = kw.toLowerCase().split('-');
      if (kwParts.every(part => querySet.has(part) || queryWords.some(w => w.includes(part)))) {
        matchCount++;
      }
    }

    if (matchCount >= MIN_MATCHING_KEYWORDS) {
      results.push({ entry, matchCount, effectiveConf: Math.round(conf * 100) / 100 });
    }
  }

  // Sort by match count desc, then confidence desc
  results.sort((a, b) => b.matchCount - a.matchCount || b.effectiveConf - a.effectiveConf);
  return results;
}

/**
 * Format matched blind spots for injection.
 */
function formatBlindSpots(matches, maxChars) {
  if (matches.length === 0) return null;

  const parts = ['[Blind Spots: domain-specific considerations]'];
  let totalLen = parts[0].length;

  for (const { entry, effectiveConf } of matches) {
    const line = `- [${entry.domain}] (${effectiveConf}): ${entry.blind_spot}`;
    if (totalLen + line.length > (maxChars || 500)) break;
    parts.push(line);
    totalLen += line.length;
  }

  return parts.length > 1 ? parts.join('\n') : null;
}

module.exports = { matchBlindSpots, formatBlindSpots, effectiveConfidence, isExpired };
