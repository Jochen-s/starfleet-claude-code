// notification-handler.js — Log notifications to action buffer
// Event: Notification | Exit: always 0 | Budget: <50ms
'use strict';
const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('notification-handler')) process.exit(0);
const fs = require('fs');
const path = require('path');
const os = require('os');

function main() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const data = JSON.parse(raw);

    // Append to recent-actions buffer
    const cacheDir = path.join(os.homedir(), '.claude', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const logPath = path.join(cacheDir, 'recent-actions.jsonl');

    const entry = {
      ts: new Date().toISOString(),
      type: 'notification',
      tool: 'Notification',
      summary: (data.message || data.title || 'unknown notification').slice(0, 200).replace(/[\r\n]/g, ' '),
      session: data.session_id || ''
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Silent fail — exit 0
  }

  const output = JSON.stringify({ result: 'continue' });
  process.stdout.write(output + '\n');
  process.exit(0);
}

main();
