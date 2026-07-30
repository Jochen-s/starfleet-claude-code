#!/usr/bin/env node
/**
 * PostToolUseFailure hook: Generates structured failure reflections.
 *
 * Implements the Reflexion pattern: when a pattern of repeated failures is
 * detected (3+ in the sliding window from loop-detector state), generates a
 * heuristic-based reflection entry and persists it to
 * ~/.claude/cache/failure-reflections.jsonl.
 *
 * Reflection schema:
 *   { timestamp, tool_name, error_signature, context, hypothesis, avoidance }
 *
 * Rate limits: max 1 reflection per 5 minutes, max 5 per session.
 * File rotation at 256KB.
 * Silent fail on all errors — must never block tool execution.
 * Always exits 0.
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('failure-reflection')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shouldRun, shouldRunProfile, recordSuccess, recordFailure } = require('./lib/circuit-breaker');

const HOME_DIR = os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.claude', 'cache');

// Loop-detector state — read-only; written by loop-detector.js
const LOOP_STATE_FILE = path.join(CACHE_DIR, 'loop-detector-state.json');

// Reflection output
const REFLECTIONS_FILE = path.join(CACHE_DIR, 'failure-reflections.jsonl');

// Per-session rate-limit state
const RATE_STATE_FILE = path.join(CACHE_DIR, 'failure-reflection-rate.json');

const RATE_LIMIT_MS = 5 * 60 * 1000;   // 1 reflection per 5 minutes
const MAX_PER_SESSION = 5;
const ROTATION_SIZE = 256 * 1024;       // 256KB

// Minimum failures in the loop-detector sliding window to trigger a reflection
const LOOP_REPEAT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch { return {}; }
}

function saveJson(filePath, obj) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWrite(filePath, JSON.stringify(obj));
  } catch { /* silent */ }
}

// ---------------------------------------------------------------------------
// Loop-detector state reader
// ---------------------------------------------------------------------------

/**
 * Returns true if the loop-detector's sliding window shows 3+ failures
 * of the same pattern (same tool failing repeatedly or same error signature).
 */
function hasRepeatedFailurePattern(sessionId, toolName) {
  try {
    const state = loadJson(LOOP_STATE_FILE);

    // Bail if the state belongs to a different session
    if (state.sessionId && sessionId && state.sessionId !== sessionId) {
      return false;
    }

    const window = Array.isArray(state.window) ? state.window : [];
    if (window.length < LOOP_REPEAT_THRESHOLD) return false;

    // Count failures for this tool in the window
    let failCount = 0;
    for (const entry of window) {
      if (entry.tool === toolName && entry.failed) {
        failCount++;
      }
    }
    if (failCount >= LOOP_REPEAT_THRESHOLD) return true;

    // Count same error signature occurrences
    const errorSigs = {};
    for (const entry of window) {
      if (entry.errorSig) {
        errorSigs[entry.errorSig] = (errorSigs[entry.errorSig] || 0) + 1;
      }
    }
    for (const count of Object.values(errorSigs)) {
      if (count >= LOOP_REPEAT_THRESHOLD) return true;
    }

    return false;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

/**
 * Check rate limit and increment counter.
 * Returns true if allowed to emit a reflection.
 */
function checkAndIncrementRate(sessionId) {
  try {
    const state = loadJson(RATE_STATE_FILE);
    const now = Date.now();

    // Reset on new session
    if (!state.sessionId || state.sessionId !== sessionId) {
      const next = { sessionId, count: 1, lastTime: now };
      saveJson(RATE_STATE_FILE, next);
      return true;
    }

    // Max per session exceeded
    if ((state.count || 0) >= MAX_PER_SESSION) return false;

    // Time-based rate limit
    if (now - (state.lastTime || 0) < RATE_LIMIT_MS) return false;

    state.count = (state.count || 0) + 1;
    state.lastTime = now;
    saveJson(RATE_STATE_FILE, state);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Heuristic reflection generator
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Named Failure Taxonomy (source: NL Harness paper, arxiv:2603.25723)
// Classifies failures into types that drive recovery routing.
// Assimilation sprint 2026-04-04.
// ---------------------------------------------------------------------------

const FAILURE_TYPES = {
  MISSING_ARTIFACT: 'missing-artifact',   // File/resource doesn't exist
  WRONG_PATH:       'wrong-path',         // Path error (exists elsewhere)
  PERMISSION:       'permission-blocked', // Access denied
  VERIFIER_FAILURE: 'verifier-failure',   // Test/validation/lint failed
  TOOL_ERROR:       'tool-error',         // Tool itself malfunctioned
  TIMEOUT:          'timeout',            // Operation timed out
  ENCODING:         'encoding-error',     // Character encoding mismatch
  GENERIC:          'generic',            // Uncategorized
};

const RECOVERY_ROUTES = {
  'missing-artifact': 'Use Glob to search for the file. Check if renamed/moved. Verify cwd.',
  'wrong-path': 'Check path separators (use /). Try absolute path. Verify cwd matches expected project.',
  'permission-blocked': 'Check file permissions. Verify protect-secrets hook isn\'t blocking. Use main agent for privileged ops.',
  'verifier-failure': 'Read the full error output. Check test assertions. Review the specific change that broke it.',
  'tool-error': 'Try alternative tool or approach. Check tool input format. Verify tool availability.',
  'timeout': 'Reduce operation scope. Check network/MCP connectivity. Increase timeout if appropriate.',
  'encoding-error': 'Add encoding="utf-8" to file opens. Check for BOM markers. Use --encoding flag.',
  'generic': 'Review error output carefully. Check inputs and prerequisites.',
};

/**
 * Classify a failure into a named type based on tool name and error signature.
 * Returns { type, recovery }
 */
function classifyFailureType(toolName, errorSignature) {
  const err = (errorSignature || '').toLowerCase();

  // Timeout (any tool)
  if (err.includes('timeout') || err.includes('etimedout') || err.includes('timed out') || err.includes('esockettimedout')) {
    return { type: FAILURE_TYPES.TIMEOUT, recovery: RECOVERY_ROUTES['timeout'] };
  }

  // Encoding (any tool)
  if (err.includes('charmap') || err.includes('encoding') || err.includes('decode') || err.includes('utf') || err.includes('cp1252')) {
    return { type: FAILURE_TYPES.ENCODING, recovery: RECOVERY_ROUTES['encoding-error'] };
  }

  // Permission (any tool)
  if (err.includes('permission') || err.includes('eacces') || err.includes('denied') || err.includes('blocked') || err.includes('not allowed')) {
    return { type: FAILURE_TYPES.PERMISSION, recovery: RECOVERY_ROUTES['permission-blocked'] };
  }

  // Wrong path (BEFORE missing-artifact: "not found in file" is content mismatch, not missing file)
  if (err.includes('old_string') || err.includes('not found in file') || err.includes('no match') || err.includes('not unique')) {
    return { type: FAILURE_TYPES.WRONG_PATH, recovery: RECOVERY_ROUTES['wrong-path'] };
  }

  // Tool error (BEFORE missing-artifact: "command not found" is a tool issue)
  if (err.includes('syntax error') || err.includes('unexpected token') || err.includes('command not found') ||
      err.includes('not recognized') || err.includes('regex')) {
    return { type: FAILURE_TYPES.TOOL_ERROR, recovery: RECOVERY_ROUTES['tool-error'] };
  }

  // Missing artifact (after wrong-path and tool-error to avoid false positives)
  if (err.includes('enoent') || err.includes('no such file') || err.includes('does not exist') ||
      (err.includes('not found') && !err.includes('command'))) {
    return { type: FAILURE_TYPES.MISSING_ARTIFACT, recovery: RECOVERY_ROUTES['missing-artifact'] };
  }

  // Verifier failure (test, lint, type check)
  if (err.includes('test') || err.includes('assert') || err.includes('expect') || err.includes('lint') ||
      err.includes('tsc') || err.includes('type error') || err.includes('eslint') || err.includes('failed')) {
    // Only classify as verifier if it's a Bash command (running tests/linters)
    if (toolName === 'Bash') {
      return { type: FAILURE_TYPES.VERIFIER_FAILURE, recovery: RECOVERY_ROUTES['verifier-failure'] };
    }
  }

  return { type: FAILURE_TYPES.GENERIC, recovery: RECOVERY_ROUTES['generic'] };
}

/**
 * Extract a short error signature (first 80 chars) from tool_result.
 */
function extractErrorSignature(toolResult) {
  if (!toolResult) return 'unknown error';
  const str = typeof toolResult === 'string'
    ? toolResult
    : JSON.stringify(toolResult);
  return str.slice(0, 80).replace(/\s+/g, ' ').trim() || 'unknown error';
}

/**
 * Extract a context hint from tool_input (what was being attempted).
 */
function extractContext(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return `${toolName} call`;

  switch (toolName) {
    case 'Edit':
    case 'Write':
      return toolInput.file_path
        ? `Editing ${path.basename(String(toolInput.file_path))}`
        : `${toolName} operation`;

    case 'Read':
      return toolInput.file_path
        ? `Reading ${path.basename(String(toolInput.file_path))}`
        : 'Read operation';

    case 'Bash':
      if (toolInput.command) {
        const cmd = String(toolInput.command).slice(0, 60).replace(/\s+/g, ' ').trim();
        return `Running: ${cmd}`;
      }
      return 'Bash command';

    case 'Grep':
      return toolInput.pattern
        ? `Grep for "${String(toolInput.pattern).slice(0, 40)}"`
        : 'Grep search';

    case 'Glob':
      return toolInput.pattern
        ? `Glob pattern "${String(toolInput.pattern).slice(0, 40)}"`
        : 'Glob search';

    case 'Agent':
      return toolInput.description
        ? `Agent: ${String(toolInput.description).slice(0, 60)}`
        : 'Agent invocation';

    default:
      return `${toolName} operation`;
  }
}

/**
 * Generate hypothesis and avoidance strings heuristically.
 * No LLM call — must complete in <5ms.
 */
function generateReflection(toolName, errorSignature) {
  const errLower = errorSignature.toLowerCase();

  switch (toolName) {
    case 'Edit':
    case 'Write': {
      // Distinguish path-not-found from other issues
      if (errLower.includes('enoent') || errLower.includes('no such file') || errLower.includes('not found')) {
        return {
          hypothesis: 'File path does not exist; parent directory may be missing.',
          avoidance: 'Read the file first to confirm it exists. For Write, ensure parent directory exists.',
        };
      }
      if (errLower.includes('permission') || errLower.includes('eacces')) {
        return {
          hypothesis: 'Insufficient write permissions on the target path.',
          avoidance: 'Check file permissions. Avoid writing to system-owned or read-only paths.',
        };
      }
      if (errLower.includes('old_string') || errLower.includes('not found in file') || errLower.includes('no match')) {
        return {
          hypothesis: 'Edit old_string did not match file content; file may have changed since last read.',
          avoidance: 'Read the file immediately before editing. Do not rely on stale in-context content.',
        };
      }
      return {
        hypothesis: 'File may not exist or path is wrong.',
        avoidance: 'Read the file first to confirm path and content before modifying.',
      };
    }

    case 'Bash': {
      if (errLower.includes('command not found') || errLower.includes('not recognized')) {
        return {
          hypothesis: 'Command binary is not installed or not on PATH.',
          avoidance: 'Check command exists with `which` or `command -v`. Use absolute path if needed.',
        };
      }
      if (errLower.includes('permission denied') || errLower.includes('eacces')) {
        return {
          hypothesis: 'Script or file lacks execute permission.',
          avoidance: 'Run `chmod +x` on the target script, or use `bash script.sh` syntax.',
        };
      }
      if (errLower.includes('syntax error') || errLower.includes('unexpected token')) {
        return {
          hypothesis: 'Shell syntax error in the command.',
          avoidance: 'Validate command syntax. Check for unmatched quotes, misplaced operators, or Windows line endings.',
        };
      }
      // Extract exit code if visible
      const exitMatch = errorSignature.match(/exit code[:\s]+(\d+)/i);
      const exitCode = exitMatch ? exitMatch[1] : null;
      return {
        hypothesis: exitCode
          ? `Command exited with code ${exitCode}. Check command output for the specific error.`
          : 'Command failed. Check syntax, permissions, or missing prerequisites.',
        avoidance: 'Review the error output, verify command syntax, and check execution environment.',
      };
    }

    case 'Read': {
      if (errLower.includes('enoent') || errLower.includes('no such file') || errLower.includes('not found')) {
        return {
          hypothesis: 'File does not exist at the specified path.',
          avoidance: 'Use Glob to verify the file exists before reading. Check path separators (forward slashes).',
        };
      }
      if (errLower.includes('permission') || errLower.includes('eacces')) {
        return {
          hypothesis: 'File exists but is not readable (permission denied).',
          avoidance: 'Verify file permissions. Avoid reading system or protected files.',
        };
      }
      return {
        hypothesis: 'File not found or permission denied.',
        avoidance: 'Verify path exists using Glob before reading. Check for typos in the file path.',
      };
    }

    case 'Grep': {
      if (errLower.includes('invalid') || errLower.includes('regex') || errLower.includes('syntax')) {
        return {
          hypothesis: 'Regex pattern contains unescaped special characters.',
          avoidance: 'Escape regex metacharacters (., *, +, {, }, (, ), [, ]) or use a simpler literal pattern.',
        };
      }
      return {
        hypothesis: 'Pattern may have regex special characters or the search path does not exist.',
        avoidance: 'Escape special chars in pattern or try a simpler literal search. Verify path exists.',
      };
    }

    case 'Glob': {
      return {
        hypothesis: 'Glob pattern may be malformed or search path does not exist.',
        avoidance: 'Verify the base directory exists. Use ** for recursive matching. Check for typos.',
      };
    }

    case 'Agent': {
      if (errLower.includes('permission') || errLower.includes('not allowed')) {
        return {
          hypothesis: 'Subagent hit a permission boundary (subagent-tool-guard).',
          avoidance: 'Verify the subagent type has permission for the required tools. sonnet-worker cannot run Bash.',
        };
      }
      if (errLower.includes('context') || errLower.includes('token') || errLower.includes('limit')) {
        return {
          hypothesis: 'Subagent exceeded context window or token limit.',
          avoidance: 'Reduce subagent scope. Pass only essential context. Break into smaller sub-tasks.',
        };
      }
      return {
        hypothesis: 'Subagent may have exceeded context or hit a permission boundary.',
        avoidance: 'Check subagent type permissions. Reduce prompt size. Verify disjoint file sets.',
      };
    }

    default:
      return {
        hypothesis: 'Tool call failed. Check inputs and prerequisites.',
        avoidance: 'Review tool input parameters. Verify all required fields are present and correct.',
      };
  }
}

// ---------------------------------------------------------------------------
// File rotation
// ---------------------------------------------------------------------------

function rotateIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > ROTATION_SIZE) {
      // Read all lines, keep the most recent half
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const keep = lines.slice(Math.floor(lines.length / 2));
      atomicWrite(filePath, keep.join('\n') + '\n');
    }
  } catch { /* file may not exist yet — that's fine */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  if (!shouldRun('failure-reflection') || !shouldRunProfile('failure-reflection')) {
    process.exit(0);
  }

  try {
    const sessionId = hookData.session_id || 'unknown';
    const toolName = hookData.tool_name || 'unknown';
    const toolInput = hookData.tool_input || {};
    const toolResult = hookData.tool_result || hookData.error || '';

    // Only generate reflections when a repeated failure pattern is detected
    if (!hasRepeatedFailurePattern(sessionId, toolName)) {
      recordSuccess('failure-reflection');
      process.exit(0);
    }

    // Rate limiting
    if (!checkAndIncrementRate(sessionId)) {
      recordSuccess('failure-reflection');
      process.exit(0);
    }

    // Build the reflection
    const errorSignature = extractErrorSignature(toolResult);
    const context = extractContext(toolName, toolInput);
    const { hypothesis, avoidance } = generateReflection(toolName, errorSignature);
    const { type: failureType, recovery } = classifyFailureType(toolName, errorSignature);

    const reflection = {
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      failure_type: failureType,
      error_signature: errorSignature.slice(0, 80),
      context,
      hypothesis,
      avoidance,
      recovery_route: recovery,
    };

    // Rotate before appending
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    rotateIfNeeded(REFLECTIONS_FILE);

    // Append as newline-delimited JSON
    fs.appendFileSync(REFLECTIONS_FILE, JSON.stringify(reflection) + '\n', 'utf8');

    recordSuccess('failure-reflection');
  } catch {
    recordFailure('failure-reflection');
  }

  process.exit(0);
}

main();
