#!/usr/bin/env node
/**
 * Bash Output Limiter Hook
 *
 * PreToolUse hook that intercepts Bash commands likely to produce large output
 * and automatically adds output limiting (head/tail/grep) to reduce context usage.
 *
 * Patterns detected:
 * - Build commands (npm/yarn/pnpm build, tsc, cargo build, go build)
 * - Test commands (npm/yarn test, pytest, go test, cargo test)
 * - Commands with verbose flags (-v, --verbose, --debug)
 * - Lint commands (eslint, prettier --check)
 *
 * Bypass: Add explicit | cat, | less, or FULL_OUTPUT=1 prefix to get full output.
 *
 * @see https://github.com/anthropics/claude-code/issues/12054
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.claude', 'cache');
const STATE_FILE = path.join(CACHE_DIR, 'bash-limiter-state.json');

// Output limit for different command types
const BUILD_LIMIT = 100;    // Last 100 lines for builds
const TEST_LIMIT = 150;     // More lines for tests (need context)
const LINT_LIMIT = 75;      // Fewer lines for linting (errors cluster)
const DEFAULT_LIMIT = 100;

/**
 * Command patterns that produce large output
 */
const PATTERNS = {
  build: {
    regex: /^(npm|yarn|pnpm)\s+(run\s+)?(build|compile|bundle|webpack|vite\s+build)/i,
    limit: BUILD_LIMIT,
    filter: 'tail'
  },
  buildTsc: {
    regex: /^(tsc|npx\s+tsc)\b/i,
    limit: BUILD_LIMIT,
    filter: 'tail'
  },
  buildCargo: {
    regex: /^cargo\s+(build|check)/i,
    limit: BUILD_LIMIT,
    filter: 'tail'
  },
  buildGo: {
    regex: /^go\s+(build|install)/i,
    limit: BUILD_LIMIT,
    filter: 'tail'
  },
  buildDotnet: {
    regex: /^dotnet\s+(build|publish)/i,
    limit: BUILD_LIMIT,
    filter: 'tail'
  },
  testNpm: {
    regex: /^(npm|yarn|pnpm)\s+(run\s+)?test/i,
    limit: TEST_LIMIT,
    filter: 'error_filter'
  },
  testPytest: {
    regex: /^(pytest|python\s+-m\s+pytest)/i,
    limit: TEST_LIMIT,
    filter: 'error_filter'
  },
  testGo: {
    regex: /^go\s+test/i,
    limit: TEST_LIMIT,
    filter: 'error_filter'
  },
  testCargo: {
    regex: /^cargo\s+test/i,
    limit: TEST_LIMIT,
    filter: 'error_filter'
  },
  testJest: {
    regex: /^(jest|npx\s+jest|vitest|npx\s+vitest)/i,
    limit: TEST_LIMIT,
    filter: 'error_filter'
  },
  lintEslint: {
    regex: /^(eslint|npx\s+eslint)/i,
    limit: LINT_LIMIT,
    filter: 'tail'
  },
  lintPrettier: {
    regex: /^(prettier|npx\s+prettier)\s+.*--check/i,
    limit: LINT_LIMIT,
    filter: 'tail'
  },
  lintPylint: {
    regex: /^(pylint|ruff|flake8|mypy)/i,
    limit: LINT_LIMIT,
    filter: 'tail'
  },
  verbose: {
    regex: /\s+(-v+|--verbose|--debug)\b/,
    limit: DEFAULT_LIMIT,
    filter: 'tail'
  }
};

/**
 * Patterns that indicate user wants full output (bypass)
 */
const BYPASS_PATTERNS = [
  /\|\s*(cat|less|more)\b/,           // Piped to cat/less
  /\|\s*head\b/,                       // Already has head
  /\|\s*tail\b/,                       // Already has tail
  /\|\s*grep\b/,                       // Already filtering
  /\|\s*wc\b/,                         // Just counting
  /\|\s*tee\b/,                        // Writing to file
  />\s*[^\s]/,                         // Redirecting to file
  /FULL_OUTPUT=1/,                     // Explicit bypass
  /2>&1\s*\|\s*(head|tail|grep)/,     // Already limiting stderr
];

/**
 * Load stats for tracking
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    limitedCommands: 0,
    bypassedCommands: 0,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Save stats
 */
function saveState(state) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

/**
 * Check if command should be bypassed (user wants full output)
 */
function shouldBypass(cmd) {
  return BYPASS_PATTERNS.some(pattern => pattern.test(cmd));
}

/**
 * Detect command type and get limiting strategy
 */
function detectCommandType(cmd) {
  for (const [type, config] of Object.entries(PATTERNS)) {
    if (config.regex.test(cmd)) {
      return { type, ...config };
    }
  }
  return null;
}

/**
 * Apply output limiting to command
 */
function applyLimit(cmd, config) {
  const { limit, filter } = config;

  // Build the filter suffix
  let suffix;
  switch (filter) {
    case 'error_filter':
      // For tests: show summary + failures
      suffix = `2>&1 | grep -E "(FAIL|PASS|ERROR|error:|warning:|test.*failed|✗|✓|passed|failed)" | tail -${limit}`;
      break;
    case 'tail':
    default:
      // Default: just tail the output
      suffix = `2>&1 | tail -${limit}`;
      break;
  }

  return `${cmd} ${suffix}`;
}

/**
 * Main hook logic
 */
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);

  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const toolName = data.tool_name || data.toolName;

      // Only process Bash tool
      if (toolName !== 'Bash') {
        console.log('{}');
        return;
      }

      const toolInput = data.tool_input || data.toolInput || {};
      const cmd = toolInput.command;

      if (!cmd) {
        console.log('{}');
        return;
      }

      // RTK-wrapped commands: RTK compresses output better than tail -N
      // Matches both `rtk cmd` and `ENV=val rtk cmd` (from rtk-rewrite env prefix handling)
      if (/^(?:[A-Za-z_]\w*=\S+\s+)*rtk\s+/.test(cmd.trim())) {
        console.log('{}');
        return;
      }

      // Check for bypass patterns
      if (shouldBypass(cmd)) {
        const state = loadState();
        state.bypassedCommands++;
        saveState(state);
        console.log('{}');
        return;
      }

      // Detect if this is a high-output command
      const cmdConfig = detectCommandType(cmd);
      if (!cmdConfig) {
        console.log('{}');
        return;
      }

      // Apply output limiting
      const modifiedCmd = applyLimit(cmd, cmdConfig);
      const state = loadState();
      state.limitedCommands++;
      saveState(state);

      // Return modified command
      const result = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext: `[Output auto-limited to ${cmdConfig.limit} lines by bash-output-limiter hook. Bypass with | cat if full output needed.]`,
          updatedInput: {
            command: modifiedCmd,
            description: toolInput.description
              ? `${toolInput.description} (output limited to ${cmdConfig.limit} lines)`
              : undefined
          }
        }
      };

      // Remove undefined values
      if (!result.hookSpecificOutput.updatedInput.description) {
        delete result.hookSpecificOutput.updatedInput.description;
      }

      console.log(JSON.stringify(result));

    } catch (e) {
      // On error, allow command to proceed unchanged
      console.log('{}');
    }
  });
}

main();
