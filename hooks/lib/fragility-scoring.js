/**
 * Shared fragility scoring library.
 * Used by fragility-cache-builder.js and fragility-hook.js.
 *
 * Pure computation — no I/O, no git, no filesystem.
 */

'use strict';

const WEIGHTS = {
  churn: 0.25,
  authors: 0.10,
  size: 0.10,
  coupling: 0.15,
  recency: 0.10,
  bugFix: 0.20,
  testCoverage: 0.10,
};

const STATION_THRESHOLDS = [
  { max: 0.3, station: 0, label: 'low' },
  { max: 0.6, station: 1, label: 'moderate' },
  { max: 0.8, station: 2, label: 'high' },
  { max: 1.0, station: 3, label: 'critical' },
];

const CACHE_VERSION = 2;
const MAX_CACHE_SIZE = 1024 * 1024; // 1MB
const MAX_FILES = 500;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Bus-factor signal: sole author = highest risk (knowledge concentration),
// many authors = lower risk (shared ownership). Intentionally NOT inverted.
function authorSignal(count) {
  if (count === 0) return 0.5; // unknown — no history
  if (count === 1) return 1.0;
  if (count === 2) return 0.7;
  if (count === 3) return 0.4;
  return 0.1;
}

function computeScore(signals) {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const val = signals[key];
    if (typeof val === 'number' && !isNaN(val)) {
      score += Math.min(1, Math.max(0, val)) * weight;
    }
  }
  return Math.round(score * 100) / 100;
}

function getStation(score) {
  for (const t of STATION_THRESHOLDS) {
    if (score <= t.max) return { station: t.station, label: t.label };
  }
  return { station: 3, label: 'critical' };
}

function getTopSignal(signals) {
  let top = null;
  let topVal = -1;
  for (const [key, val] of Object.entries(signals)) {
    if (typeof val === 'number' && val > topVal && key in WEIGHTS) {
      topVal = val;
      top = key;
    }
  }
  return top;
}

// --- Multi-Axis Salience (SNARC-inspired) ---
// Maps raw signals to 5 named risk axes for richer advisories.
const AXIS_LABELS = {
  volatility: { low: 'stable', mid: 'active', high: 'volatile' },
  novelty:    { low: 'established', mid: 'maturing', high: 'novel' },
  coupling:   { low: 'isolated', mid: 'connected', high: 'entangled' },
  coverage:   { low: 'covered', mid: 'partial', high: 'exposed' },
  contention: { low: 'owned', mid: 'shared', high: 'contested' },
};

function axisLabel(value) {
  if (value < 0.33) return 'low';
  if (value < 0.66) return 'mid';
  return 'high';
}

/**
 * Compute 5 risk axes from raw signals.
 * Returns { axes: { volatility, novelty, coupling, coverage, contention }, dominantAxis }.
 * Pure computation — safe to call from any context. Fails gracefully.
 */
function computeAxes(signals) {
  try {
    const s = signals || {};

    // volatility: churn spike vs baseline (churn + recency compound)
    const volatility = round2(Math.min(1, ((s.churn || 0) * 0.7) + ((s.recency || 0) * 0.3)));

    // novelty: recent creation with little history (high recency + low churn = new file)
    const novelty = round2(Math.min(1, Math.max(0, (s.recency || 0) - (s.churn || 0) * 0.5 + 0.3)));

    // coupling: co-change density (direct from coupling signal)
    const coupling = round2(s.coupling || 0);

    // coverage: inverted test coverage (higher = less covered = more risk)
    const coverage = round2(s.testCoverage || 0);

    // contention: multi-author + bugFix (ownership disputes correlate with bug-fix churn)
    const contention = round2(Math.min(1, ((s.authors || 0) * 0.5) + ((s.bugFix || 0) * 0.5)));

    const axes = { volatility, novelty, coupling, coverage, contention };

    // Find dominant axis
    let dominantAxis = 'volatility';
    let maxVal = -1;
    for (const [axis, val] of Object.entries(axes)) {
      if (val > maxVal) {
        maxVal = val;
        dominantAxis = axis;
      }
    }

    return { axes, dominantAxis };
  } catch {
    return null;
  }
}

function formatAdvisory(fileEntry, filePath) {
  const { score, station, signals, blastRadius, topSignal } = fileEntry;
  if (station === 0) return null;

  const signalParts = Object.entries(signals)
    .filter(([k, v]) => v >= 0.5 && k in WEIGHTS)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${k} (${v})`)
    .join(', ');

  const blastPart = blastRadius && blastRadius.length > 0
    ? ` Blast radius: ${blastRadius.slice(0, 5).join(', ')}.`
    : '';

  if (station === 1) {
    return `File fragility: ${score} (moderate). Top signal: ${topSignal || 'unknown'}.`;
  }
  // For Station 2+, append axis analysis if available
  let axisPart = '';
  if (station >= 2 && fileEntry.axes) {
    const { axes, dominantAxis } = fileEntry;
    if (axes && dominantAxis) {
      const label = AXIS_LABELS[dominantAxis]?.[axisLabel(axes[dominantAxis])] || dominantAxis;
      const elevated = Object.entries(axes)
        .filter(([, v]) => v >= 0.5)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      axisPart = ` Dominant axis: ${dominantAxis} (${label}).${elevated ? ` Elevated: ${elevated}.` : ''}`;
    }
  }

  if (station === 2) {
    return `FRAGILE FILE (score: ${score}, Station 2). Signals: ${signalParts}.${blastPart}${axisPart} Consider quality gate escalation.`;
  }
  return `CRITICAL FRAGILITY (score: ${score}, Station 3). Signals: ${signalParts}.${blastPart}${axisPart} Human review strongly recommended.`;
}

module.exports = {
  WEIGHTS,
  STATION_THRESHOLDS,
  CACHE_VERSION,
  MAX_CACHE_SIZE,
  MAX_FILES,
  AXIS_LABELS,
  round2,
  authorSignal,
  computeScore,
  computeAxes,
  getStation,
  getTopSignal,
  formatAdvisory,
};
