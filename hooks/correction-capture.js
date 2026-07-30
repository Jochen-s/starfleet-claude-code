#!/usr/bin/env node
/**
 * Stop hook: Captures user corrections and preferences from the session transcript.
 * Also captures tool usage patterns, error-fix sequences, and style choices as observations.
 * Queues learnings for /reflect and observations for /counselors-log.
 *
 * Must complete in <200ms — uses sync I/O only, no network calls.
 * Always exits 0 — never blocks the stop.
 */

'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('correction-capture')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
const { redactSecrets } = require('./lib/redact-secrets');

const QUEUE_PATH = path.join(
  os.homedir(),
  '.claude', 'cache', 'learnings-queue.json'
);

const OBSERVATIONS_PATH = path.join(
  os.homedir(),
  '.claude', 'cache', 'observations-queue.json'
);

const FRICTION_PATH = path.join(
  os.homedir(),
  '.claude', 'cache', 'friction-log.json'
);

const MAX_QUEUE_SIZE = 100;
const MAX_FRICTION_SIZE = 50;

// Markers that indicate system/compaction content (not real user messages)
// Frozen to prevent accidental mutation during maintenance
const SYSTEM_MARKERS = Object.freeze([
  '<system-reminder>',
  '<task-notification>',
  '<teammate-message',    // no closing > because tag has attributes
  'Summary:',
  'compaction',
  'context was compressed',
  'conversation that ran out of context',
  'The summary below covers',
  'SessionStart:compact',
  'Base directory for this skill',
  'Knowledge curator',       // K-LEAN curator prompts
  '/kln:',                   // K-LEAN command invocations
  'kln status',              // K-LEAN status checks
  'Assimilation Report',     // Borg reports injected as context
  'Pending patterns:',       // SessionStart hook output
]);

// Secret redaction — shared lib (DRY: fleet-command unanimous finding)

// Patterns that indicate a correction or preference
const CORRECTION_PATTERNS = [
  /\bno[,.]?\s+(use|do|try|put|write|make|call|set)\b/i,
  /\bactually[,.]?\s+(use|do|try|put|write|make|call|set|change|remove|delete|let'?s|I\s+want|we\s+should|that'?s|it'?s)\b/i,
  /\bthat'?s?\s+wrong\b/i,
  /\bI\s+meant\b/i,
  /\bnot\s+(like\s+that|that\s+way|that\s+one)\b/i,
  /\bdon'?t\s+(do|use|write|call|put)\b/i,
  /\binstead\s+(of|use)\b/i,
  /\bwrong[,.]?\s/i,
  /\bcorrect(ion)?\b.*\bshould\b/i,
  /\bshould\s+(be|use|have)\b.*\bnot\b/i,
  /\buse\s+\w+\s+not\s+\w+\b/i,
  /\bnever\s+(use|do|call|write)\b/i,
  /\balways\s+(use|do|call|write)\b/i,
];

const POSITIVE_PATTERNS = [
  /^\s*(yes[,!.]?|yep[,!.]?|perfect[,!.]?|exactly[,!.]?)\s*$/i,
  /\bthat'?s?\s+(right|correct|perfect|exactly\s+it|what\s+I\s+wanted)\b/i,
  /\bgood[,!.]?\s*(job|work|call)?\s*$/i,
  /\bnice[,!.]?\s*$/i,
];

const PREFERENCE_PATTERNS = [
  /\bI\s+prefer\b/i,
  /\bI\s+(always|usually|typically)\s+(use|do|write|call)\b/i,
  /\bwe\s+always\b/i,
  /\bin\s+this\s+project\s+(we|I)\b/i,
  /\bour\s+(convention|style|pattern|standard)\b/i,
];

const WISH_PATTERNS = [
  /\bI\s+wish\s+(it|claude|this|we)\s+(could|would|can)\b/i,
  /\bit\s+would\s+be\s+nice\s+if\b/i,
  /\bwhy\s+can'?t\s+(it|claude|this|we)\b/i,
  /\bif\s+only\s+(it|claude|this|we)\s+(could|would)\b/i,
  /\bI\s+need\s+(it|claude|this)\s+to\b/i,
];

// Tool name patterns to look for in assistant messages (word boundary to avoid substring matches)
const TOOL_PATTERNS = [
  { name: 'Read', re: /\bRead\b/ },
  { name: 'Write', re: /\bWrite\b/ },
  { name: 'Edit', re: /\bEdit\b/ },
  { name: 'Grep', re: /\bGrep\b/ },
  { name: 'Glob', re: /\bGlob\b/ },
  { name: 'Bash', re: /\bBash\b/ },
  { name: 'TodoWrite', re: /\bTodoWrite\b/ },
  { name: 'TodoRead', re: /\bTodoRead\b/ },
  { name: 'Task', re: /\bTask\b/ },
];

// Error indicators in assistant messages
const ERROR_KEYWORDS = [
  /\berror\b/i,
  /\bfailed?\b/i,
  /\bcannot\b/i,
  /\bcould not\b/i,
  /\bexception\b/i,
  /\bstack trace\b/i,
  /\bnot found\b/i,
  /\bundefined\b.*\bproperty\b/i,
];

// Success indicators in assistant messages (after an error)
const SUCCESS_KEYWORDS = [
  /\bfixed\b/i,
  /\bresolved\b/i,
  /\bworking\b/i,
  /\bsuccess(fully)?\b/i,
  /\bnow works?\b/i,
  /\bpassing\b/i,
  /\bcomplete[d]?\b/i,
];

// Style pattern indicators in assistant messages
// No /g flag — only .test() is used, /g causes lastIndex state bugs
const STYLE_PATTERNS = [
  { re: /\bconst\b.*\b=\b.*\b=>\b/, label: 'arrow-function' },
  { re: /\bfunction\s+\w+\s*\(/, label: 'named-function' },
  { re: /^\s{2}[^\s]/m, label: '2-space-indent' },
  { re: /^\s{4}[^\s]/m, label: '4-space-indent' },
  { re: /'\w/, label: 'single-quotes' },
  { re: /"\w/, label: 'double-quotes' },
  { re: /\bcamelCase\b|\b[a-z][a-zA-Z0-9]+[A-Z]/, label: 'camelCase' },
  { re: /\bsnake_case\b|\b[a-z]+_[a-z]/, label: 'snake_case' },
];

/**
 * Detect the type of learning from a user message, if any.
 * Returns { type, pattern } or null.
 */
function detectLearning(message) {
  if (!message || typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (trimmed.length < 3) return null;

  // Check positive patterns FIRST — prevents "looks good. actually..." from
  // being classified as a correction when the message is predominantly positive
  for (const re of POSITIVE_PATTERNS) {
    const match = trimmed.match(re);
    if (match) return { type: 'positive', pattern: match[0] };
  }

  for (const re of CORRECTION_PATTERNS) {
    const match = trimmed.match(re);
    if (match) return { type: 'correction', pattern: match[0] };
  }

  for (const re of PREFERENCE_PATTERNS) {
    const match = trimmed.match(re);
    if (match) return { type: 'preference', pattern: match[0] };
  }

  for (const re of WISH_PATTERNS) {
    const match = trimmed.match(re);
    if (match) {
      // Extract the full sentence containing the wish phrase
      const sentences = trimmed.match(/[^.!?]*[.!?]?/g) || [];
      const sentence = sentences.find(s => re.test(s)) || match[0];
      return { type: 'wish', pattern: sentence.trim() };
    }
  }

  return null;
}

/**
 * Detect repeated tool usage sequences across 3+ consecutive assistant messages.
 * Looks for tool name keywords mentioned in message text.
 * Returns { type, sequence } or null.
 */
function detectToolPattern(messages) {
  // Collect tool mentions per assistant message
  const toolMentions = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    // Use fresh regex copies to avoid lastIndex state issues with /g flags
    const mentioned = TOOL_PATTERNS.filter(({ re }) =>
      new RegExp(re.source, re.flags).test(msg.text)
    );
    if (mentioned.length > 0) {
      toolMentions.push(mentioned[0].name); // Take first/dominant tool per message
    }
  }

  if (toolMentions.length < 3) return null;

  // Look for a repeating subsequence of length 2-3 within the list
  for (let seqLen = 2; seqLen <= 3; seqLen++) {
    for (let i = 0; i <= toolMentions.length - seqLen * 2; i++) {
      const candidate = toolMentions.slice(i, i + seqLen).join('->');
      let repeatCount = 0;
      for (let j = i; j <= toolMentions.length - seqLen; j += seqLen) {
        if (toolMentions.slice(j, j + seqLen).join('->') === candidate) {
          repeatCount++;
        } else {
          break;
        }
      }
      if (repeatCount >= 2) {
        return {
          type: 'tool-pattern',
          sequence: candidate,
          repeatCount,
          dedupKey: `tool-pattern:${candidate}`,
        };
      }
    }
  }

  // Also flag if the same single tool dominates (3+ consecutive uses)
  let runTool = toolMentions[0];
  let runLen = 1;
  for (let i = 1; i < toolMentions.length; i++) {
    if (toolMentions[i] === runTool) {
      runLen++;
      if (runLen >= 3) {
        return {
          type: 'tool-pattern',
          sequence: `${runTool}x${runLen}`,
          repeatCount: runLen,
          dedupKey: `tool-pattern:${runTool}x${runLen}`,
        };
      }
    } else {
      runTool = toolMentions[i];
      runLen = 1;
    }
  }

  return null;
}

/**
 * Detect an error followed by a successful fix across assistant messages.
 * Returns { type, error, fix } or null.
 */
function detectErrorFixPattern(messages) {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length < 2) return null;

  for (let i = 0; i < assistantMessages.length - 1; i++) {
    const msgText = assistantMessages[i].text;
    const hasError = ERROR_KEYWORDS.some(re => re.test(msgText));
    if (!hasError) continue;

    // Look for a success message in one of the next 3 assistant messages
    for (let j = i + 1; j < Math.min(i + 4, assistantMessages.length); j++) {
      const nextText = assistantMessages[j].text;
      const hasSuccess = SUCCESS_KEYWORDS.some(re => re.test(nextText));
      if (hasSuccess) {
        return {
          type: 'error-fix',
          error: redactSecrets(msgText.substring(0, 200)),
          fix: redactSecrets(nextText.substring(0, 200)),
        };
      }
    }
  }

  return null;
}

/**
 * Detect consistent style choices across assistant messages.
 * Returns { type, style, consistency } or null when a style appears in 3+ messages.
 */
function detectStyleChoice(messages) {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length < 3) return null;

  // Count style pattern hits across messages
  const styleCounts = {};
  for (const msg of assistantMessages) {
    const seen = new Set();
    for (const { re, label } of STYLE_PATTERNS) {
      if (re.test(msg.text) && !seen.has(label)) {
        seen.add(label);
        styleCounts[label] = (styleCounts[label] || 0) + 1;
      }
    }
  }

  // Find the style that appears most consistently (3+ messages)
  let bestLabel = null;
  let bestCount = 0;
  for (const [label, count] of Object.entries(styleCounts)) {
    if (count >= 3 && count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }

  if (!bestLabel) return null;

  return {
    type: 'style-choice',
    style: bestLabel,
    consistency: bestCount,
    outOf: assistantMessages.length,
    dedupKey: `style-choice:${bestLabel}`,
  };
}

/**
 * Check if message text is system/compaction content (not a real user message).
 * Returns true if the text should be skipped.
 */
function isSystemContent(text) {
  if (!text || typeof text !== 'string') return false;
  // Only check first 4KB — all markers appear near message start
  const sample = text.length > 4096 ? text.slice(0, 4096).toLowerCase() : text.toLowerCase();
  for (const marker of SYSTEM_MARKERS) {
    if (sample.includes(marker.toLowerCase())) return true;
  }
  return false;
}

/**
 * Extract plain text from a message content field.
 * Content can be a string or an array of blocks.
 */
function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join('\n');
  }
  return '';
}

/**
 * Read the last N message pairs from the transcript (JSONL).
 * Returns array of { role, text }.
 */
function readLastMessages(transcriptPath, maxMessages) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];

  const MAX_TAIL_BYTES = 256 * 1024; // Read at most last 256KB for speed
  const messages = [];
  try {
    const stat = fs.statSync(transcriptPath);
    const size = stat.size;
    const fd = fs.openSync(transcriptPath, 'r');
    const readSize = Math.min(size, MAX_TAIL_BYTES);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
    fs.closeSync(fd);

    let lines = buf.toString('utf8').split('\n').filter(l => l.trim());
    // Drop first line only if tail-read started mid-line (truncated JSON)
    if (size > MAX_TAIL_BYTES && lines.length > 0) {
      try {
        JSON.parse(lines[0]); // If first line parses, it's complete — keep it
      } catch {
        lines = lines.slice(1); // Truncated — drop it
      }
    }

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Support both { role, content } and { type, message: { content } } formats
        const role = entry.role || entry.type;

        // Skip system messages entirely — they're never user corrections
        if (role === 'system') continue;

        let text = '';
        if (entry.content) {
          text = extractText(entry.content);
        } else if (entry.message && entry.message.content) {
          text = extractText(entry.message.content);
        }

        // Skip messages containing compaction/system markers (false positive source)
        if (isSystemContent(text)) continue;

        if (role && text) {
          messages.push({ role, text });
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { return []; }

  return messages.slice(-maxMessages);
}

/**
 * Load the existing queue, or return empty array on missing/corrupt file.
 */
function loadQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { /* ENOENT or corrupt — start fresh */ }
  return [];
}

/**
 * Save queue back to disk, creating the cache dir if needed.
 * Uses temp+rename for crash-safe atomic write.
 */
function saveQueue(queue) {
  const dir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = QUEUE_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(queue, null, 2), 'utf8');
  fs.renameSync(tmpPath, QUEUE_PATH);
}

/**
 * Load the existing observations queue, or return empty array on missing/corrupt file.
 */
function loadObservations() {
  try {
    const parsed = JSON.parse(fs.readFileSync(OBSERVATIONS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { /* ENOENT or corrupt — start fresh */ }
  return [];
}

/**
 * Save observations queue back to disk, creating the cache dir if needed.
 * Uses temp+rename for crash-safe atomic write.
 */
function saveObservations(observations) {
  const dir = path.dirname(OBSERVATIONS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = OBSERVATIONS_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(observations, null, 2), 'utf8');
  fs.renameSync(tmpPath, OBSERVATIONS_PATH);
}

// ---------------------------------------------------------------------------
// Friction Detection (A-004 from assimilation assessment, source: GAAI)
// ---------------------------------------------------------------------------

/**
 * Load friction log, or return empty array.
 */
function loadFriction() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FRICTION_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Save friction log, creating cache dir if needed.
 * Uses temp+rename for crash-safe atomic write.
 */
function saveFriction(log) {
  const dir = path.dirname(FRICTION_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = FRICTION_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2), 'utf8');
  fs.renameSync(tmpPath, FRICTION_PATH);
}

/**
 * Detect friction signals from assistant messages.
 * Friction = what blocked, retried, or slowed execution.
 * Returns array of friction entries.
 */
function detectFriction(messages) {
  const frictionEntries = [];
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  if (assistantMsgs.length < 2) return frictionEntries;

  // 1. Consecutive failures: 3+ assistant messages containing error keywords
  let errorStreak = 0;
  let lastErrorContext = '';
  for (const msg of assistantMsgs) {
    const hasError = ERROR_KEYWORDS.some(re => re.test(msg.text));
    if (hasError) {
      errorStreak++;
      lastErrorContext = msg.text.substring(0, 200);
    } else {
      if (errorStreak >= 3) {
        frictionEntries.push({
          type: 'consecutive-failures',
          count: errorStreak,
          context: redactSecrets(lastErrorContext),
          dedupKey: `friction:consecutive-failures:${errorStreak}:${lastErrorContext.substring(0, 40).replace(/\W/g, '')}`,
        });
      }
      errorStreak = 0;
    }
  }
  // Check if streak extends to end of messages
  if (errorStreak >= 3) {
    frictionEntries.push({
      type: 'consecutive-failures',
      count: errorStreak,
      context: redactSecrets(lastErrorContext),
      dedupKey: `friction:consecutive-failures:${errorStreak}:${lastErrorContext.substring(0, 40).replace(/\W/g, '')}`,
    });
  }

  // 2. Tool oscillation: Read→Edit→Read→Edit pattern (ping-pong)
  const toolMentions = [];
  for (const msg of assistantMsgs) {
    const mentioned = TOOL_PATTERNS.filter(({ re }) =>
      new RegExp(re.source, re.flags).test(msg.text)
    );
    if (mentioned.length > 0) {
      toolMentions.push(mentioned[0].name);
    }
  }
  // Detect A→B→A→B oscillation (4+ length)
  if (toolMentions.length >= 4) {
    for (let i = 0; i <= toolMentions.length - 4; i++) {
      if (toolMentions[i] === toolMentions[i + 2] &&
          toolMentions[i + 1] === toolMentions[i + 3] &&
          toolMentions[i] !== toolMentions[i + 1]) {
        frictionEntries.push({
          type: 'tool-oscillation',
          pattern: `${toolMentions[i]}<->${toolMentions[i + 1]}`,
          dedupKey: `friction:oscillation:${toolMentions[i]}-${toolMentions[i + 1]}`,
        });
        break; // One oscillation per session is enough
      }
    }
  }

  // 3. Retry indicators in text
  const retryPatterns = [
    /\btry(?:ing)?\s+again\b/i,
    /\bretry(?:ing)?\b/i,
    /\blet me\s+(?:try|attempt)\s+(?:a\s+)?different\b/i,
    /\bthat didn'?t work\b/i,
    /\bstill\s+(?:not working|failing|broken)\b/i,
  ];
  for (const msg of assistantMsgs) {
    for (const re of retryPatterns) {
      if (re.test(msg.text)) {
        frictionEntries.push({
          type: 'retry-detected',
          context: redactSecrets(msg.text.substring(0, 200)),
          dedupKey: `friction:retry:${msg.text.substring(0, 50)}`,
        });
        break; // One retry per message
      }
    }
  }

  return frictionEntries;
}

/**
 * Main entry point — must complete in <200ms.
 */
function main() {
  // Read stdin: try fd 0 first (works on Windows), fall back to /dev/stdin (Unix)
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

  // Guard: never block a stop that's already handling a stop hook
  if (hookData.stop_hook_active) {
    process.exit(0);
  }

  // Circuit breaker — skip if this hook has failed too many times recently
  if (!shouldRun('correction-capture')) {
    process.exit(0);
  }

  const transcriptPath = hookData.transcript_path;
  if (!transcriptPath) {
    process.exit(0);
  }

  // Klingon #1: Validate transcript path stays within ~/.claude/projects/ boundary
  // Prevents path traversal via crafted hook payload
  const resolvedPath = path.resolve(transcriptPath);
  const allowedBase = path.join(os.homedir(), '.claude', 'projects');
  if (!resolvedPath.startsWith(allowedBase + path.sep) && resolvedPath !== allowedBase) {
    process.exit(0);
  }

  let messages;
  try {
    messages = readLastMessages(transcriptPath, 10);
  } catch (err) {
    recordFailure('correction-capture');
    process.exit(0);
  }
  if (messages.length < 2) {
    recordSuccess('correction-capture');
    process.exit(0);
  }

  const newEntries = [];
  const timestamp = new Date().toISOString();
  const sessionId = hookData.session_id || 'unknown';

  // Walk pairs: for each user message, check if it looks like a correction,
  // and capture the preceding assistant message as context.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const learning = detectLearning(msg.text);
    if (!learning) continue;

    // Find the most recent assistant message before this one as context
    let assistantContext = '';
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === 'assistant') {
        assistantContext = redactSecrets(messages[j].text.substring(0, 300));
        break;
      }
    }

    newEntries.push({
      timestamp,
      sessionId,
      type: learning.type,
      userMessage: redactSecrets(msg.text.substring(0, 500)),
      assistantContext,
      pattern: learning.pattern,
    });
  }

  if (newEntries.length > 0) {
    try {
      let queue = loadQueue();
      queue.push(...newEntries);
      // Cap queue size — trim oldest entries when exceeded
      if (queue.length > MAX_QUEUE_SIZE) {
        queue = queue.slice(-MAX_QUEUE_SIZE);
      }
      saveQueue(queue);
    } catch { /* never block stop on write failure */ }
  }

  // --- Observation detection ---
  // Run all three detectors on the full message set and queue any findings.
  const newObservations = [];

  const toolPattern = detectToolPattern(messages);
  if (toolPattern) {
    newObservations.push({
      timestamp,
      sessionId,
      ...toolPattern,
    });
  }

  const errorFix = detectErrorFixPattern(messages);
  if (errorFix) {
    newObservations.push({
      timestamp,
      sessionId,
      ...errorFix,
    });
  }

  const styleChoice = detectStyleChoice(messages);
  if (styleChoice) {
    newObservations.push({
      timestamp,
      sessionId,
      ...styleChoice,
    });
  }

  if (newObservations.length > 0) {
    try {
      let observations = loadObservations();
      // Deduplicate: skip if same dedupKey already in last 10 queue entries
      for (const obs of newObservations) {
        if (obs.dedupKey) {
          const tail = observations.slice(-10);
          const isDupe = tail.some(e => e.dedupKey === obs.dedupKey);
          if (isDupe) continue;
        }
        observations.push(obs);
      }
      // Cap queue size — trim oldest entries when exceeded
      if (observations.length > MAX_QUEUE_SIZE) {
        observations = observations.slice(-MAX_QUEUE_SIZE);
      }
      saveObservations(observations);
    } catch { /* never block stop on write failure */ }
  }

  // --- Friction detection (A-004 GAAI pattern) ---
  const frictionEntries = detectFriction(messages);
  if (frictionEntries.length > 0) {
    try {
      let frictionLog = loadFriction();
      for (const entry of frictionEntries) {
        // Deduplicate against last 10 entries
        if (entry.dedupKey) {
          const tail = frictionLog.slice(-10);
          if (tail.some(e => e.dedupKey === entry.dedupKey)) continue;
        }
        frictionLog.push({
          timestamp,
          sessionId,
          ...entry,
        });
      }
      if (frictionLog.length > MAX_FRICTION_SIZE) {
        frictionLog = frictionLog.slice(-MAX_FRICTION_SIZE);
      }
      saveFriction(frictionLog);
    } catch { /* never block stop on write failure */ }
  }

  recordSuccess('correction-capture');
  process.exit(0);
}

main();
