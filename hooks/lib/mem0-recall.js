/**
 * mem0/Qdrant Entity Recall Library
 *
 * Queries the local Qdrant instance (mem0_mcp_selfhosted collection)
 * for entity memories matching keywords from the user's message.
 * Uses sync HTTP via child_process to stay compatible with sync hooks.
 *
 * Source: Positronic Matrix Tier 2 re-activation. Assimilation sprint 2026-04-04.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION = 'mem0_mcp_selfhosted';
const CACHE_PATH = path.join(os.homedir(), '.claude', 'cache', 'mem0-recall-cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache per query
const MAX_RESULTS = 3;
const QUERY_TIMEOUT_MS = 3000;

// Entity-like patterns: generic technology keywords only.
//
// THIS FILE IS PUBLISHED. Do not add people, client, or private project names
// to this list. An audit on 2026-07-30 found six such names had been public
// here for four weeks. Private entity names belong only in the private estate
// copy of this file, which is never mirrored to a public remote.
// scripts/check-publish-safety.js enforces this.
const ENTITY_INDICATORS = /\b(VPS|MCP|Qdrant|Weaviate|mem0|K-LEAN|Ollama|Docker|WSL|MINGW|Obsidian|n8n|Coaching|SEO|WordPress|Elementor|Playwright|Codex|Anthropic)\b/i;

/**
 * Check if message likely contains entity references worth querying mem0 for.
 */
function hasEntitySignals(message) {
  return ENTITY_INDICATORS.test(message);
}

/**
 * Query Qdrant for mem0 entries matching keywords.
 * Returns array of { memory, created_at } or empty array.
 */
function queryMem0(keywords) {
  if (!keywords || keywords.length === 0) return [];

  // Check cache first
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    if (raw.length < 64 * 1024) {
      const cache = JSON.parse(raw);
      const cacheKey = keywords.slice(0, 5).sort().join(',');
      if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL_MS) {
        return cache[cacheKey].results;
      }
    }
  } catch { /* no cache */ }

  // Build Qdrant scroll query with keyword filter
  // Use the first 3 most distinctive keywords (longest ones)
  const searchTerms = keywords
    .filter(w => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  if (searchTerms.length === 0) return [];

  // Query Qdrant with "should" filter (OR logic) for broader matches
  const filter = {
    should: searchTerms.map(term => ({
      key: 'data',
      match: { text: term }
    }))
  };

  const body = JSON.stringify({
    limit: MAX_RESULTS * 2, // over-fetch for filtering
    with_payload: true,
    with_vector: false,
    filter
  });

  try {
    // Write query to temp file to avoid escaping issues with execFileSync
    const tmpQuery = path.join(os.tmpdir(), 'mem0-query-' + process.pid + '.js');
    const scriptContent = `
const http = require('http');
const body = ${body};
const data = JSON.stringify(body);
const req = http.request({
  hostname: 'localhost', port: 6333,
  path: '/collections/${COLLECTION}/points/scroll',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)},
  timeout: ${QUERY_TIMEOUT_MS}
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => process.stdout.write(b));
});
req.on('error', () => process.exit(0));
req.on('timeout', () => { req.destroy(); process.exit(0); });
req.write(data);
req.end();
`;
    fs.writeFileSync(tmpQuery, scriptContent, 'utf8');

    const result = execFileSync('node', [tmpQuery], {
      encoding: 'utf8',
      timeout: QUERY_TIMEOUT_MS + 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Cleanup temp file
    try { fs.unlinkSync(tmpQuery); } catch { /* best effort */ }

    if (!result) return [];

    const parsed = JSON.parse(result);
    const points = (parsed.result?.points || []);

    const results = points
      .map(p => ({
        memory: (p.payload?.data || p.payload?.memory || '').slice(0, 200),
        created_at: (p.payload?.created_at || '').slice(0, 10),
      }))
      .filter(r => r.memory.length > 10)
      .slice(0, MAX_RESULTS);

    // Cache results
    try {
      const cacheKey = keywords.slice(0, 5).sort().join(',');
      let cache = {};
      try {
        const raw = fs.readFileSync(CACHE_PATH, 'utf8');
        if (raw.length < 64 * 1024) cache = JSON.parse(raw);
      } catch { /* fresh cache */ }

      // Prune old entries (keep last 20)
      const entries = Object.entries(cache);
      if (entries.length > 20) {
        entries.sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        cache = Object.fromEntries(entries.slice(0, 15));
      }

      cache[cacheKey] = { ts: Date.now(), results };
      const tmp = CACHE_PATH + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
      fs.renameSync(tmp, CACHE_PATH);
    } catch { /* non-critical */ }

    return results;
  } catch {
    return [];
  }
}

/**
 * Format mem0 results for injection.
 */
function formatMem0Results(results) {
  if (results.length === 0) return null;
  const parts = ['[Entity Memory: mem0/Qdrant]'];
  for (const r of results) {
    parts.push(`- ${r.memory}`);
  }
  return parts.join('\n');
}

module.exports = { hasEntitySignals, queryMem0, formatMem0Results };
