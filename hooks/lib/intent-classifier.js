/**
 * Shared intent classification library.
 * Used by intent-context.js and action-logger.js.
 *
 * Pure computation -- no I/O, no filesystem.
 */

'use strict';

// --- Bash command classifiers (priority order, first match wins) ---
const BASH_RULES = [
  {
    pattern: /\b(node|python|pytest|npm test|yarn test|pnpm test|jest|mocha|vitest)\b/i,
    intent: 'debugging',
    topic: 'platform-fixes.md',
  },
  {
    pattern: /\b(git\s+(status|diff|log|branch|add|commit|checkout|stash|fetch|merge|rebase|pull|push))\b/i,
    intent: 'version-control',
    topic: null,
  },
  {
    pattern: /\b(docker|kubectl|helm|podman)\b/i,
    intent: 'infrastructure',
    topic: 'platform-fixes.md',
  },
  {
    pattern: /\b(wsl|cygpath|python\.exe|pip install|venv|uv\s+run)\b/i,
    intent: 'platform',
    topic: 'platform-fixes.md',
  },
  {
    pattern: /\b(n8n|mcp|npx.*mcp)\b/i,
    intent: 'automation',
    topic: 'ecosystem-setup.md',
  },
  {
    pattern: /\b(wp-|wordpress|rankmath|elementor)\b/i,
    intent: 'wordpress',
    topic: 'wordpress.md',
  },
];

// --- Code-change path classifiers ---
const PATH_RULES = [
  {
    pattern: /[/\\]\.claude[/\\]hooks[/\\]/,
    intent: 'hook-engineering',
    topic: 'setup-architecture.md',
  },
  {
    pattern: /[/\\]\.claude[/\\]settings\.json$/,
    intent: 'hook-engineering',
    topic: 'setup-architecture.md',
  },
  {
    pattern: /[/\\]src[/\\]voice[/\\]/,
    intent: 'voice-engineering',
    topic: 'voice-system.md',
  },
  {
    pattern: /[/\\](\.planning|docs)[/\\]/,
    intent: 'planning',
    topic: null,
  },
];

function classifyIntent(toolName, toolInput) {
  if (toolName === 'Bash') {
    const cmd = (toolInput && toolInput.command) || '';
    for (const rule of BASH_RULES) {
      if (rule.pattern.test(cmd)) {
        return { intent: rule.intent, topic: rule.topic };
      }
    }
    return { intent: 'bash-generic', topic: null };
  }

  // Edit or Write -- classify by file path
  const filePath = (toolInput && (toolInput.file_path || toolInput.filePath)) || '';
  for (const rule of PATH_RULES) {
    if (rule.pattern.test(filePath)) {
      return { intent: rule.intent, topic: rule.topic };
    }
  }

  // Read tool -- classify by file path
  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
    return { intent: 'research', topic: null };
  }

  return { intent: 'code-generic', topic: null };
}

module.exports = { BASH_RULES, PATH_RULES, classifyIntent };
