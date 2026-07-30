#!/usr/bin/env node
/**
 * Loop Detector - PostToolUse hook
 * Detects when Claude is stuck in repeated patterns and suggests /codex debug.
 *
 * Signals:
 * 1. Same file edited 3+ times in sliding window of 10
 * 2. Same bash command failing 3+ times
 * 3. Same error pattern appearing 3+ times
 * 4. Consecutive identical tool calls (same tool + normalized input) - assimilated from ai-orchestrator
 *
 * Rate limited: max 1 alert per 3 minutes, max 3 per session.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.claude', 'cache');
const STATE_FILE = path.join(CACHE_DIR, 'loop-detector-state.json');

const WINDOW_SIZE = 10;
const REPEAT_THRESHOLD = 3;
const RATE_LIMIT_MS = 3 * 60 * 1000; // 3 minutes
const MAX_ALERTS_PER_SESSION = 3;

/**
 * Normalize a bash command for comparison (strip volatile parts)
 */
function normalizeCommand(cmd) {
  if (!cmd) return '';
  return cmd
    .replace(/\d{10,}/g, 'TIMESTAMP')    // epoch timestamps
    .replace(/\/tmp\/[^\s]+/g, '/tmp/X')  // temp file paths
    .replace(/\s+/g, ' ')                 // normalize whitespace
    .trim();
}

/**
 * Extract a short error signature from tool output
 */
function extractErrorSignature(result) {
  if (!result) return null;
  const str = typeof result === 'string' ? result : JSON.stringify(result);

  // Look for common error patterns
  const patterns = [
    /error[:\s]+(.{20,80})/i,
    /failed[:\s]+(.{20,80})/i,
    /exception[:\s]+(.{20,80})/i,
    /ENOENT[:\s]+(.{20,80})/i,
    /exit code (\d+)/i,
    /cannot find (.{10,60})/i,
  ];

  for (const pat of patterns) {
    const m = str.match(pat);
    if (m) return m[0].substring(0, 80);
  }

  // Check for non-zero exit code indication
  if (str.includes('exit code') || str.includes('Exit code')) {
    return str.substring(0, 80);
  }

  return null;
}

/**
 * Determine if a bash result indicates failure
 */
function isBashFailure(data) {
  if (data.tool_result && typeof data.tool_result === 'object') {
    if (data.tool_result.is_error === true) return true;
    if (data.tool_result.exitCode && data.tool_result.exitCode !== 0) return true;
  }
  const str = typeof data.tool_result === 'string' ? data.tool_result : JSON.stringify(data.tool_result || '');
  if (str.includes('exit code 1') || str.includes('Exit code: 1')) return true;
  if (str.includes('FAILED') || str.includes('Error:')) return true;
  return false;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    window: [],
    lastAlertTime: 0,
    alertCount: 0,
    sessionId: null
  };
}

function saveState(state) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

/**
 * Normalize tool input for identity comparison.
 * Strips volatile fields (timestamps, session IDs) to detect semantically identical calls.
 */
function normalizeToolInput(toolName, toolInput) {
  if (!toolInput) return '';
  const clone = { ...toolInput };
  // Strip volatile fields that change between identical-intent calls
  delete clone.timeout;
  delete clone.description;
  // For Bash, normalize the command
  if (toolName === 'Bash' && clone.command) {
    clone.command = normalizeCommand(clone.command);
  }
  // For Read/Grep/Glob, the path + pattern are the identity
  // For Agent, the prompt is too long to hash; use description + subagent_type
  if (toolName === 'Agent') {
    return `${clone.subagent_type || 'general'}:${(clone.description || '').substring(0, 80)}`;
  }
  return JSON.stringify(clone);
}

function detectLoop(window) {
  // Signal 1: Same file edited 3+ times
  const fileEdits = {};
  for (const entry of window) {
    if ((entry.tool === 'Edit' || entry.tool === 'Write') && entry.file) {
      fileEdits[entry.file] = (fileEdits[entry.file] || 0) + 1;
    }
  }
  for (const [file, count] of Object.entries(fileEdits)) {
    if (count >= REPEAT_THRESHOLD) {
      return {
        type: 'repeated-edit',
        context: `File "${path.basename(file)}" edited ${count} times in last ${WINDOW_SIZE} operations`
      };
    }
  }

  // Signal 2: Same bash command failing 3+ times
  const cmdFails = {};
  for (const entry of window) {
    if (entry.tool === 'Bash' && entry.failed && entry.normalizedCmd) {
      cmdFails[entry.normalizedCmd] = (cmdFails[entry.normalizedCmd] || 0) + 1;
    }
  }
  for (const [cmd, count] of Object.entries(cmdFails)) {
    if (count >= REPEAT_THRESHOLD) {
      const shortCmd = cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
      return {
        type: 'repeated-fail',
        context: `Command "${shortCmd}" failed ${count} times`
      };
    }
  }

  // Signal 3: Same error pattern 3+ times
  const errorSigs = {};
  for (const entry of window) {
    if (entry.errorSig) {
      errorSigs[entry.errorSig] = (errorSigs[entry.errorSig] || 0) + 1;
    }
  }
  for (const [sig, count] of Object.entries(errorSigs)) {
    if (count >= REPEAT_THRESHOLD) {
      return {
        type: 'repeated-error',
        context: `Error pattern "${sig}" appeared ${count} times`
      };
    }
  }

  // Signal 4: Consecutive identical tool calls (same tool + same normalized input)
  // Catches: reading same file repeatedly, spawning same subagent, running same passing command
  // Assimilated from Community-Tech-UK/ai-orchestrator doom-loop detector pattern (2026-03-28)
  if (window.length >= REPEAT_THRESHOLD) {
    let consecutive = 1;
    for (let i = window.length - 1; i > 0; i--) {
      if (window[i].toolSig && window[i].toolSig === window[i - 1].toolSig) {
        consecutive++;
      } else {
        break;
      }
    }
    if (consecutive >= REPEAT_THRESHOLD) {
      const last = window[window.length - 1];
      const shortSig = last.toolSig.length > 60 ? last.toolSig.substring(0, 57) + '...' : last.toolSig;
      return {
        type: 'identical-calls',
        context: `${last.tool}(${shortSig}) called ${consecutive} times consecutively`
      };
    }
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const toolName = data.tool_name;
      const toolInput = data.tool_input || {};
      const sessionId = data.session_id;

      if (!toolName) return;

      const state = loadState();

      // Reset on new session
      if (sessionId && state.sessionId !== sessionId) {
        state.sessionId = sessionId;
        state.window = [];
        state.lastAlertTime = 0;
        state.alertCount = 0;
      }

      // Build window entry
      const entry = { tool: toolName, time: Date.now() };

      if (toolName === 'Edit' || toolName === 'Write') {
        entry.file = toolInput.file_path || toolInput.filePath || null;
      }

      if (toolName === 'Bash') {
        entry.normalizedCmd = normalizeCommand(toolInput.command);
        entry.failed = isBashFailure(data);
      }

      // Signal 4: tool identity signature for consecutive-call detection
      // Truncate to 120 chars to prevent file content leaking into state cache (fleet X-001)
      const rawSig = normalizeToolInput(toolName, toolInput);
      entry.toolSig = rawSig.length > 120 ? rawSig.substring(0, 120) : rawSig;

      // Extract error signature from any tool result
      const errorSig = extractErrorSignature(data.tool_result);
      if (errorSig) {
        entry.errorSig = errorSig;
      }

      // Add to sliding window
      state.window.push(entry);
      if (state.window.length > WINDOW_SIZE) {
        state.window = state.window.slice(-WINDOW_SIZE);
      }

      // Check for loop
      const loop = detectLoop(state.window);
      const now = Date.now();

      if (loop && (now - state.lastAlertTime > RATE_LIMIT_MS) && state.alertCount < MAX_ALERTS_PER_SESSION) {
        state.lastAlertTime = now;
        state.alertCount++;

        saveState(state);

        const advice = loop.type === 'identical-calls'
          ? 'RECOMMENDED: Stop and reassess approach. Try /kln:rethink or /codex debug.'
          : 'RECOMMENDED: Use /codex debug to get a cross-model perspective.';

        console.log('');
        console.log('\x1b[33m\u2501\u2501\u2501\u2501 LOOP DETECTED \u2501\u2501\u2501\u2501\x1b[0m');
        console.log('\x1b[33mPattern: ' + loop.type + '\x1b[0m');
        console.log('\x1b[33mContext: ' + loop.context + '\x1b[0m');
        console.log('\x1b[36m' + advice + '\x1b[0m');
        console.log('\x1b[33m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1b[0m');
        console.log('');
      } else {
        saveState(state);
      }
    } catch (e) {
      // Silent fail - don't break the tool use
    }
  });
}

main();
