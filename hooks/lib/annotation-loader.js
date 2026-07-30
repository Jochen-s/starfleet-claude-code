/**
 * Annotation Loader -- shared library for agent annotations.
 *
 * Loads per-library annotation files from ~/.claude/annotations/{lib}.md
 * with Klingon-mandated security hardening:
 *   - Path traversal guard (alphanumeric + hyphens/underscores only, no dots)
 *   - Symlink rejection (lstatSync check)
 *   - Injection filter (reject prompt injection patterns)
 *   - Size cap (4KB, 80 lines)
 *   - Rate limit (max 5 annotation injections per session)
 *
 * Pure filesystem, <5ms, always returns safely.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ANNOTATIONS_DIR = path.join(os.homedir(), '.claude', 'annotations');
const MAX_LINES = 80;
const MAX_BYTES = 4096;
const MAX_INJECTIONS_PER_SESSION = 5;
const RATE_LIMIT_FILE = path.join(os.homedir(), '.claude', 'cache', 'annotation-rate.json');

// Klingon security: prompt injection detection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /forget\s+(all\s+)?your\s+(instructions|rules|guidelines)/i,
  /system\s*:\s*/i,
  /\bact\s+as\b/i,
  /\bnew\s+instructions?\b/i,
  /\boverride\b.*\b(rules?|instructions?|guidelines?)\b/i,
  /\bdisregard\b/i,
  /\bdo\s+not\s+follow\b/i,
  /\bpretend\b.*\byou\s+are\b/i,
  /<\/?system>/i,
  /\[\s*INST\s*\]/i,
  /<<\s*SYS\s*>>/i,
];

/**
 * Sanitize library name to safe filesystem characters.
 * Returns null if the name is unsafe.
 */
function sanitizeLibName(name) {
  if (!name || typeof name !== 'string') return null;
  // Strip leading slash and org prefix: /org/project -> project
  const stripped = name.replace(/^\/[^/]+\//, '').replace(/^\//, '');
  // Only allow alphanumeric, hyphens, underscores (no dots -- prevents traversal)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(stripped)) return null;
  return stripped.toLowerCase();
}

/**
 * Validate annotation content against injection patterns.
 * Returns true if content is safe, false if injection detected.
 */
function validateAnnotationContent(content) {
  if (!content || typeof content !== 'string') return false;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) return false;
  }
  return true;
}

/**
 * Check rate limit: max N annotation injections per session.
 * Returns true if under limit.
 */
function checkRateLimit(sessionId) {
  // Fallback to process PID if no session_id provided (prevents unmetered bypass)
  sessionId = sessionId || `pid-${process.pid}`;
  try {
    const raw = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
    if (raw.length > 8192) return false; // corrupted
    const data = JSON.parse(raw);
    const count = (data[sessionId] && data[sessionId].count) || 0;
    return count < MAX_INJECTIONS_PER_SESSION;
  } catch {
    return true; // no file = no rate limit hit
  }
}

/**
 * Increment rate limit counter for this session.
 */
function incrementRateLimit(sessionId) {
  sessionId = sessionId || `pid-${process.pid}`;
  try {
    let data = {};
    try {
      const raw = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
      if (raw.length < 8192) data = JSON.parse(raw);
    } catch { /* fresh file */ }
    // Prune old sessions (keep last 5)
    const keys = Object.keys(data);
    if (keys.length > 5) {
      const sorted = keys.sort((a, b) => (data[a].ts || 0) - (data[b].ts || 0));
      for (let i = 0; i < sorted.length - 5; i++) delete data[sorted[i]];
    }
    data[sessionId] = {
      count: ((data[sessionId] && data[sessionId].count) || 0) + 1,
      ts: Date.now(),
    };
    const tmpFile = RATE_LIMIT_FILE + '.tmp';
    fs.mkdirSync(path.dirname(RATE_LIMIT_FILE), { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, RATE_LIMIT_FILE);
  } catch { /* best effort */ }
}

/**
 * Load annotation for a library.
 * Returns { content, libName } or null if no annotation exists or security check fails.
 */
function loadAnnotation(rawLibName) {
  const libName = sanitizeLibName(rawLibName);
  if (!libName) return null;

  const filePath = path.join(ANNOTATIONS_DIR, libName + '.md');
  // Resolve and verify path stays within annotations dir (backstop)
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ANNOTATIONS_DIR) + path.sep)) return null;
  try {
    // Symlink guard: reject symlinks to prevent reading arbitrary files
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink()) return null;
    if (lstat.size > MAX_BYTES) return null; // size cap
    const content = fs.readFileSync(filePath, 'utf8');
    // Injection check on entire content
    if (!validateAnnotationContent(content)) return null;
    // Line cap
    const lines = content.split('\n').slice(0, MAX_LINES).join('\n');
    return { content: lines, libName };
  } catch {
    return null; // file not found or read error
  }
}

module.exports = {
  sanitizeLibName,
  validateAnnotationContent,
  loadAnnotation,
  checkRateLimit,
  incrementRateLimit,
  ANNOTATIONS_DIR,
  INJECTION_PATTERNS,
};
