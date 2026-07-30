/**
 * Failure Pattern Aggregator
 *
 * Aggregates failure reflections from ~/.claude/cache/failure-reflections.jsonl
 * into typed patterns across sessions. When the same failure type recurs 3+
 * times, produces a structured pattern recommendation.
 *
 * Adapted from A-Evolve FailurePatternDetector (analyzer.py lines 396-481)
 * for the live-session Borg Collective hook stack.
 *
 * Exports:
 *   aggregatePatterns() -> Map<string, PatternEntry>
 *   getTopPatterns(limit) -> PatternEntry[]
 *
 * PatternEntry shape:
 *   { type, count, lastSeen, suggestedFix, representative }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REFLECTIONS_PATH = path.join(os.homedir(), '.claude', 'cache', 'failure-reflections.jsonl');
const FILE_SIZE_LIMIT = 512 * 1024; // 512 KB
const PATTERN_THRESHOLD = 3;

/**
 * Normalize an error signature for grouping: lowercase, trim whitespace,
 * collapse internal runs of whitespace to a single space.
 *
 * @param {string} sig
 * @returns {string}
 */
function normalizeSignature(sig) {
  if (typeof sig !== 'string') return '';
  return sig.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Classify a failure entry into a pattern type based on heuristics applied
 * to tool_name and error_signature.
 *
 * @param {Object} entry - raw reflection entry
 * @param {string} normalizedSig - already-normalized error_signature
 * @param {Map<string, {toolCount: number}>} toolFailureCounts - mutable accumulator
 * @returns {string} pattern type
 */
function classifyEntry(entry, normalizedSig, toolFailureCounts) {
  // Tier 1: operational failures (highest priority, most specific)
  if (/permission\s*denied|access\s*denied|blocked\s*by\s*policy|eacces|eperm/.test(normalizedSig)) {
    return 'permission-blocked';
  }
  if (/enoent|no such file|file not found/.test(normalizedSig)) {
    return 'file-not-found';
  }
  if (/timeout|etimedout/.test(normalizedSig)) {
    return 'timeout';
  }
  if (/encoding|decode|charmap/.test(normalizedSig)) {
    return 'encoding-error';
  }

  // Tier 2: strategic failures (MCASP gap classification extension)
  if (/context.window|token.limit|output.truncat|context.length/.test(normalizedSig)) {
    return 'context-overload';
  }
  if (/econnrefused|econnreset|503|502|504|429|service.unavailable|rate.limit|api.rate/.test(normalizedSig)) {
    return 'external-dependency';
  }
  if (/too.many.sub|circular.dependency|max.*depth.*exceeded|delegation.depth/.test(normalizedSig)) {
    return 'bad-decomposition';
  }
  if (/skill.not.found|no.matching.skill|unknown.skill/.test(normalizedSig)) {
    return 'missing-skill';
  }
  if (/no.relevant.entries|memory.retrieval.*0|knowledge.base.*empty/.test(normalizedSig)) {
    return 'missing-memory';
  }
  if (/no.eval.coverage|untested.*path|no.test.*coverage/.test(normalizedSig)) {
    return 'missing-eval';
  }
  if (/ambiguous.requirement|contradictory.spec|unclear.requirement/.test(normalizedSig)) {
    return 'bad-requirements';
  }
  if (/requires.*approval|station.*violation|budget.*exceeded|unsafe.*autonom/.test(normalizedSig)) {
    return 'unsafe-autonomy';
  }

  return 'generic';
}

/**
 * Load and parse failure-reflections.jsonl.
 * Returns an array of valid entry objects, or an empty array if the file is
 * absent, oversized, or contains no parseable lines.
 *
 * @returns {Object[]}
 */
function loadReflections() {
  try {
    const stat = fs.statSync(REFLECTIONS_PATH);
    if (stat.size > FILE_SIZE_LIMIT) {
      return [];
    }
  } catch (_) {
    // File does not exist or is inaccessible — proceed with empty set.
    return [];
  }

  let raw;
  try {
    raw = fs.readFileSync(REFLECTIONS_PATH, { encoding: 'utf-8' });
  } catch (_) {
    return [];
  }

  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      // Require minimum fields to be useful.
      if (obj && typeof obj.error_signature === 'string' && typeof obj.tool_name === 'string') {
        entries.push(obj);
      }
    } catch (_) {
      // Skip malformed lines silently.
    }
  }

  return entries;
}

/**
 * Aggregate all failure reflections into a map of patterns keyed by a
 * canonical pattern key (type + ":" + normalized signature).
 *
 * @returns {Map<string, Object>}
 */
function aggregatePatterns() {
  const entries = loadReflections();
  if (entries.length === 0) return new Map();

  // First pass: count per-tool failures to resolve "repeated-tool-failure".
  const toolFailureCounts = new Map(); // tool_name -> count
  for (const entry of entries) {
    const tool = entry.tool_name;
    toolFailureCounts.set(tool, (toolFailureCounts.get(tool) || 0) + 1);
  }

  // Second pass: build pattern buckets.
  // Key: "type:normalizedSignature"
  const buckets = new Map();

  for (const entry of entries) {
    const normalizedSig = normalizeSignature(entry.error_signature);
    if (!normalizedSig) continue;

    let type = classifyEntry(entry, normalizedSig, toolFailureCounts);

    // Promote to repeated-tool-failure if this tool has 3+ total failures
    // and no more specific classification was found.
    if (type === 'generic' && (toolFailureCounts.get(entry.tool_name) || 0) >= PATTERN_THRESHOLD) {
      type = 'repeated-tool-failure';
    }

    const key = type + ':' + normalizedSig;

    if (!buckets.has(key)) {
      buckets.set(key, {
        type,
        count: 0,
        lastSeen: null,
        _lastTimestamp: 0, // numeric ms for comparison
        suggestedFix: null,
        representative: null,
      });
    }

    const bucket = buckets.get(key);
    bucket.count += 1;

    // Track the most recent entry by timestamp.
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
    if (!isNaN(ts) && ts > bucket._lastTimestamp) {
      bucket._lastTimestamp = ts;
      bucket.lastSeen = entry.timestamp;
      bucket.suggestedFix = entry.avoidance || null;
      bucket.representative = entry;
    }
  }

  // Remove internal helper field and discard sub-threshold patterns.
  const result = new Map();
  for (const [key, bucket] of buckets) {
    if (bucket.count >= PATTERN_THRESHOLD) {
      delete bucket._lastTimestamp;
      result.set(key, bucket);
    }
  }

  return result;
}

/**
 * Return the top N patterns sorted by count (descending), then lastSeen
 * (most recent first).
 *
 * @param {number} [limit=10]
 * @returns {Object[]}
 */
function getTopPatterns(limit) {
  const n = typeof limit === 'number' && limit > 0 ? limit : 10;
  const patterns = Array.from(aggregatePatterns().values());

  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Tie-break: more recent first.
    const tA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const tB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return tB - tA;
  });

  return patterns.slice(0, n);
}

module.exports = { aggregatePatterns, getTopPatterns, classifyEntry };
