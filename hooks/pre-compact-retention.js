#!/usr/bin/env node
/**
 * Pre-Compact Retention Hook
 * Extracts critical context from session transcript before compaction.
 * Updates CLAUDE-activeContext.md to preserve task state.
 *
 * Extracts:
 * - Current task (from TaskCreate/TodoWrite tool calls)
 * - Recent decisions (text containing "decided", "chose", "approach")
 * - Unfinished work (text containing "TODO", "still need", "remaining")
 * - Key discoveries (text containing "found", "discovered", "learned")
 * - Files modified (from Write/Edit tool calls)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { execFileSync } = require('child_process');
const { shouldRun, recordSuccess, recordFailure } = require('./lib/circuit-breaker');
const { redactSecrets } = require('./lib/redact-secrets');

const HOOK_NAME = 'pre-compact-retention';
const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const ACTIVE_CONTEXT_FILE = path.join(CLAUDE_DIR, 'CLAUDE-activeContext.md');
const BUDGET_STATE_FILE = path.join(CLAUDE_DIR, 'cache', 'budget-state.json');
const SHED_CONTEXT_FILE = path.join(CLAUDE_DIR, 'cache', 'shed-context.json');
const CHECKPOINT_FILE = path.join(CLAUDE_DIR, 'cache', 'session-checkpoint.json');
const METABOLIC_FILE = path.join(CLAUDE_DIR, 'cache', 'metabolic-state.json');

// Secret redaction — shared lib (DRY: fleet-command unanimous finding)

/**
 * Read current hull integrity from session-checkpoint.json.
 * Returns { usedPct, hullIntegrity } or null.
 */
function readHullIntegrity() {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (checkpoint.schema_version !== 2) return null;
    // Only use if recent (< 15 min old) — checkpoint is written at threshold
    // crossings (rate-limited), not every tool use, so 5 min was too tight.
    const age = Date.now() - new Date(checkpoint.timestamp).getTime();
    if (age > 15 * 60 * 1000) return null;
    return {
      usedPct: checkpoint.usedPct || 0,
      hullIntegrity: checkpoint.hullIntegrity || 'Green'
    };
  } catch { return null; }
}

/**
 * Trim MEMORY.md based on shed level.
 * shedLevel 1 (Red): Keep topic index table + critical gotchas (target: <25 lines).
 * shedLevel 2 (Critical): Keep critical gotchas only (target: <15 lines).
 * Returns { original, trimmed, shedLevel, memoryPath } or null if no trimming needed.
 */
function trimMemoryMd(shedLevel, projectDir) {
  const cwd = projectDir || process.env.CLAUDE_PROJECT_DIR || process.env.CWD || process.cwd();
  const projectKey = cwd.replace(/\\/g, '/').replace(/[/:]/g, '-').replace(/^-+/, '');
  const memoryDir = path.join(CLAUDE_DIR, 'projects', projectKey, 'memory');
  const memoryPath = path.join(memoryDir, 'MEMORY.md');

  try {
    if (!fs.existsSync(memoryPath)) return null;
    const original = fs.readFileSync(memoryPath, 'utf8');
    // Don't re-trim if already shed at same or higher level
    const existingShed = original.match(/Shed Level (\d)/);
    if (existingShed && parseInt(existingShed[1]) >= shedLevel) return null;
    const lines = original.split('\n');

    if (shedLevel === 2) {
      const gotchasStart = lines.findIndex(l => /^## Critical Gotchas/i.test(l));
      if (gotchasStart === -1) return null;
      let gotchasEnd = lines.length;
      for (let i = gotchasStart + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i])) { gotchasEnd = i; break; }
      }
      const trimmed = [
        '# Claude Code Memory — Shed Level 2 (Critical)',
        '',
        '> Full memory shed to conserve context. Run `mcp__mem0__search_memories` for topic details.',
        '> Shed content: `~/.claude/cache/shed-context.json`',
        '',
        ...lines.slice(gotchasStart, gotchasEnd)
      ].join('\n');
      // Do NOT write here — caller writes after shed-context is saved (atomic ordering)
      return { original, trimmed, shedLevel, memoryPath };
    }

    if (shedLevel === 1) {
      const topicStart = lines.findIndex(l => /^## Topic Index/i.test(l));
      const gotchasStart = lines.findIndex(l => /^## Critical Gotchas/i.test(l));
      if (topicStart === -1 && gotchasStart === -1) return null;

      const parts = [
        '# Claude Code Memory — Shed Level 1 (Red)',
        '',
        '> Memory trimmed to essentials. Topic file details shed.',
        '> Shed content: `~/.claude/cache/shed-context.json`',
        '',
      ];

      if (topicStart !== -1) {
        let tableEnd = topicStart + 1;
        for (let i = topicStart + 1; i < lines.length; i++) {
          if (/^## /.test(lines[i])) { tableEnd = i; break; }
          tableEnd = i + 1;
        }
        parts.push(...lines.slice(topicStart, tableEnd));
      }

      if (gotchasStart !== -1) {
        let gotchasEnd = lines.length;
        for (let i = gotchasStart + 1; i < lines.length; i++) {
          if (/^## /.test(lines[i])) { gotchasEnd = i; break; }
        }
        parts.push(...lines.slice(gotchasStart, gotchasEnd));
      }

      const trimmed = parts.join('\n');
      // Do NOT write here — caller writes after shed-context is saved (atomic ordering)
      return { original, trimmed, shedLevel, memoryPath };
    }

    return null;
  } catch { return null; }
}

/**
 * Write shed context for post-compaction recovery.
 */
function writeShedContext(originalMemory, context, shedLevel) {
  try {
    const shedContext = {
      timestamp: new Date().toISOString(),
      shedLevel,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      originalMemory,
      sessionSummary: {
        currentTask: context.currentTask,
        decisions: context.decisions,
        discoveries: context.discoveries,
        unfinishedWork: context.unfinishedWork,
        modifiedFiles: context.modifiedFiles,
      },
    };
    const cacheDir = path.join(CLAUDE_DIR, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(SHED_CONTEXT_FILE, JSON.stringify(shedContext, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

/**
 * Write budget-state.json with shed level and timestamp.
 * Auto-expires: instruction-surface-measurer ignores if > 10 minutes old.
 */
function writeBudgetState(shedLevel) {
  try {
    const state = {
      shedLevel,
      timestamp: new Date().toISOString(),
      reason: shedLevel === 2 ? 'Critical hull integrity' : 'Red hull integrity',
    };
    const cacheDir = path.join(CLAUDE_DIR, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(BUDGET_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

/**
 * Find the current session transcript
 */
function findCurrentTranscript() {
  try {
    // Get session ID from environment
    const sessionId = process.env.CLAUDE_SESSION_ID;

    // Find all project directories
    const projectDirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
      const fullPath = path.join(PROJECTS_DIR, d);
      return fs.statSync(fullPath).isDirectory();
    });

    // Collect all transcript files across project dirs (single stat per entry)
    let allFiles = [];
    for (const d of projectDirs) {
      const dirPath = path.join(PROJECTS_DIR, d);
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const fp = path.join(dirPath, f);
          return { name: f, path: fp, mtime: fs.statSync(fp).mtimeMs };
        });
      allFiles.push(...files);
    }

    if (allFiles.length === 0) return null;

    // If session ID provided, only return exact match — never fall back
    if (sessionId) {
      const match = allFiles.find(f => f.name.includes(sessionId));
      return match ? match.path : null;
    }

    // Klingon #3: No session ID and no stdin transcript_path — refuse to guess.
    // Falling back to most-recent risks reading wrong session's data.
    // The caller should use hookData.transcript_path (from stdin) instead.
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Tail-read a file: read at most the last maxBytes bytes.
 * Returns string content (may start mid-line — caller should handle).
 */
function tailRead(filePath, maxBytes) {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const readSize = Math.min(size, maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

const MAX_TRANSCRIPT_BYTES = 512 * 1024; // 512KB tail-read for performance

/**
 * Extract context from transcript lines
 */
function extractContext(transcriptPath) {
  const context = {
    currentTask: null,
    decisions: [],
    unfinishedWork: [],
    discoveries: [],
    failureTraces: [],
    modifiedFiles: new Set(),
    timestamp: new Date().toISOString()
  };

  try {
    const content = tailRead(transcriptPath, MAX_TRANSCRIPT_BYTES);
    const lines = content.split('\n').filter(l => l.trim());

    // Process each JSON line
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Extract from assistant messages
        if (entry.role === 'assistant' && entry.content) {
          const text = typeof entry.content === 'string'
            ? entry.content
            : Array.isArray(entry.content)
              ? entry.content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n')
              : '';

          // Look for decisions
          if (/\b(decided|chose|approach|going with|opted for)\b/i.test(text)) {
            const sentences = text.match(/[^.!?]*\b(decided|chose|approach|going with|opted for)\b[^.!?]*[.!?]/gi);
            if (sentences) {
              context.decisions.push(...sentences.slice(0, 3)); // Keep top 3
            }
          }

          // Look for unfinished work
          if (/\b(TODO|still need|remaining|next step|haven't|not yet)\b/i.test(text)) {
            const sentences = text.match(/[^.!?]*\b(TODO|still need|remaining|next step|haven't|not yet)\b[^.!?]*[.!?]/gi);
            if (sentences) {
              context.unfinishedWork.push(...sentences.slice(0, 5)); // Keep top 5
            }
          }

          // Look for discoveries
          if (/\b(found|discovered|learned|realized|noticed|turns out)\b/i.test(text)) {
            const sentences = text.match(/[^.!?]*\b(found|discovered|learned|realized|noticed|turns out)\b[^.!?]*[.!?]/gi);
            if (sentences) {
              context.discoveries.push(...sentences.slice(0, 3)); // Keep top 3
            }
          }
        }

        // Extract failure traces for post-compaction learning (GAP-09)
        if (entry.role === 'tool' && entry.content) {
          const toolText = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
          if (/\b(error|exception|traceback|failed|cannot)\b/i.test(toolText)) {
            if (context.failureTraces.length < 3) {
              context.failureTraces.push(redactSecrets(toolText.slice(0, 400)));
            }
          }
        }

        // Extract from tool calls (tool_use blocks live inside entry.content array)
        if (entry.role === 'assistant' && Array.isArray(entry.content)) {
          for (const block of entry.content) {
            if (block.type === 'tool_use') {
              const toolName = block.name || '';
              const input = block.input || {};

              // Task/Todo creation
              if (toolName === 'TaskCreate' || toolName === 'TodoWrite') {
                if (input.subject) {
                  context.currentTask = input.subject;
                }
              }

              // File modifications
              if (toolName === 'Write' || toolName === 'Edit') {
                if (input.file_path) {
                  context.modifiedFiles.add(input.file_path);
                }
              }
            }
          }
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  } catch (e) {
    // Return empty context on error
  }

  // Convert Set to Array and dedupe arrays
  context.modifiedFiles = [...context.modifiedFiles];
  context.decisions = [...new Set(context.decisions)].slice(0, 5);
  context.unfinishedWork = [...new Set(context.unfinishedWork)].slice(0, 5);
  context.discoveries = [...new Set(context.discoveries)].slice(0, 5);
  context.failureTraces = (context.failureTraces || []).slice(0, 3);

  return context;
}

/**
 * Parse existing activeContext.md into structured sections
 */
function parseExistingContext(filePath) {
  const existing = {
    unfinishedWork: [],
    decisions: [],
    discoveries: [],
    sessionHistory: []
  };

  try {
    if (!fs.existsSync(filePath)) return existing;
    const content = fs.readFileSync(filePath, 'utf8');

    let currentSection = null;
    for (const line of content.split('\n')) {
      if (line.startsWith('## Unfinished Work')) currentSection = 'unfinishedWork';
      else if (line.startsWith('## Recent Decisions')) currentSection = 'decisions';
      else if (line.startsWith('## Key Discoveries')) currentSection = 'discoveries';
      else if (line.startsWith('## Session History')) currentSection = 'sessionHistory';
      else if (line.startsWith('## ')) currentSection = null;
      else if (currentSection && line.startsWith('- ')) {
        existing[currentSection].push(line.slice(2).trim());
      }
    }
  } catch (e) {
    // Return empty on error
  }

  return existing;
}

/**
 * Sanitize transcript text before embedding in markdown.
 * Prevents injected headings/frontmatter from altering document structure.
 */
function sanitizeForMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^#{1,6}\s/gm, '')      // Strip markdown headings
    .replace(/^---\s*$/gm, '—')      // Prevent frontmatter/hr injection
    .replace(/\r/g, '')               // Normalize line endings
    .trim();
}

/**
 * Deduplicate array items by normalized content
 */
function dedup(items, cap) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result.slice(0, cap);
}

/**
 * Update CLAUDE-activeContext.md with extracted context (merge, not overwrite)
 */
function updateActiveContext(context, taskSnapshot) {
  const date = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toISOString().split('T')[1].split('.')[0];

  // Read existing content and merge
  const prev = parseExistingContext(ACTIVE_CONTEXT_FILE);

  // Merge rules:
  // - Task/Files: Latest-wins (current session overwrites)
  // - Unfinished Work: Append-dedup, cap at 5
  // - Decisions/Discoveries: Append-dedup, cap at 5 each
  // - Session History: Append one-liner, cap at 5

  const mergedUnfinished = dedup([...context.unfinishedWork, ...prev.unfinishedWork], 5);
  const mergedDecisions = dedup([...context.decisions, ...prev.decisions], 5);
  const mergedDiscoveries = dedup([...context.discoveries, ...prev.discoveries], 5);

  // Add session history entry
  const historyEntry = `[${date} ${timeStr}] ${context.currentTask || 'Pre-compact save'} (${context.modifiedFiles.length} files)`;
  const mergedHistory = dedup([historyEntry, ...prev.sessionHistory], 5);

  let markdown = `# Active Context

Current session state and working memory. Auto-loaded by Claude Code.

---

## Current Focus

**Session**: ${date}
**Auto-saved**: Before compaction
`;

  if (context.currentTask) {
    markdown += `**Task**: ${context.currentTask}\n`;
  }

  if (mergedUnfinished.length > 0) {
    markdown += `\n## Unfinished Work\n\n`;
    for (const item of mergedUnfinished) {
      markdown += `- ${sanitizeForMarkdown(item)}\n`;
    }
  }

  if (mergedDecisions.length > 0) {
    markdown += `\n## Recent Decisions\n\n`;
    for (const item of mergedDecisions) {
      markdown += `- ${sanitizeForMarkdown(item)}\n`;
    }
  }

  if (mergedDiscoveries.length > 0) {
    markdown += `\n## Key Discoveries\n\n`;
    for (const item of mergedDiscoveries) {
      markdown += `- ${sanitizeForMarkdown(item)}\n`;
    }
  }

  if (context.modifiedFiles.length > 0) {
    markdown += `\n## Files Modified This Session\n\n`;
    for (const file of context.modifiedFiles.slice(0, 20)) {
      // Sanitize file path: strip backtick-breaking chars to prevent markdown injection
      const safePath = String(file).replace(/[`\n\r]/g, '');
      markdown += `- \`${safePath}\`\n`;
    }
  }

  if (context.failureTraces && context.failureTraces.length > 0) {
    markdown += `\n## Recent Failures (preserved for learning)\n\n`;
    for (const trace of context.failureTraces.slice(0, 3)) {
      markdown += `- ${sanitizeForMarkdown(trace.slice(0, 200))}\n`;
    }
  }

  if (mergedHistory.length > 0) {
    markdown += `\n## Session History\n\n`;
    for (const entry of mergedHistory) {
      markdown += `- ${entry}\n`;
    }
  }

  // Include task section if snapshot provided (single write, no double-write)
  if (taskSnapshot) {
    const tasksSection = formatTasksSection(taskSnapshot);
    if (tasksSection) {
      markdown += tasksSection;
    }
  }

  markdown += `\n---\n\n*Auto-saved: ${context.timestamp}*\n`;
  markdown += `\n> After compaction, run \`/resume\` to continue.\n`;

  fs.writeFileSync(ACTIVE_CONTEXT_FILE, markdown, 'utf8');
  return true;
}

/**
 * Scan ~/.claude/tasks/ for current task lists and serialize to cache
 */
function snapshotTasks() {
  const tasksDir = path.join(CLAUDE_DIR, 'tasks');
  const snapshotFile = path.join(CLAUDE_DIR, 'cache', 'task-snapshot.json');

  try {
    if (!fs.existsSync(tasksDir)) return null;

    const teamDirs = fs.readdirSync(tasksDir)
      .map(d => ({
        name: d,
        path: path.join(tasksDir, d),
        mtime: fs.statSync(path.join(tasksDir, d)).mtimeMs
      }))
      .filter(d => fs.statSync(d.path).isDirectory())
      .sort((a, b) => b.mtime - a.mtime);

    if (teamDirs.length === 0) return null;

    const mostRecent = teamDirs[0];
    const tasks = [];

    const taskFiles = fs.readdirSync(mostRecent.path)
      .filter(f => f.endsWith('.json'));

    for (const file of taskFiles) {
      try {
        const taskData = JSON.parse(fs.readFileSync(path.join(mostRecent.path, file), 'utf8'));
        tasks.push(taskData);
      } catch (e) {}
    }

    if (tasks.length === 0) return null;

    const snapshot = {
      timestamp: new Date().toISOString(),
      team: mostRecent.name,
      tasks: tasks
    };

    const cacheDir = path.join(CLAUDE_DIR, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2), 'utf8');

    return snapshot;
  } catch (e) {
    return null;
  }
}

/**
 * Extract error→fix patterns from transcript
 */
function extractErrorPatterns(transcriptPath) {
  const patternsFile = path.join(CLAUDE_DIR, 'cache', 'error-patterns.json');
  const patterns = [];

  try {
    const content = tailRead(transcriptPath, MAX_TRANSCRIPT_BYTES);
    const lines = content.split('\n').filter(l => l.trim());

    let prevError = null;
    let prevErrorFile = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Detect tool result errors
        if (entry.role === 'tool' && entry.content) {
          const text = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
          if (/\b(error|exception|traceback|failed|cannot|undefined)\b/i.test(text)) {
            prevError = text.slice(0, 300); // Capture up to 300 chars of error
            prevErrorFile = null;
          }
        }

        // Detect subsequent successful fix (Write/Edit after an error)
        // Check both top-level tool_use AND content[] blocks (transcript schema varies)
        if (prevError && entry.role === 'assistant' && Array.isArray(entry.content)) {
          for (const block of entry.content) {
            if (block.type === 'tool_use') {
              const toolName = block.name || '';
              const input = block.input || {};

              if (toolName === 'Write' || toolName === 'Edit') {
                prevErrorFile = input.file_path || null;
              }

              if (toolName === 'Bash' && input.command) {
                const fixSummary = redactSecrets(input.description || input.command.slice(0, 100));
                patterns.push({
                  timestamp: new Date().toISOString(),
                  error: redactSecrets(prevError),
                  fix: fixSummary,
                  file: prevErrorFile,
                  project: process.env.CLAUDE_PROJECT_DIR || process.cwd()
                });
                prevError = null;
                prevErrorFile = null;
                break;
              }
            }
          }
        }
        // Legacy: also check top-level tool_use for older transcript formats
        if (prevError && entry.tool_use) {
          const toolName = entry.tool_use.name;
          const input = entry.tool_use.input || {};

          if (toolName === 'Write' || toolName === 'Edit') {
            prevErrorFile = input.file_path || null;
          }

          if (toolName === 'Bash' && input.command) {
            const fixSummary = redactSecrets(input.description || input.command.slice(0, 100));
            patterns.push({
              timestamp: new Date().toISOString(),
              error: redactSecrets(prevError),
              fix: fixSummary,
              file: prevErrorFile,
              project: process.env.CLAUDE_PROJECT_DIR || process.cwd()
            });
            prevError = null;
            prevErrorFile = null;
          }
        }
      } catch (e) {}
    }

    if (patterns.length > 0) {
      // Load existing patterns and append
      let existing = [];
      if (fs.existsSync(patternsFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
          if (!Array.isArray(existing)) existing = [];
        } catch (e) { existing = []; }
      }

      const merged = [...existing, ...patterns].slice(-50); // Keep last 50 patterns
      const cacheDir = path.join(CLAUDE_DIR, 'cache');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      // Atomic write — temp+rename prevents partial writes on crash
      const tmpPatterns = patternsFile + '.tmp';
      fs.writeFileSync(tmpPatterns, JSON.stringify(merged, null, 2), 'utf8');
      fs.renameSync(tmpPatterns, patternsFile);
    }

    return patterns;
  } catch (e) {
    return [];
  }
}

/**
 * Format task snapshot as markdown section
 */
function formatTasksSection(snapshot) {
  if (!snapshot || !snapshot.tasks || snapshot.tasks.length === 0) return '';

  const statusOrder = { in_progress: 0, pending: 1, completed: 2 };
  const sorted = [...snapshot.tasks].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 3;
    const sb = statusOrder[b.status] ?? 3;
    return sa - sb;
  });

  let section = `\n## Active Tasks\n\n`;
  section += `*Team: ${snapshot.team} | Snapshot: ${snapshot.timestamp.split('T')[0]}*\n\n`;

  for (const task of sorted.slice(0, 10)) {
    const statusIcon = task.status === 'in_progress' ? '▶' : task.status === 'completed' ? '✓' : '○';
    const id = task.id || '?';
    const subject = task.subject || task.title || 'Unnamed task';
    section += `- ${statusIcon} #${id} ${subject} \`[${task.status}]\`\n`;
  }

  return section;
}

// ---------------------------------------------------------------------------
// C-002: Recovery injection — inject live state for post-compaction context
// Source: AIPass pre-compact recovery injection pattern
// ---------------------------------------------------------------------------

/**
 * Collect live state for injection into compacted context.
 * Uses execFileSync (no shell) for git commands. Timeout 2s each.
 * Returns object with branch, status, metabolicState, taskIds.
 */
function collectLiveState(projectDir) {
  const state = { branch: null, statusSummary: null, metabolicState: null, taskIds: [] };
  const cwd = projectDir || process.env.CLAUDE_PROJECT_DIR || process.env.CWD || process.cwd();

  // Git branch
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, timeout: 2000, stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();
    state.branch = branch;
  } catch { /* not a git repo or git unavailable */ }

  // Git status summary (count of modified/staged/untracked)
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd, timeout: 2000, stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();
    if (status) {
      const lines = status.split('\n');
      const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
      const staged = lines.filter(l => /^[MADRC]/.test(l)).length;
      const untracked = lines.filter(l => l.startsWith('??')).length;
      state.statusSummary = `${modified} modified, ${staged} staged, ${untracked} untracked`;
    } else {
      state.statusSummary = 'clean';
    }
  } catch { /* not a git repo */ }

  // Metabolic state
  try {
    const data = JSON.parse(fs.readFileSync(METABOLIC_FILE, 'utf8'));
    state.metabolicState = data.state || 'NORMAL';
  } catch { state.metabolicState = 'NORMAL'; }

  // Active task IDs from most recent task team
  try {
    const tasksDir = path.join(CLAUDE_DIR, 'tasks');
    if (fs.existsSync(tasksDir)) {
      const teamDirs = fs.readdirSync(tasksDir)
        .map(d => ({ name: d, path: path.join(tasksDir, d) }))
        .filter(d => fs.statSync(d.path).isDirectory())
        .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);

      if (teamDirs.length > 0) {
        const files = fs.readdirSync(teamDirs[0].path).filter(f => f.endsWith('.json'));
        for (const file of files.slice(0, 20)) {
          try {
            const task = JSON.parse(fs.readFileSync(path.join(teamDirs[0].path, file), 'utf8'));
            if (task.status === 'in_progress' || task.status === 'pending') {
              state.taskIds.push(`#${task.id} [${task.status}] ${(task.subject || '').substring(0, 60)}`);
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  } catch { /* no tasks */ }

  return state;
}

/**
 * Emit recovery injection as structured console output.
 * This becomes part of the compacted context the model sees after compaction.
 */
function emitRecoveryInjection(liveState, context) {
  const MAX_INJECTION_LENGTH = 1024; // Cap total output to prevent context bloat
  const parts = ['Project State:'];
  if (liveState.branch) parts.push(`Branch: ${liveState.branch}`);
  if (liveState.statusSummary) parts.push(`Git: ${liveState.statusSummary}`);
  if (liveState.metabolicState) parts.push(`Metabolic: ${liveState.metabolicState}`);
  if (context.currentTask) parts.push(`Task: ${context.currentTask.substring(0, 120)}`);
  if (liveState.taskIds.length > 0) {
    parts.push(`Active tasks: ${liveState.taskIds.slice(0, 3).join(', ')}`);
  }
  if (context.modifiedFiles.length > 0) {
    parts.push(`Modified: ${context.modifiedFiles.slice(0, 5).join(', ')}`);
  }
  // Emit as single-line for clean compaction injection, capped for context budget
  const output = parts.join(' | ');
  console.log(output.length > MAX_INJECTION_LENGTH ? output.substring(0, MAX_INJECTION_LENGTH) + '...' : output);
}

/**
 * Main function
 */
function main() {
  // Circuit breaker — skip if hook has been failing repeatedly
  if (!shouldRun(HOOK_NAME)) {
    console.error('\x1b[33m  pre-compact-retention: circuit breaker open, skipping\x1b[0m');
    return;
  }

  try {
    // Read stdin for hook payload — PreCompact hooks receive transcript_path and project context
    let hookData = {};
    try {
      const input = fs.readFileSync(0, 'utf8');
      hookData = JSON.parse(input);
    } catch { /* stdin not available or not JSON — proceed with fallback */ }

    // Use transcript_path from hook payload if available, fall back to dir scan
    const transcriptPath = hookData.transcript_path || findCurrentTranscript();
    // Use project dir from hook payload for correct project key derivation
    const projectDir = hookData.cwd || hookData.project_dir || process.env.CLAUDE_PROJECT_DIR || process.env.CWD || process.cwd();

    if (!transcriptPath) {
      console.error('\x1b[33m  No transcript found for context retention\x1b[0m');
      return;
    }

    const context = extractContext(transcriptPath);

    // Check if we have meaningful context to save
    const hasContent = context.currentTask ||
      context.decisions.length > 0 ||
      context.unfinishedWork.length > 0 ||
      context.discoveries.length > 0 ||
      context.modifiedFiles.length > 0;

    if (hasContent) {
      // Snapshot tasks first, then pass to single-write updateActiveContext
      const taskSnapshot = snapshotTasks();
      updateActiveContext(context, taskSnapshot);
      console.error('\x1b[32m  Context retained in CLAUDE-activeContext.md\x1b[0m');

      // Summary output for compacted context
      if (context.currentTask) {
        console.error(`  Task: ${context.currentTask}`);
      }
      if (context.unfinishedWork.length > 0) {
        console.error(`  Unfinished: ${context.unfinishedWork.length} items`);
      }
      if (context.modifiedFiles.length > 0) {
        console.error(`  Files: ${context.modifiedFiles.length} modified`);
      }
      if (taskSnapshot) {
        console.error(`  Tasks: ${taskSnapshot.tasks.length} tasks snapshotted (team: ${taskSnapshot.team})`);
      }

      // Error pattern extraction
      const errorPatterns = extractErrorPatterns(transcriptPath);
      if (errorPatterns.length > 0) {
        console.error(`  Error patterns: ${errorPatterns.length} new patterns captured`);
      }

      // Session-end checklist (R3 from fleet assimilation review 2026-03-24)
      // Structured key-value output per Klingon K-006: no free-form prose
      try {
        const hasInProgressTasks = taskSnapshot?.tasks?.some(t => t.status === 'in_progress');
        const hasAnyTasks = taskSnapshot?.tasks?.length > 0;
        const checklist = {
          task_status: hasInProgressTasks ? 'in_progress' : hasAnyTasks ? 'tasks_exist' : 'none_tracked',
          discoveries_mentioned: context.discoveries.length > 0 ? `${context.discoveries.length}_items` : 'none',
          next_session_context: context.unfinishedWork.length > 0
            ? context.unfinishedWork.slice(0, 3).join('; ')
            : 'no_pending_work',
        };
        const checklistLine = Object.entries(checklist)
          .map(([k, v]) => `${k}=${v}`)
          .join(' | ');
        console.error(`\x1b[36m  Session checklist: ${checklistLine}\x1b[0m`);
      } catch { /* checklist is advisory, never block */ }

      // C-002: Recovery injection — emit live state for post-compaction context
      try {
        const liveState = collectLiveState(projectDir);
        emitRecoveryInjection(liveState, context);
      } catch { /* never block compaction on injection failure */ }
    } else {
      console.error('\x1b[2m  No significant context to retain\x1b[0m');

      // Even without transcript context, inject live state for recovery
      try {
        const liveState = collectLiveState(projectDir);
        const emptyContext = { currentTask: null, modifiedFiles: [] };
        emitRecoveryInjection(liveState, emptyContext);
      } catch { /* never block */ }
    }

    // Hull-aware MEMORY.md shedding — runs regardless of transcript content
    // because shedding is about context pressure, not transcript data.
    const hull = readHullIntegrity();
    if (hull) {
      let shedLevel = 0;
      if (hull.hullIntegrity === 'Critical' || hull.usedPct >= 70) {
        shedLevel = 2;
      } else if (hull.hullIntegrity === 'Red' || hull.usedPct >= 55) {
        shedLevel = 1;
      }

      if (shedLevel > 0) {
        const result = trimMemoryMd(shedLevel, projectDir);
        if (result) {
          const shedContext = {
            currentTask: context?.currentTask || null,
            decisions: context?.decisions || [],
            discoveries: context?.discoveries || [],
            unfinishedWork: context?.unfinishedWork || [],
            modifiedFiles: context?.modifiedFiles || [],
          };
          // Atomic ordering: save backup FIRST, then trim MEMORY.md
          // If process dies after backup but before trim: no data loss (backup exists)
          // If process dies after trim but before budget-state: trimmed but recoverable
          const contextSaved = writeShedContext(result.original, shedContext, shedLevel);
          if (contextSaved) {
            // Now safe to write trimmed MEMORY.md — backup is durable
            try {
              const tmpPath = result.memoryPath + '.tmp';
              fs.writeFileSync(tmpPath, result.trimmed, 'utf8');
              fs.renameSync(tmpPath, result.memoryPath);
            } catch {
              // Trim write failed — original is still intact, shed-context saved
              console.error(`\x1b[31m  Memory shed: trim write failed, original preserved\x1b[0m`);
            }
            writeBudgetState(shedLevel);
            console.error(`\x1b[33m  Memory shed level ${shedLevel}: MEMORY.md trimmed (${result.trimmed.split('\n').length} lines)\x1b[0m`);
            console.error(`\x1b[2m  Shed content saved to shed-context.json for mem0 persistence\x1b[0m`);
          } else {
            // shed-context didn't save — do NOT trim MEMORY.md (no recovery path)
            console.error(`\x1b[31m  Memory shed aborted: could not save shed-context.json\x1b[0m`);
          }
        } else if (shedLevel > 0) {
          // trimMemoryMd returned null — either already shed or missing sections
          console.error(`\x1b[2m  Memory shed skipped (already shed or missing expected sections)\x1b[0m`);
        }
      }
    }
    recordSuccess(HOOK_NAME);
  } catch (error) {
    recordFailure(HOOK_NAME);
    console.error('\x1b[31m✗ Context retention failed:', error.message, '\x1b[0m');
  }
}

main();
