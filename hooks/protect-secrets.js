#!/usr/bin/env node
/**
 * Protect Secrets - PreToolUse Hook for Read|Edit|Write|Bash
 * Prevents reading, modifying, or exfiltrating sensitive files.
 * Logs to: ~/.claude/hooks-logs/
 *
 * Source: karanb192/claude-code-hooks (MIT, 262 tests)
 * SAFETY_LEVEL: 'critical' | 'high' | 'strict'
 *   critical - SSH keys, AWS creds, .env files only
 *   high     - + secrets files, env dumps, exfiltration attempts
 *   strict   - + database configs, any config that might contain secrets
 *
 * Setup in .claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Read|Edit|Write|Bash",
 *       "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/protect-secrets.js" }]
 *     }]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const SAFETY_LEVEL = 'high';

// Files explicitly safe to access (templates, examples)
const ALLOWLIST = [
  /\.env\.example$/i, /\.env\.sample$/i, /\.env\.template$/i,
  /\.env\.schema$/i, /\.env\.defaults$/i, /env\.example$/i, /example\.env$/i,
];

// Sensitive file patterns for Read, Edit, Write tools
const SENSITIVE_FILES = [
  // CRITICAL
  { level: 'critical', id: 'env-file',           regex: /(?:^|\/)\.env(?:\.[^/]*)?$/,                    reason: '.env file contains secrets' },
  { level: 'critical', id: 'envrc',              regex: /(?:^|\/)\.envrc$/,                              reason: '.envrc (direnv) contains secrets' },
  { level: 'critical', id: 'ssh-private-key',    regex: /(?:^|\/)\.ssh\/id_[^/]+$/,                      reason: 'SSH private key' },
  { level: 'critical', id: 'ssh-private-key-2',  regex: /(?:^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/,  reason: 'SSH private key' },
  { level: 'critical', id: 'ssh-authorized',     regex: /(?:^|\/)\.ssh\/authorized_keys$/,               reason: 'SSH authorized_keys' },
  { level: 'critical', id: 'aws-credentials',    regex: /(?:^|\/)\.aws\/credentials$/,                   reason: 'AWS credentials file' },
  { level: 'critical', id: 'aws-config',         regex: /(?:^|\/)\.aws\/config$/,                        reason: 'AWS config may contain secrets' },
  { level: 'critical', id: 'kube-config',        regex: /(?:^|\/)\.kube\/config$/,                       reason: 'Kubernetes config contains credentials' },
  { level: 'critical', id: 'pem-key',            regex: /\.pem$/i,                                       reason: 'PEM key file' },
  { level: 'critical', id: 'key-file',           regex: /\.key$/i,                                       reason: 'Key file' },
  { level: 'critical', id: 'p12-key',            regex: /\.(p12|pfx)$/i,                                 reason: 'PKCS12 key file' },

  // HIGH
  { level: 'high', id: 'claude-settings',         regex: /(?:^|\/)\.claude\/settings\.json$/,              reason: 'Claude settings contains API keys in env block' },
  { level: 'high', id: 'credentials-json',       regex: /(?:^|\/)credentials\.json$/i,                   reason: 'Credentials file' },
  { level: 'high', id: 'secrets-file',           regex: /(?:^|\/)(secrets?|credentials?)\.(json|ya?ml|toml)$/i, reason: 'Secrets configuration file' },
  { level: 'high', id: 'service-account',        regex: /service[_-]?account.*\.json$/i,                 reason: 'GCP service account key' },
  { level: 'high', id: 'gcloud-creds',           regex: /(?:^|\/)\.config\/gcloud\/.*(credentials|tokens)/i, reason: 'GCloud credentials' },
  { level: 'high', id: 'azure-creds',            regex: /(?:^|\/)\.azure\/(credentials|accessTokens)/i,  reason: 'Azure credentials' },
  { level: 'high', id: 'docker-config',          regex: /(?:^|\/)\.docker\/config\.json$/,               reason: 'Docker config may contain registry auth' },
  { level: 'high', id: 'netrc',                  regex: /(?:^|\/)\.netrc$/,                              reason: '.netrc contains credentials' },
  { level: 'high', id: 'npmrc',                  regex: /(?:^|\/)\.npmrc$/,                              reason: '.npmrc may contain auth tokens' },
  { level: 'high', id: 'pypirc',                 regex: /(?:^|\/)\.pypirc$/,                             reason: '.pypirc contains PyPI credentials' },
  { level: 'high', id: 'gem-creds',              regex: /(?:^|\/)\.gem\/credentials$/,                   reason: 'RubyGems credentials' },
  { level: 'high', id: 'vault-token',            regex: /(?:^|\/)(\.vault-token|vault-token)$/,          reason: 'Vault token file' },
  { level: 'high', id: 'keystore',               regex: /\.(keystore|jks)$/i,                            reason: 'Java keystore' },
  { level: 'high', id: 'htpasswd',               regex: /(?:^|\/)\.?htpasswd$/,                          reason: 'htpasswd contains hashed passwords' },
  { level: 'high', id: 'pgpass',                 regex: /(?:^|\/)\.pgpass$/,                             reason: 'PostgreSQL password file' },
  { level: 'high', id: 'my-cnf',                 regex: /(?:^|\/)\.my\.cnf$/,                            reason: 'MySQL config may contain password' },
  { level: 'high', id: 'pip-config',             regex: /(?:^|\/)\.?pip\/pip\.(conf|ini)$/,              reason: 'pip config controls package index (supply chain hijack vector)' },
  { level: 'high', id: 'pip-config-xdg',         regex: /(?:^|\/)\.config\/pip\/pip\.conf$/,             reason: 'pip config controls package index (supply chain hijack vector)' },
  { level: 'high', id: 'uv-config',              regex: /(?:^|\/)\.config\/uv\/uv\.toml$/,              reason: 'uv config controls package index (supply chain hijack vector)' },

  // STRICT
  { level: 'strict', id: 'database-config',      regex: /(?:^|\/)(?:config\/)?database\.(json|ya?ml)$/i, reason: 'Database config may contain passwords' },
  { level: 'strict', id: 'ssh-known-hosts',      regex: /(?:^|\/)\.ssh\/known_hosts$/,                   reason: 'SSH known_hosts reveals infrastructure' },
  { level: 'strict', id: 'gitconfig',            regex: /(?:^|\/)\.gitconfig$/,                          reason: '.gitconfig may contain credentials' },
  { level: 'strict', id: 'curlrc',               regex: /(?:^|\/)\.curlrc$/,                             reason: '.curlrc may contain auth' },
];

// Bash patterns that expose or exfiltrate secrets
const BASH_PATTERNS = [
  // CRITICAL
  { level: 'critical', id: 'cat-env',            regex: /\b(cat|less|head|tail|more|bat|view)\s+[^|;]*\.env\b/i,           reason: 'Reading .env file exposes secrets' },
  { level: 'critical', id: 'cat-ssh-key',        regex: /\b(cat|less|head|tail|more|bat)\s+[^|;]*(id_rsa|id_ed25519|id_ecdsa|id_dsa|\.pem|\.key)\b/i, reason: 'Reading private key' },
  { level: 'critical', id: 'cat-aws-creds',      regex: /\b(cat|less|head|tail|more)\s+[^|;]*\.aws\/credentials/i,         reason: 'Reading AWS credentials' },

  // HIGH - Environment exposure
  { level: 'high', id: 'env-dump',               regex: /\bprintenv\b|(?:^|[;&|]\s*)env\s*(?:$|[;&|])/,                    reason: 'Environment dump may expose secrets' },
  { level: 'high', id: 'echo-secret-var',        regex: /\becho\b[^;|&]*\$\{?[A-Za-z_]*(?:SECRET|KEY|TOKEN|PASSWORD|PASSW|CREDENTIAL|API_KEY|AUTH|PRIVATE)[A-Za-z_]*\}?/i, reason: 'Echoing secret variable' },
  { level: 'high', id: 'printf-secret-var',      regex: /\bprintf\b[^;|&]*\$\{?[A-Za-z_]*(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE)[A-Za-z_]*\}?/i, reason: 'Printing secret variable' },
  { level: 'high', id: 'cat-secrets-file',       regex: /\b(cat|less|head|tail|more)\s+[^|;]*(credentials?|secrets?)\.(json|ya?ml|toml)/i, reason: 'Reading secrets file' },
  { level: 'high', id: 'cat-netrc',              regex: /\b(cat|less|head|tail|more)\s+[^|;]*\.netrc/i,                    reason: 'Reading .netrc credentials' },
  { level: 'high', id: 'source-env',             regex: /\bsource\s+[^|;]*\.env\b|(?:^|[;&|]\s*)\.\s+[^|;]*\.env\b|^\.\s+[^|;]*\.env\b/i, reason: 'Sourcing .env loads secrets' },
  { level: 'high', id: 'export-cat-env',         regex: /export\s+.*\$\(cat\s+[^)]*\.env/i,                                reason: 'Exporting secrets from .env' },

  // HIGH - Exfiltration
  { level: 'high', id: 'curl-upload-env',        regex: /\bcurl\b[^;|&]*(-d\s*@|-F\s*[^=]+=@|--data[^=]*=@)[^;|&]*(\.env|credentials|secrets|id_rsa|\.pem|\.key)/i, reason: 'Uploading secrets via curl' },
  { level: 'high', id: 'curl-post-secrets',      regex: /\bcurl\b[^;|&]*-X\s*POST[^;|&]*[^;|&]*(\.env|credentials|secrets)/i, reason: 'POSTing secrets via curl' },
  { level: 'high', id: 'wget-post-secrets',      regex: /\bwget\b[^;|&]*--post-file[^;|&]*(\.env|credentials|secrets)/i,  reason: 'POSTing secrets via wget' },
  { level: 'high', id: 'scp-secrets',            regex: /\bscp\b[^;|&]*(\.env|credentials|secrets|id_rsa|\.pem|\.key)[^;|&]+:/i, reason: 'Copying secrets via scp' },
  { level: 'high', id: 'rsync-secrets',          regex: /\brsync\b[^;|&]*(\.env|credentials|secrets|id_rsa)[^;|&]+:/i,    reason: 'Syncing secrets via rsync' },
  { level: 'high', id: 'nc-secrets',             regex: /\bnc\b[^;|&]*<[^;|&]*(\.env|credentials|secrets|id_rsa)/i,       reason: 'Exfiltrating secrets via netcat' },

  // HIGH - Copy/move/delete secrets
  { level: 'high', id: 'cp-env',                 regex: /\bcp\b[^;|&]*\.env\b/i,                                           reason: 'Copying .env file' },
  { level: 'high', id: 'cp-ssh-key',             regex: /\bcp\b[^;|&]*(id_rsa|id_ed25519|\.pem|\.key)\b/i,                 reason: 'Copying private key' },
  { level: 'high', id: 'mv-env',                 regex: /\bmv\b[^;|&]*\.env\b/i,                                           reason: 'Moving .env file' },
  { level: 'high', id: 'rm-ssh-key',             regex: /\brm\b[^;|&]*(id_rsa|id_ed25519|id_ecdsa|authorized_keys)/i,     reason: 'Deleting SSH key' },
  { level: 'high', id: 'rm-env',                 regex: /\brm\b.*\.env\b/i,                                                 reason: 'Deleting .env file' },
  { level: 'high', id: 'rm-aws-creds',           regex: /\brm\b[^;|&]*\.aws\/credentials/i,                                reason: 'Deleting AWS credentials' },
  { level: 'high', id: 'truncate-secrets',        regex: /\btruncate\b.*\.(env|pem|key)\b|(?:^|[;&|]\s*)>\s*\.env\b/i,      reason: 'Truncating secrets file' },

  // HIGH - Process environ
  { level: 'high', id: 'proc-environ',           regex: /\/proc\/[^/]*\/environ/,                                          reason: 'Reading process environment' },
  { level: 'high', id: 'xargs-cat-env',          regex: /xargs.*cat|\.env.*xargs/i,                                         reason: 'Reading .env via xargs' },
  { level: 'high', id: 'find-exec-cat-env',      regex: /find\b.*\.env.*-exec|find\b.*-exec.*(cat|less)/i,                 reason: 'Finding and reading .env files' },

  // HIGH - Package index hijacking
  { level: 'high', id: 'pip-config-set',         regex: /\bpip\s+config\s+set\b/i,                                          reason: 'Modifying pip config may redirect package index' },
  { level: 'high', id: 'pip-config-write',       regex: /(?:>|tee)\s*[^;|&]*pip\.(conf|ini)/i,                              reason: 'Writing pip config may redirect package index' },
  { level: 'high', id: 'uv-config-write',        regex: /(?:>|tee)\s*[^;|&]*uv\.toml/i,                                    reason: 'Writing uv config may redirect package index' },

  // STRICT
  { level: 'strict', id: 'grep-password',        regex: /\bgrep\b[^|;]*(-r|--recursive)[^|;]*(password|secret|api.?key|token|credential)/i, reason: 'Grep for secrets may expose them' },
  { level: 'strict', id: 'base64-secrets',       regex: /\bbase64\b[^|;]*(\.env|credentials|secrets|id_rsa|\.pem)/i,       reason: 'Base64 encoding secrets' },
];

// Content patterns — scan the text of Write/Edit operations for inline secrets
const CONTENT_PATTERNS = [
  { level: 'critical', id: 'inline-aws-key',          regex: /\bAKIA[0-9A-Z]{16}\b/g,                                                        reason: 'AWS access key in content' },
  { level: 'critical', id: 'inline-private-key',       regex: /-----BEGIN\s+(?:[A-Z\s]+\s+)?PRIVATE\s+KEY-----/g,                             reason: 'Private key in content' },
  { level: 'high',     id: 'inline-anthropic-key',     regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,                                               reason: 'Anthropic API key in content' },
  { level: 'high',     id: 'inline-github-token',      regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,                               reason: 'GitHub token in content' },
  { level: 'high',     id: 'inline-google-key',        regex: /\bAIza[A-Za-z0-9_-]{35}\b/g,                                                   reason: 'Google API key in content' },
  { level: 'high',     id: 'inline-generic-key',       regex: /\b(?:sk|pk|rk)[-_][a-zA-Z0-9]{20,}\b/g,                                        reason: 'API key pattern in content' },
  { level: 'high',     id: 'inline-bearer',            regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g,                                        reason: 'Bearer token in content' },
  { level: 'high',     id: 'inline-connection-string', regex: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s'"]{10,}/gi,        reason: 'Connection string in content' },
];

// Fast pre-filter substrings — if none present, skip regex scan entirely
const CONTENT_PREFILTER = ['AKIA', 'BEGIN', 'sk-ant', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'AIza', 'Bearer', 'mongodb', 'postgres', 'mysql', 'redis'];
const CONTENT_SIZE_LIMIT = 100 * 1024; // 100KB

function checkContent(content, safetyLevel = SAFETY_LEVEL) {
  if (!content || content.length > CONTENT_SIZE_LIMIT) return { blocked: false, pattern: null };
  const lower = content.toLowerCase();
  const hasCandidate = CONTENT_PREFILTER.some(s => lower.includes(s.toLowerCase()));
  if (!hasCandidate) return { blocked: false, pattern: null };
  const threshold = LEVELS[safetyLevel] || 2;
  for (const p of CONTENT_PATTERNS) {
    if (LEVELS[p.level] <= threshold) {
      p.regex.lastIndex = 0;
      if (p.regex.test(content)) {
        return { blocked: true, pattern: p };
      }
    }
  }
  return { blocked: false, pattern: null };
}

const LEVELS = { critical: 1, high: 2, strict: 3 };
const EMOJIS = { critical: '\uD83D\uDD10', high: '\uD83D\uDEE1\uFE0F', strict: '\u26A0\uFE0F' };
const LOG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'hooks-logs');

function log(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), hook: 'protect-secrets', ...data }) + '\n');
  } catch {}
}

function isAllowlisted(filePath) {
  return filePath && ALLOWLIST.some(p => p.test(filePath));
}

function canonicalize(filePath) {
  if (!filePath) return filePath;
  // Resolve to absolute, normalize separators, collapse /../
  const resolved = path.resolve(filePath);
  // Use forward slashes for consistent regex matching
  return resolved.replace(/\\/g, '/');
}

function checkFilePath(filePath, safetyLevel = SAFETY_LEVEL) {
  if (!filePath) return { blocked: false, pattern: null };
  // Canonicalize before any checks to prevent traversal bypass
  const canonical = canonicalize(filePath);
  if (isAllowlisted(canonical)) return { blocked: false, pattern: null };
  const threshold = LEVELS[safetyLevel] || 2;
  for (const p of SENSITIVE_FILES) {
    if (LEVELS[p.level] <= threshold && p.regex.test(canonical)) {
      return { blocked: true, pattern: p };
    }
  }
  return { blocked: false, pattern: null };
}

function checkBashCommand(cmd, safetyLevel = SAFETY_LEVEL) {
  if (!cmd) return { blocked: false, pattern: null };
  for (const allow of ALLOWLIST) {
    if (allow.test(cmd)) return { blocked: false, pattern: null };
  }
  // Also check with normalized path separators (forward slashes)
  const normalizedCmd = cmd.replace(/\\/g, '/');
  const threshold = LEVELS[safetyLevel] || 2;
  for (const p of BASH_PATTERNS) {
    if (LEVELS[p.level] <= threshold && (p.regex.test(cmd) || p.regex.test(normalizedCmd))) {
      return { blocked: true, pattern: p };
    }
  }
  return { blocked: false, pattern: null };
}

function check(toolName, toolInput, safetyLevel = SAFETY_LEVEL) {
  if (['Read', 'Edit', 'Write'].includes(toolName)) {
    const pathResult = checkFilePath(toolInput?.file_path, safetyLevel);
    if (pathResult.blocked) return pathResult;
    if (toolName === 'Write') {
      const contentResult = checkContent(toolInput?.content, safetyLevel);
      if (contentResult.blocked) return contentResult;
    }
    if (toolName === 'Edit') {
      const contentResult = checkContent(toolInput?.new_string, safetyLevel);
      if (contentResult.blocked) return contentResult;
    }
    return { blocked: false, pattern: null };
  }
  if (toolName === 'Bash') {
    return checkBashCommand(toolInput?.command, safetyLevel);
  }
  return { blocked: false, pattern: null };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input, session_id, cwd, permission_mode } = data;

    if (!['Read', 'Edit', 'Write', 'Bash'].includes(tool_name)) {
      return console.log('{}');
    }

    const result = check(tool_name, tool_input);

    if (result.blocked) {
      const p = result.pattern;
      const target = tool_input?.file_path || tool_input?.command?.slice(0, 100);
      log({ level: 'BLOCKED', id: p.id, priority: p.level, tool: tool_name, target, session_id, cwd, permission_mode });

      const action = { Read: 'read', Edit: 'modify', Write: 'write to', Bash: 'execute' }[tool_name];
      return console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `${EMOJIS[p.level]} [${p.id}] Cannot ${action}: ${p.reason}`
        }
      }));
    }
    console.log('{}');
  } catch (e) {
    log({ level: 'ERROR', error: e.message });
    console.log('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    SENSITIVE_FILES, BASH_PATTERNS, CONTENT_PATTERNS, ALLOWLIST, LEVELS, SAFETY_LEVEL,
    check, checkFilePath, checkBashCommand, checkContent, isAllowlisted,
  };
}
