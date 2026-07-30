#!/usr/bin/env node
/**
 * PermissionRequest hook: Logs permission requests for analysis.
 *
 * Tracks which tools trigger permission prompts and how often.
 * Helps identify patterns that should be added to the static allow list.
 * Does NOT auto-allow anything — purely observational.
 *
 * Must complete in <50ms — sync filesystem only, no network.
 * Always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_PATH = path.join(
  os.homedir(),
  '.claude', 'cache', 'permission-requests.json'
);

const MAX_LOG_ENTRIES = 200;
const MAX_LOG_SIZE = 256 * 1024;

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

  const toolName = hookData.tool_name || 'unknown';
  const toolInput = hookData.tool_input || {};

  // Extract a safe summary of the tool input (no secrets)
  let inputSummary = '';
  if (toolName === 'Bash' && toolInput.command) {
    // First 100 chars of command, redacting anything after sensitive keywords
    const cmd = toolInput.command.substring(0, 100);
    inputSummary = cmd.replace(/(password|token|secret|key|auth)=\S+/gi, '$1=***');
  } else if (toolInput.file_path) {
    inputSummary = toolInput.file_path;
  } else if (toolInput.url) {
    inputSummary = toolInput.url.substring(0, 100);
  }

  const entry = {
    date: new Date().toISOString(),
    sessionId: hookData.session_id || 'unknown',
    tool: toolName,
    input: inputSummary,
  };

  try {
    let log = [];
    try {
      const raw = fs.readFileSync(LOG_PATH, 'utf8');
      if (raw.length <= MAX_LOG_SIZE) {
        log = JSON.parse(raw);
        if (!Array.isArray(log)) log = [];
      }
    } catch { /* file doesn't exist yet */ }

    log.push(entry);
    if (log.length > MAX_LOG_ENTRIES) {
      log = log.slice(-MAX_LOG_ENTRIES);
    }

    const dir = path.dirname(LOG_PATH);
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
  } catch { /* never block permission prompt */ }

  process.exit(0);
}

main();
