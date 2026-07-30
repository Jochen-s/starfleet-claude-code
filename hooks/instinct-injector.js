#!/usr/bin/env node
/**
 * SubagentStart hook: Injects instinct files into spawned subagents.
 *
 * Instincts are confidence-scored behavioral patterns stored in:
 *   - {project}/.claude/instincts/*.md  (project-specific)
 *   - ~/.claude/instincts/*.md          (global)
 *
 * Must complete in <50ms — sync filesystem only, no network.
 * Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const GLOBAL_INSTINCTS_DIR = path.join(os.homedir(), '.claude', 'instincts');
const MAX_FILE_SIZE = 4 * 1024; // 4KB per instinct file
const MAX_TOTAL_SIZE = 16 * 1024; // 16KB total injection cap
const MAX_FILE_COUNT = 20; // Cap instinct files per directory
const MAX_CONTENT_LINES = 30; // Instincts should be brief behavioral rules

// Patterns that indicate instruction injection rather than behavioral rules
const REJECT_PATTERNS = [
  /^(you are|you must|your role|act as|pretend|ignore previous|disregard|override)/im,
  /system\s*prompt/i,
  /<\/?system/i,
  /\bexec\s*\(/i,
  /\brequire\s*\(/i,
  /\beval\s*\(/i,
  /\bprocess\.env\b/i,
];

/**
 * Normalize Unicode for pattern matching:
 * 1. NFKD decomposition (compatibility decomposition)
 * 2. Strip zero-width and invisible characters
 * 3. Transliterate common Cyrillic/Greek homoglyphs to ASCII for pattern matching
 */
function sanitizeUnicode(text) {
  // NFKD decomposition for compatibility characters
  let normalized = text.normalize('NFKD');
  // Strip zero-width chars: ZWSP, ZWNJ, ZWJ, BOM, zero-width no-break space, soft hyphen
  normalized = normalized.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '');
  // Transliterate common Cyrillic/Greek lookalikes to ASCII
  const HOMOGLYPHS = {
    '\u0410': 'A', '\u0430': 'a', // Cyrillic A/a
    '\u0412': 'B', '\u0432': 'v', // Cyrillic B/v
    '\u0421': 'C', '\u0441': 'c', // Cyrillic C/c
    '\u0415': 'E', '\u0435': 'e', // Cyrillic E/e
    '\u041D': 'H', '\u043D': 'h', // Cyrillic H/h
    '\u041A': 'K', '\u043A': 'k', // Cyrillic K/k
    '\u041C': 'M', '\u043C': 'm', // Cyrillic M/m
    '\u041E': 'O', '\u043E': 'o', // Cyrillic O/o
    '\u0420': 'P', '\u0440': 'p', // Cyrillic P/p
    '\u0422': 'T', '\u0442': 't', // Cyrillic T/t
    '\u0425': 'X', '\u0445': 'x', // Cyrillic X/x
    '\u0443': 'y',                 // Cyrillic y
    '\u0455': 's',                 // Cyrillic s
    '\u0456': 'i',                 // Cyrillic i
    '\u0458': 'j',                 // Cyrillic j
    '\u0501': 'd',                 // Cyrillic d
    '\u028F': 'Y',                 // Latin small capital Y
  };
  for (const [homoglyph, ascii] of Object.entries(HOMOGLYPHS)) {
    if (normalized.includes(homoglyph)) {
      normalized = normalized.split(homoglyph).join(ascii);
    }
  }
  return normalized;
}

/**
 * Validate instinct file content.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateInstinct(content, fileName) {
  // Normalize Unicode before all checks to prevent homoglyph/zero-width bypass
  const sanitized = sanitizeUnicode(content);

  // Must contain Confidence field (either YAML frontmatter or inline bold)
  const hasConfidence = /\*\*Confidence\*\*:\s*[\d.]+/.test(sanitized)
    || /^confidence:\s*[\d.]+/m.test(sanitized);
  if (!hasConfidence) {
    return { valid: false, reason: 'missing Confidence field' };
  }

  // Confidence must be 0.0-1.0
  const confMatch = sanitized.match(/(?:\*\*Confidence\*\*:|^confidence:)\s*([\d.]+)/m);
  if (confMatch) {
    const conf = parseFloat(confMatch[1]);
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return { valid: false, reason: `invalid confidence value: ${confMatch[1]}` };
    }
  }

  // Line count check
  const lines = sanitized.split('\n').length;
  if (lines > MAX_CONTENT_LINES) {
    return { valid: false, reason: `too long (${lines} lines, max ${MAX_CONTENT_LINES})` };
  }

  // Reject instruction-like patterns (checked against sanitized content)
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(sanitized)) {
      return { valid: false, reason: `rejected pattern: ${pattern.source.slice(0, 40)}` };
    }
  }

  return { valid: true, sanitized };
}

function readInstinctFiles(dir, rejections) {
  const results = [];
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .sort() // deterministic order
      .slice(0, MAX_FILE_COUNT); // cap file count
    for (const f of files) {
      try {
        const filePath = path.join(dir, f);
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
          rejections.push(`${f}: symlinks not allowed`);
          continue;
        }
        if (stat.size > MAX_FILE_SIZE) {
          rejections.push(`${f}: exceeds ${MAX_FILE_SIZE}B size limit`);
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) continue;

        const validation = validateInstinct(content, f);
        if (!validation.valid) {
          rejections.push(`${f}: ${validation.reason}`);
          continue;
        }

        // Use sanitized content for injection (prevents Unicode bypass of validation)
        results.push({ name: f.replace(/\.md$/, ''), content: validation.sanitized });
      } catch { /* skip unreadable files */ }
    }
  } catch { /* dir doesn't exist — normal */ }
  return results;
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

  // CRISIS mode suppression — conserve tokens during crisis state
  try {
    const metaPath = path.join(os.homedir(), '.claude', 'cache', 'metabolic-state.json');
    const metaRaw = fs.readFileSync(metaPath, 'utf8');
    if (metaRaw.length < 8 * 1024) {
      const meta = JSON.parse(metaRaw);
      if (meta.state === 'CRISIS') process.exit(0);
    }
  } catch { /* missing/corrupt — proceed normally */ }

  // Collect instincts from both project and global dirs
  const instincts = [];
  const rejections = [];

  // Project-specific instincts (higher priority)
  if (hookData.cwd && typeof hookData.cwd === 'string') {
    const resolved = path.resolve(hookData.cwd);
    if (!resolved.startsWith('\\\\') && !resolved.startsWith('//')) {
      const projectDir = path.join(resolved, '.claude', 'instincts');
      instincts.push(...readInstinctFiles(projectDir, rejections));
    }
  }

  // Global instincts
  instincts.push(...readInstinctFiles(GLOBAL_INSTINCTS_DIR, rejections));

  // Log rejections for debugging (append to cache file, 64KB cap)
  if (rejections.length > 0) {
    try {
      const logPath = path.join(os.homedir(), '.claude', 'cache', 'instinct-rejections.log');
      const entry = `[${new Date().toISOString()}] ${rejections.join('; ')}\n`;
      try {
        const stat = fs.statSync(logPath);
        if (stat.size > 64 * 1024) fs.writeFileSync(logPath, '');
      } catch { /* file doesn't exist yet — fine */ }
      fs.appendFileSync(logPath, entry);
    } catch { /* non-critical */ }
  }

  if (instincts.length === 0) {
    process.exit(0);
  }

  // Load effective confidence scores (computed by instinct-decay.js)
  let effectiveScores = {};
  try {
    const scoresPath = path.join(os.homedir(), '.claude', 'cache', 'instinct-effective-scores.json');
    const raw = fs.readFileSync(scoresPath, 'utf8');
    if (raw.length < 64 * 1024) {
      const parsed = JSON.parse(raw);
      effectiveScores = parsed.instincts || {};
    }
  } catch { /* fallback to raw confidence */ }

  // Build injection text — sort by effective confidence descending (falls back to raw)
  instincts.sort((a, b) => {
    const effA = effectiveScores[a.name]?.effective;
    const effB = effectiveScores[b.name]?.effective;
    const rawA = parseFloat((a.content.match(/(?:\*\*Confidence\*\*:|^confidence:)\s*([\d.]+)/m) || [])[1] || '0');
    const rawB = parseFloat((b.content.match(/(?:\*\*Confidence\*\*:|^confidence:)\s*([\d.]+)/m) || [])[1] || '0');
    const confA = typeof effA === 'number' ? effA : rawA;
    const confB = typeof effB === 'number' ? effB : rawB;
    return confB - confA;
  });

  let injection = '## Active Instincts (confidence-scored behavioral patterns)\n\n';
  let totalSize = injection.length;

  for (const { name, content } of instincts) {
    const entry = `### ${name}\n${content}\n\n`;
    if (totalSize + entry.length > MAX_TOTAL_SIZE) break;
    injection += entry;
    totalSize += entry.length;
  }

  const output = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: injection.trim(),
    },
  });
  process.stdout.write(output + '\n');

  process.exit(0);
}

main();
