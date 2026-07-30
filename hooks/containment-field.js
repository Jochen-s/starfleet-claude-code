#!/usr/bin/env node
/**
 * containment-field.js -- PreToolUse hook
 * Advisory warning when edits target files outside the containment scope.
 * Zero overhead when inactive (no config file = immediate exit).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude', 'cache', 'containment-field.json'
);

const STALE_HOURS = 24;
const WATCHED_TOOLS = new Set(['Edit', 'Write']);

function main() {
  // Fast path: no config = no overhead
  let config;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!config || !config.active || !Array.isArray(config.paths) || config.paths.length === 0) {
    process.exit(0);
  }

  // Project scope check: skip if cwd doesn't match the project where field was set
  if (config.cwd) {
    const currentCwd = process.cwd().replace(/\\/g, '/');
    const configCwd = config.cwd.replace(/\\/g, '/');
    if (!currentCwd.startsWith(configCwd)) {
      process.exit(0);
    }
  }

  // Stale check
  if (config.created) {
    const age = Date.now() - new Date(config.created).getTime();
    if (age > STALE_HOURS * 60 * 60 * 1000) {
      process.exit(0);
    }
  }

  // Read stdin for tool info
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const toolName = data.tool_name || '';
      const toolInput = data.tool_input || {};

      // Only check Edit and Write tools
      if (!WATCHED_TOOLS.has(toolName)) {
        // For Bash, we could parse commands but that's fragile; skip for now
        process.exit(0);
      }

      const targetPath = toolInput.file_path || toolInput.path || '';
      if (!targetPath) {
        process.exit(0);
      }

      // Normalize path for matching
      const normalizedTarget = targetPath.replace(/\\/g, '/');

      // Check if target matches any scope glob
      const inScope = config.paths.some(pattern => {
        return globMatch(normalizedTarget, pattern);
      });

      if (inScope) {
        process.exit(0);
      }

      // Out of scope: emit advisory warning
      const scopeList = config.paths.join(', ');
      const result = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `CONTAINMENT FIELD WARNING: Edit targets "${path.basename(targetPath)}" which is outside the current scope (${scopeList}). This is advisory only; proceed if intentional.`
        }
      };
      process.stdout.write(JSON.stringify(result));
    } catch {
      // Malformed input: pass through silently
    }
    process.exit(0);
  });
}

/**
 * Simple glob matching supporting ** and * patterns.
 * Not a full glob implementation but covers common skill use cases.
 */
function globMatch(filePath, pattern) {
  // Normalize both
  const fp = filePath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');

  // Negation patterns not supported (semantics are ambiguous with Array.some).
  // Patterns starting with ! are skipped.
  if (pat.startsWith('!')) {
    return false;
  }

  // Convert glob to regex
  let regex = pat
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*')
    .replace(/\?/g, '[^/]');

  // Anchor pattern: if no path separator, match basename only
  if (!pat.includes('/')) {
    regex = '(^|/)' + regex + '$';
  } else {
    regex = '(^|/)' + regex + '(/.*)?$';
  }

  try {
    return new RegExp(regex).test(fp);
  } catch {
    return false;
  }
}

main();
