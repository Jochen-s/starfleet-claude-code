#!/usr/bin/env node
/**
 * subagent-stop-tracker.js -- SubagentStop hook
 * Logs subagent lifecycle data for optimization analytics and strategy learning.
 * Tracks: agent type, duration, token usage, exit status, task keywords.
 * Task keywords enable future routing optimization (which agent type works best
 * for which task type). Strategy learner pattern from ai-orchestrator (2026-03-28).
 * Always exits 0. <50ms budget. Optional tier (circuit-breaker gated).
 */
'use strict';

const { shouldFire } = require('./lib/hook-gate');
if (!shouldFire('subagent-stop-tracker')) process.exit(0);

const fs = require('fs');
const path = require('path');
const { shouldRun } = require('./lib/circuit-breaker');

const LOG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude', 'cache', 'subagent-lifecycle.jsonl'
);

const MAX_LOG_SIZE = 1024 * 1024; // 1MB

function main() {
  if (!shouldRun('subagent-stop-tracker')) {
    process.exit(0);
  }

  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      const agentName = data.agentName || data.agent_name || '';
      const description = data.description || '';

      // Strategy learner: extract task keywords for routing optimization
      const taskText = (agentName + ' ' + description).toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ');
      const taskKeywords = [...new Set(
        taskText.split(/\s+/).filter(w => w.length > 3).slice(0, 8)
      )];

      const entry = {
        ts: new Date().toISOString(),
        session_id: data.session_id || null,
        agent_id: data.agentId || data.agent_id || null,
        agent_type: data.agentType || data.agent_type || null,
        agent_name: agentName || null,
        task_keywords: taskKeywords.length > 0 ? taskKeywords : null,
        duration_ms: data.duration_ms || data.durationMs || null,
        total_tokens: data.total_tokens || data.totalTokens || null,
        tool_uses: data.tool_uses || data.toolUses || null,
        exit_status: data.exit_status || data.exitStatus || null
      };

      // Ensure cache directory exists
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

      // Rotate by rename if too large (timestamped to avoid overwrite)
      try {
        const stats = fs.statSync(LOG_PATH);
        if (stats.size > MAX_LOG_SIZE) {
          fs.renameSync(LOG_PATH, LOG_PATH + '.' + Date.now());
        }
      } catch { /* file doesn't exist yet */ }

      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    } catch {
      // Silent fail
    }
    process.exit(0);
  });
}

main();
