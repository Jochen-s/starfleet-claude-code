// config-change-handler.js — Warn about stale hook registration on config change
// Event: ConfigChange | Exit: always 0 | Budget: <50ms
'use strict';
const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('config-change-handler')) process.exit(0);
const fs = require('fs');
const path = require('path');

function main() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const data = JSON.parse(raw);

    const changedFile = data.file || data.path || '';

    // Only warn for settings.json changes (hook registration)
    if (path.basename(changedFile) === 'settings.json') {
      const output = JSON.stringify({
        result: 'continue',
        reason: 'Config changed: settings.json was modified. Hook registration is read at session start — restart your session to pick up new hook config.',
        hookSpecificOutput: {
          additionalContext: 'WARNING: settings.json changed mid-session. New hooks or hook modifications will NOT take effect until you restart this session.'
        }
      });
      process.stdout.write(output + '\n');
      process.exit(0);
    }
  } catch {
    // Silent fail
  }

  const output = JSON.stringify({ result: 'continue' });
  process.stdout.write(output + '\n');
  process.exit(0);
}

main();
