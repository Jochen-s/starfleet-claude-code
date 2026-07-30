#!/usr/bin/env node
/**
 * skill-usage-tracker.js -- PreToolUse hook (matcher: Skill)
 * Appends JSONL entry when a skill is invoked.
 * Data-driven optimization: which skills are used, how often, when.
 * Zero overhead for non-Skill tool calls (matcher handles filtering).
 */
'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('skill-usage-tracker')) process.exit(0);

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude', 'cache', 'skill-usage.jsonl'
);

// Cap log file at 1MB to prevent unbounded growth
const MAX_LOG_SIZE = 1024 * 1024;

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const toolInput = data.tool_input || {};
      const skillName = toolInput.skill || 'unknown';

      // Only log skill name + timestamp (no args to prevent secret leakage)
      const entry = {
        ts: new Date().toISOString(),
        skill: skillName
      };

      // Rotate by rename (fast ~5ms vs read-rewrite ~50ms)
      try {
        const stats = fs.statSync(LOG_PATH);
        if (stats.size > MAX_LOG_SIZE) {
          fs.renameSync(LOG_PATH, LOG_PATH + '.1');
        }
      } catch {
        // File doesn't exist yet, that's fine
      }

      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    } catch {
      // Silently fail -- never block the pipeline
    }
    process.exit(0);
  });
}

main();
