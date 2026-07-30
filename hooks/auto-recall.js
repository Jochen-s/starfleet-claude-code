#!/usr/bin/env node
/**
 * Auto-Recall Hook — UserPromptSubmit
 *
 * Automatically queries K-LEAN knowledge DB with the user's message
 * and injects relevant entries as additionalContext. This solves the
 * "Claude doesn't use memory" problem by making memory come to the
 * agent rather than requiring explicit /kln:find invocation.
 *
 * Design: Pure Node.js, no Python subprocess. Keyword-based scoring
 * with TF-IDF-like weighting. Stays under 50ms after warm cache.
 *
 * Sources: Hindsight auto-recall pattern, Mnemory per-turn injection.
 * Assimilation sprint 2026-04-04.
 *
 * Budget: <50ms warm, <200ms cold (first load). Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Gating
let _gate;
try { _gate = require('./lib/hook-gate'); } catch { _gate = null; }
if (_gate && !_gate.shouldFire('auto-recall')) process.exit(0);

// Circuit breaker
let _cb;
try { _cb = require('./lib/circuit-breaker'); } catch { _cb = null; }

const HOME = os.homedir();
const DEDUP_PATH = path.join(HOME, '.claude', 'cache', 'auto-recall-dedup.json');
const MAX_RESULTS = 3;
const MAX_INJECT_CHARS = 1500;
const MIN_SCORE = 0.15;
const MIN_QUERY_WORDS = 3;
const DEDUP_TTL_MS = 15 * 60 * 1000; // 15 min session dedup

// SKILL0-inspired internalization (arxiv:2604.02268)
// Entries retrieved 10+ times without correction are considered "internalized"
// and deprioritized (score penalty) to save tokens and reduce noise.
const INTERNALIZATION_THRESHOLD = 10;
const INTERNALIZATION_PENALTY = 0.8; // multiply score by 0.2 (80% reduction)
const HITS_PATH = path.join(HOME, '.claude', 'cache', 'auto-recall-hits.jsonl');

// Entries cache
let _entriesCache = null;
let _entriesMtime = 0;
let _idfCache = null;

/**
 * Find the K-LEAN entries.jsonl for the current project.
 * Walks up from cwd looking for .knowledge-db/entries.jsonl
 */
function findEntriesPath(cwd) {
  let current = (cwd || '').replace(/\\/g, '/');
  let depth = 0;
  while (current && current.length > 3 && depth < 8) {
    const candidate = path.join(current, '.knowledge-db', 'entries.jsonl');
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return candidate;
    } catch { /* continue */ }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    depth++;
  }
  return null;
}

/**
 * Load entries from JSONL, cached by mtime.
 */
function loadEntries(entriesPath) {
  try {
    const stat = fs.statSync(entriesPath);
    if (_entriesCache && stat.mtimeMs === _entriesMtime) {
      return _entriesCache;
    }

    const raw = fs.readFileSync(entriesPath, 'utf8');
    const entries = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.id && (entry.insight || entry.title)) {
          entries.push(entry);
        }
      } catch { /* skip malformed */ }
    }

    _entriesCache = entries;
    _entriesMtime = stat.mtimeMs;
    _idfCache = null; // reset IDF on reload
    return entries;
  } catch {
    return [];
  }
}

/**
 * Build IDF weights for all keywords across the corpus.
 */
function getIdf(entries) {
  if (_idfCache) return _idfCache;
  const docFreq = {};
  const N = entries.length || 1;

  for (const entry of entries) {
    const seen = new Set();
    const words = tokenize((entry.title || '') + ' ' + (entry.insight || ''));
    for (const w of words) { seen.add(w); }
    for (const kw of (entry.keywords || [])) { seen.add(kw.toLowerCase()); }
    for (const w of seen) {
      docFreq[w] = (docFreq[w] || 0) + 1;
    }
  }

  const idf = {};
  for (const [word, df] of Object.entries(docFreq)) {
    idf[word] = Math.log(N / df);
  }
  _idfCache = idf;
  return idf;
}

/**
 * Tokenize text into lowercase words (3+ chars, no stop words).
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
  'were', 'been', 'have', 'has', 'had', 'will', 'can', 'not', 'but',
  'all', 'any', 'our', 'your', 'their', 'its', 'into', 'when', 'how',
  'what', 'which', 'who', 'use', 'using', 'used', 'make', 'let', 'also',
  'just', 'about', 'should', 'would', 'could', 'does', 'did', 'than',
  'then', 'each', 'other', 'some', 'more', 'very', 'most', 'like',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Score an entry against query words using keyword overlap + TF-IDF text match.
 */
function scoreEntry(entry, queryWords, querySet, idf) {
  let score = 0;

  // 1. Keyword intersection (weighted by IDF)
  const entryKeywords = new Set((entry.keywords || []).map(k => k.toLowerCase()));
  for (const qw of queryWords) {
    if (entryKeywords.has(qw)) {
      score += (idf[qw] || 1) * 2.0; // keyword match = 2x weight
    }
  }

  // 2. Title match
  const titleWords = tokenize(entry.title || '');
  for (const tw of titleWords) {
    if (querySet.has(tw)) {
      score += (idf[tw] || 1) * 1.5;
    }
  }

  // 3. Insight text match
  const insightWords = tokenize(entry.insight || '');
  for (const iw of insightWords) {
    if (querySet.has(iw)) {
      score += (idf[iw] || 1) * 0.5;
    }
  }

  // Normalize by query length to avoid bias toward long queries
  return queryWords.length > 0 ? score / queryWords.length : 0;
}

/**
 * Load and check session dedup state.
 */
function loadDedup(sessionId) {
  try {
    const raw = fs.readFileSync(DEDUP_PATH, 'utf8');
    if (raw.length > 32 * 1024) return new Set();
    const data = JSON.parse(raw);
    if (data.sessionId !== sessionId) return new Set();
    if (Date.now() - (data.timestamp || 0) > DEDUP_TTL_MS) return new Set();
    return new Set(data.injectedIds || []);
  } catch {
    return new Set();
  }
}

function saveDedup(sessionId, injectedIds) {
  try {
    const data = {
      sessionId,
      timestamp: Date.now(),
      injectedIds: [...injectedIds].slice(-50), // cap at 50
    };
    const tmp = DEDUP_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, DEDUP_PATH);
  } catch { /* best effort */ }
}

/**
 * Format entries for injection.
 */
function formatResults(entries) {
  const parts = ['[Auto-Recall: K-LEAN knowledge relevant to this task]'];
  let totalLen = parts[0].length;

  for (const entry of entries) {
    const line = `- [${entry.type || 'note'}] ${entry.title}: ${entry.insight}`;
    const trimmed = line.length > 300 ? line.slice(0, 297) + '...' : line;
    if (totalLen + trimmed.length > MAX_INJECT_CHARS) break;
    parts.push(trimmed);
    totalLen += trimmed.length;
  }

  return parts.join('\n');
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

  if (_cb && !_cb.shouldRun('auto-recall')) process.exit(0);

  try {
    const userMessage = hookData.user_message || hookData.message || '';
    const sessionId = hookData.session_id || '';
    const cwd = hookData.cwd || '';

    // Skip short messages (greetings, confirmations)
    const queryWords = tokenize(userMessage);
    if (queryWords.length < MIN_QUERY_WORDS) {
      if (_cb) _cb.recordSuccess('auto-recall');
      process.exit(0);
    }

    // Find and load entries
    const entriesPath = findEntriesPath(cwd);
    if (!entriesPath) {
      if (_cb) _cb.recordSuccess('auto-recall');
      process.exit(0);
    }

    const entries = loadEntries(entriesPath);
    if (entries.length === 0) {
      if (_cb) _cb.recordSuccess('auto-recall');
      process.exit(0);
    }

    // Load dedup state
    const injectedIds = loadDedup(sessionId);

    // Load retrieval hit counts for SKILL0 internalization
    const hitCounts = {};
    try {
      const hitsRaw = fs.readFileSync(HITS_PATH, 'utf8');
      for (const line of hitsRaw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const hit = JSON.parse(line);
          if (hit.id) hitCounts[hit.id] = (hitCounts[hit.id] || 0) + 1;
        } catch { /* skip */ }
      }
    } catch { /* no hits file yet */ }

    // Score all entries (with SKILL0 internalization + memory layer weighting)
    const querySet = new Set(queryWords);
    const idf = getIdf(entries);

    const scored = entries
      .filter(e => !injectedIds.has(e.id))
      .map(e => {
        let score = scoreEntry(e, queryWords, querySet, idf);
        // Two-layer scoring (T2.6, source: mnemory): consolidated > raw
        const layer = e.memory_layer || 'raw'; // backward-compatible default
        if (layer === 'consolidated') score *= 1.5;
        else score *= 0.8;
        // SKILL0 internalization: deprioritize frequently-retrieved entries
        const hits = hitCounts[e.id] || 0;
        if (hits >= INTERNALIZATION_THRESHOLD) {
          score *= (1 - INTERNALIZATION_PENALTY); // 80% reduction
        }
        return { entry: e, score, hits };
      })
      .filter(s => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    if (scored.length === 0) {
      if (_cb) _cb.recordSuccess('auto-recall');
      process.exit(0);
    }

    // Check injection budget
    const resultText = formatResults(scored.map(s => s.entry));

    // Blind spot matching (T1.3, source: claude-octopus)
    let blindSpotText = '';
    try {
      const { matchBlindSpots, formatBlindSpots } = require('./lib/blind-spot-matcher');
      const blindMatches = matchBlindSpots(queryWords);
      if (blindMatches.length > 0) {
        blindSpotText = formatBlindSpots(blindMatches, 500) || '';
      }
    } catch { /* blind spot matcher not available */ }

    // mem0/Qdrant entity recall (conditional: only when entity signals detected)
    let mem0Text = '';
    try {
      const { hasEntitySignals, queryMem0, formatMem0Results } = require('./lib/mem0-recall');
      if (hasEntitySignals(userMessage)) {
        const entityKeywords = queryWords.filter(w => w.length >= 4);
        const mem0Results = queryMem0(entityKeywords);
        mem0Text = formatMem0Results(mem0Results) || '';
      }
    } catch { /* mem0 recall not available */ }

    const sections = [resultText];
    if (mem0Text) sections.push(mem0Text);
    if (blindSpotText) sections.push(blindSpotText);
    const fullText = sections.join('\n\n');

    const estimatedTokens = Math.ceil(fullText.length / 4); // rough char-to-token

    if (_gate) {
      const budget = _gate.getInjectionBudget();
      if (budget < estimatedTokens) {
        if (_cb) _cb.recordSuccess('auto-recall');
        process.exit(0); // budget exhausted
      }
      _gate.consumeInjectionBudget(estimatedTokens);
    }

    // Update dedup
    for (const s of scored) {
      injectedIds.add(s.entry.id);
    }
    saveDedup(sessionId, injectedIds);

    // Log retrieval hits for K-LEAN retrieval_count feedback loop
    try {
      const hitsPath = path.join(HOME, '.claude', 'cache', 'auto-recall-hits.jsonl');
      const hitEntries = scored.map(s => JSON.stringify({
        id: s.entry.id,
        score: Math.round(s.score * 100) / 100,
        ts: Date.now(),
        session: sessionId,
      })).join('\n') + '\n';
      fs.appendFileSync(hitsPath, hitEntries, 'utf8');
    } catch { /* non-critical */ }

    // Output
    const output = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: fullText,
      },
    };

    process.stdout.write(JSON.stringify(output) + '\n');
    if (_cb) _cb.recordSuccess('auto-recall');
  } catch (e) {
    if (_cb) _cb.recordFailure('auto-recall');
  }
  process.exit(0);
}

main();
