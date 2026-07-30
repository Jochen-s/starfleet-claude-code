#!/usr/bin/env node
/**
 * R5: Skill Pre-Filtering Index Builder
 * SessionStart hook that builds a keyword index from SKILL.md descriptions
 * and injects top-10 skill recommendations into session context.
 *
 * Problem: 228 visible skills degrade LLM routing accuracy (vLLM: 94% at 49 -> 13.62% at 741).
 * Solution: Soft pre-filter via keyword matching against project context.
 *
 * Performance target: <500ms
 * Must complete: always exits 0 (advisory, never blocks session start)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
const INDEX_PATH = path.join(CACHE_DIR, 'skills-index.json');
const CACHE_TTL_MS = 3600000; // 1 hour
const TOP_N = 10;
const MIN_SCORE = 2; // Minimum keyword overlap to recommend (reduces noise)

// Reject patterns for description sanitization (subset of instinct-injector.js REJECT_PATTERNS)
const DESC_REJECT_PATTERNS = [
  /^(you are|you must|your role|act as|pretend|ignore previous|disregard|override)/im,
  /system\s*prompt/i,
  /<\/?system/i,
  /\beval\s*\(/i,
  /\bprocess\.env\b/i,
  /https?:\/\/\S{1,512}/i,
];

// English stop words (minimal set for keyword extraction)
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him',
  'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'use', 'using', 'used', 'trigger', 'user', 'says',
]);

/**
 * Extract keywords from text: lowercase, strip punctuation, remove stop words.
 * Returns deduplicated array preserving first-occurrence order.
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  const result = [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      result.push(w);
    }
  }
  return result;
}

/**
 * Read all SKILL.md descriptions from a skills directory.
 * Returns array of { name, description, keywords }.
 */
function readSkillDescriptions(skillsDir) {
  const skills = [];
  let dirs;
  try {
    dirs = fs.readdirSync(skillsDir);
  } catch {
    return skills;
  }
  for (const dir of dirs) {
    const skillMd = path.join(skillsDir, dir, 'SKILL.md');
    try {
      const stat = fs.statSync(skillMd);
      if (!stat.isFile()) continue;
      // Read only first 2KB (description is in frontmatter, near the top)
      const fd = fs.openSync(skillMd, 'r');
      const buf = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);
      const content = buf.toString('utf8', 0, bytesRead);
      const descMatch = content.match(/^description:\s*"?(.+?)"?\s*$/m);
      const desc = descMatch ? descMatch[1] : '';
      if (!desc) continue; // skip skills without descriptions
      // Security: reject descriptions with injection patterns
      let descRejected = false;
      for (const pattern of DESC_REJECT_PATTERNS) {
        if (pattern.test(desc)) { descRejected = true; break; }
      }
      if (descRejected) continue;
      // Include skill name tokens as keywords (e.g., "commitment-review" -> ["commitment", "review"])
      const nameKeywords = extractKeywords(dir.replace(/-/g, ' '));
      const descKeywords = extractKeywords(desc);
      const allKeywords = [...new Set([...nameKeywords, ...descKeywords])];
      skills.push({
        name: dir,
        description: desc,
        keywords: allKeywords,
      });
    } catch { /* skip unreadable */ }
  }
  return skills;
}

/**
 * Read project context signals: directory name, CLAUDE.md content, file extensions.
 * Returns keyword array.
 */
function readProjectContext(cwd) {
  if (!cwd || typeof cwd !== 'string') return [];
  const signals = [];
  // 1. Project directory name
  signals.push(path.basename(cwd));
  // 2. Project CLAUDE.md (first 2000 chars)
  try {
    const claudeMd = path.join(cwd, 'CLAUDE.md');
    const content = fs.readFileSync(claudeMd, 'utf8').slice(0, 2000);
    signals.push(content);
  } catch { /* no CLAUDE.md */ }
  // 3. File extensions + subdirectory names (single readdir call)
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true }).slice(0, 100);
    const exts = entries
      .filter(e => !e.isDirectory())
      .map(e => path.extname(e.name).replace('.', ''))
      .filter(Boolean);
    const subdirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .slice(0, 30);
    signals.push(exts.join(' '));
    signals.push(subdirs.join(' '));
  } catch { /* unreadable */ }
  return extractKeywords(signals.join(' '));
}

/**
 * Score a skill against project context keywords.
 * Returns count of keyword matches.
 */
function scoreSkill(skillKeywords, contextKeywords) {
  const contextSet = new Set(contextKeywords);
  let score = 0;
  for (const kw of skillKeywords) {
    if (contextSet.has(kw)) score++;
  }
  return score;
}

/**
 * Build full index from skills directory.
 */
function buildIndex(skillsDir) {
  return readSkillDescriptions(skillsDir || SKILLS_DIR);
}

/**
 * Get top-N skills ranked by relevance to context.
 * Only returns skills with score > 0.
 */
function getTopSkills(skills, contextKeywords, n) {
  n = n || TOP_N;
  const scored = skills.map(s => ({
    ...s,
    score: scoreSkill(s.keywords, contextKeywords),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score >= MIN_SCORE).slice(0, n);
}

/**
 * Load cached index if valid (< TTL, exists).
 * Returns skills array or null.
 */
function loadCache() {
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8');
    if (raw.length > 1024 * 1024) return null; // sanity cap: 1MB
    const cached = JSON.parse(raw);
    if (!cached.builtAt || Date.now() - cached.builtAt >= CACHE_TTL_MS) return null;
    // Invalidate if skill count changed (new skill added/removed)
    try {
      const currentDirCount = fs.readdirSync(SKILLS_DIR).length;
      if (cached.skillCount !== currentDirCount) return null;
    } catch { /* can't check, use TTL only */ }
    return cached.skills || null;
  } catch { /* rebuild */ }
  return null;
}

/**
 * Write index to cache file.
 */
function writeCache(skills) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data = {
      builtAt: Date.now(),
      skillCount: skills.length,
      skills: skills.map(s => ({
        name: s.name,
        description: s.description,
        keywords: s.keywords,
      })),
    };
    const tmp = INDEX_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, INDEX_PATH);
  } catch { /* cache write failure is non-critical */ }
}

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let hookData;
  try { hookData = JSON.parse(input); } catch { process.exit(0); }

  const cwd = hookData.cwd || process.cwd();

  // Build or load index
  let skills = loadCache();
  if (!skills) {
    skills = buildIndex(SKILLS_DIR);
    writeCache(skills);
  }

  // Match against project context
  const contextKeywords = readProjectContext(cwd);
  const top = getTopSkills(skills, contextKeywords);

  if (top.length === 0) {
    process.exit(0); // No recommendations = no injection
  }

  // Format injection
  const lines = [`Skill priority for this session (${top.length} matched project context). Invoke on demand, not automatically:`];
  for (const s of top) {
    lines.push(`  - ${s.name} [invoke: /${s.name}] (relevance:${s.score}): ${s.description.slice(0, 100)}`);
  }

  const output = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  });
  process.stdout.write(output + '\n');
  process.exit(0);
}

// Export for testing
module.exports = { extractKeywords, readSkillDescriptions, readProjectContext, scoreSkill, buildIndex, getTopSkills, loadCache, writeCache, STOP_WORDS, TOP_N, MIN_SCORE, DESC_REJECT_PATTERNS };

if (require.main === module) main();
