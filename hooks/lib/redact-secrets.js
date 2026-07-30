/**
 * Shared secret redaction for Claude Code hooks.
 *
 * Usage:
 *   const { redactSecrets } = require('./lib/redact-secrets');
 *   const safe = redactSecrets(untrustedText);
 *
 * Blacklist-based — covers ~90%+ of common credential formats.
 * All regexes use global flag; lastIndex is reset before each call.
 */

'use strict';

const SECRET_PATTERNS = [
  { re: /\b[A-Za-z0-9_-]*(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?key)\s*[:=]\s*\S+/gi, label: 'API_KEY' },
  { re: /\b[A-Za-z0-9_-]*(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, label: 'PASSWORD' },
  { re: /\b[A-Za-z0-9_-]*(?:token|auth[_-]?token|bearer)\s*[:=]\s*\S+/gi, label: 'TOKEN' },
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]+/g, label: 'BEARER_TOKEN' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, label: 'ANTHROPIC_KEY' },
  { re: /\b(?:sk|pk|rk)[-_][a-zA-Z0-9]{20,}/g, label: 'API_KEY' },
  { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, label: 'GITHUB_TOKEN' },
  { re: /\bAIza[A-Za-z0-9_-]{35}/g, label: 'GOOGLE_API_KEY' },
  { re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s'"]+/gi, label: 'CONNECTION_STRING' },
  { re: /-----BEGIN\s+(?:[A-Z\s]+\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:[A-Z\s]+\s+)?PRIVATE\s+KEY-----/g, label: 'PRIVATE_KEY' },
  { re: /\b[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|AUTH)\s*=\s*\S{1,200}/g, label: 'ENV_SECRET' },
  { re: /\b[a-z][a-z0-9_]*(?:key|secret|token|password|pass|credential|auth)\s*=\s*\S{1,200}/g, label: 'ENV_SECRET' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS_ACCESS_KEY' },
];

/**
 * Redact potential secrets from text.
 * Returns text with secret values replaced by [REDACTED:<type>].
 * Returns input unchanged if falsy.
 */
function redactSecrets(text) {
  if (!text) return text;
  let redacted = text;
  for (const { re, label } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    redacted = redacted.replace(re, `[REDACTED:${label}]`);
  }
  return redacted;
}

module.exports = {
  redactSecrets,
  SECRET_PATTERNS: Object.freeze(SECRET_PATTERNS.map(p => Object.freeze({ ...p }))),
};
