#!/usr/bin/env node
'use strict';

/**
 * Subagent Tool Guard - PreToolUse Hook
 *
 * Enforces tool permission boundaries for named subagents.
 * When CLAUDE_CODE_AGENT_NAME is set, only tools in that agent's
 * allowlist are permitted. Unknown agents are blocked from Bash.
 * Main agent (no env var) passes through unconditionally.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// Permission table
// Tools listed here are ALLOWED for each agent. Anything not listed is blocked.
// ---------------------------------------------------------------------------

const AGENT_PERMISSIONS = {
  'haiku-explorer': new Set([
    'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
  ]),
  'sonnet-reviewer': new Set([
    'Read', 'Grep', 'Glob',
  ]),
  'sonnet-worker': new Set([
    'Read', 'Write', 'Edit', 'Grep', 'Glob',
  ]),
  'commit-analyzer': new Set([
    'Bash', 'Read',
  ]),
  'devils-advocate': new Set([
    'Read', 'Grep', 'Glob',
  ]),
};

// Agents that may use mcp__ tools (same treatment as WebFetch)
const MCP_ALLOWED_AGENTS = new Set([
  'haiku-explorer',
]);

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

function decide(toolName, agentName) {
  // MCP tool handling takes precedence over per-agent allowlists.
  // Adding an mcp__ tool to AGENT_PERMISSIONS won't work — add to MCP_ALLOWED_AGENTS instead.
  if (toolName.startsWith('mcp__')) {
    if (MCP_ALLOWED_AGENTS.has(agentName)) {
      return { allow: true };
    }
    return {
      allow: false,
      reason: `Agent '${agentName}' is not permitted to use ${toolName}. Return findings to main agent for execution.`,
    };
  }

  const known = AGENT_PERMISSIONS[agentName];

  if (known) {
    // Known agent — strict allowlist
    if (known.has(toolName)) {
      return { allow: true };
    }
    return {
      allow: false,
      reason: `Agent '${agentName}' is not permitted to use ${toolName}. Return findings to main agent for execution.`,
    };
  }

  // Unknown agent — permissive default, block only Bash
  if (toolName === 'Bash') {
    return {
      allow: false,
      reason: `Agent '${agentName}' is not permitted to use Bash (safety default for unknown agents). Return findings to main agent for execution.`,
    };
  }

  return { allow: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const raw = fs.readFileSync(0, 'utf8');
  const data = JSON.parse(raw);
  const { tool_name } = data;

  // CLAUDE_CODE_AGENT_NAME is set by the Claude Code runtime for subagents.
  // Trust boundary: if a subprocess can inherit/set this env var, it could
  // spoof agent identity. This guard is defense-in-depth, not a hard boundary.
  const agentName = process.env.CLAUDE_CODE_AGENT_NAME;

  // Main agent — allow everything
  if (!agentName) {
    process.stdout.write(JSON.stringify({ result: 'allow' }) + '\n');
    process.exit(0);
  }

  // Guard against missing tool_name in hook input
  if (!tool_name || typeof tool_name !== 'string') {
    process.stdout.write(JSON.stringify({ result: 'allow' }) + '\n');
    process.exit(0);
  }

  const result = decide(tool_name, agentName);

  if (result.allow) {
    process.stdout.write(JSON.stringify({ result: 'allow' }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({
      result: 'block',
      reason: `[subagent-tool-guard] ${result.reason}`,
    }) + '\n');
  }
} catch (_) {
  // Never block the agent on hook error
  process.stdout.write(JSON.stringify({ result: 'allow' }) + '\n');
}

process.exit(0);
