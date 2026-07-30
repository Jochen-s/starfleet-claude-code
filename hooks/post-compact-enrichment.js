#!/usr/bin/env node
/**
 * Post-Compact Enrichment Hook (SNARC dream-cycle pattern)
 *
 * After compaction, re-injects enriched context:
 * 1. Recent high-utility K-LEAN entries relevant to active work
 * 2. Active instinct summaries relevant to recent file patterns
 * 3. Session checkpoint recovery hints
 *
 * This bridges the gap between pre-compact capture (save context)
 * and post-compact injection (restore relevant context).
 *
 * Assimilated from SNARC PostCompact dream-cycle pattern (2026-03-28).
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('post-compact-enrichment')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const KB_PATH = path.join('C:', 'LocalAgent', '.knowledge-db', 'entries.jsonl');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const RECENT_ACTIONS = path.join(CACHE_DIR, 'recent-actions.jsonl');
const CHECKPOINT_FILE = path.join(CACHE_DIR, 'session-checkpoint.json');

const MAX_ENTRIES = 5;
const MAX_OUTPUT_CHARS = 2000;

function loadRecentFiles() {
  try {
    if (!fs.existsSync(RECENT_ACTIONS)) return [];
    const lines = fs.readFileSync(RECENT_ACTIONS, 'utf8').trim().split('\n');
    const files = new Set();
    for (const line of lines.slice(-20)) {
      try {
        const action = JSON.parse(line);
        if (action.file) files.add(action.file);
      } catch {}
    }
    return [...files];
  } catch {
    return [];
  }
}

function loadKBEntries() {
  try {
    if (!fs.existsSync(KB_PATH)) return [];
    const lines = fs.readFileSync(KB_PATH, 'utf8').trim().split('\n');
    return lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function scoreRelevance(entry, recentFiles) {
  let score = 0;

  // Utility score boost
  const utility = entry.utility_score || 0.5;
  score += utility * 3;

  // Priority boost
  const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
  score += (priorityMap[entry.priority] || 1);

  // File relevance: do any keywords match recent file paths?
  const keywords = entry.keywords || [];
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    for (const f of recentFiles) {
      if (f.toLowerCase().includes(kwLower)) {
        score += 2;
        break;
      }
    }
  }

  // Recency boost: entries from last 7 days get +1
  const ts = entry.timestamp || entry.last_validated;
  if (ts) {
    try {
      const age = Date.now() - new Date(ts).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) score += 1;
    } catch {}
  }

  // Type boost: warnings and solutions are most actionable post-compact
  if (entry.type === 'warning') score += 1.5;
  if (entry.type === 'solution') score += 1;

  return score;
}

function getCheckpointHints() {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (cp.schema_version !== 2) return null;
    const age = Date.now() - new Date(cp.timestamp).getTime();
    if (age > 30 * 60 * 1000) return null; // stale
    return {
      hull: cp.hullIntegrity || 'unknown',
      usedPct: cp.usedPct || 0
    };
  } catch {
    return null;
  }
}

function main() {
  let input = {};
  try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) input = JSON.parse(raw);
  } catch {}

  const recentFiles = loadRecentFiles();
  const entries = loadKBEntries();
  const checkpoint = getCheckpointHints();

  // Score and rank entries by relevance to recent work
  const scored = entries
    .map(e => ({ entry: e, score: scoreRelevance(e, recentFiles) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);

  // Build enrichment context
  const parts = [];

  if (scored.length > 0) {
    parts.push('[Post-Compact Enrichment] Relevant K-LEAN entries for current work:');
    for (const { entry, score } of scored) {
      const line = `- [${entry.type || 'finding'}] ${entry.title}: ${(entry.insight || '').slice(0, 150)}`;
      parts.push(line);
    }
  }

  if (checkpoint) {
    parts.push(`Hull: ${checkpoint.hull} (${checkpoint.usedPct}% used). Budget conservatively.`);
  }

  if (parts.length === 0) {
    // Nothing to inject
    process.exit(0);
  }

  const context = parts.join('\n').slice(0, MAX_OUTPUT_CHARS);

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostCompact',
      additionalContext: context
    }
  };

  process.stdout.write(JSON.stringify(output));
}

main();
