#!/usr/bin/env node
'use strict';

const path = require('path');
const { classifyEntry } = require(
  path.join(require('os').homedir(), '.claude', 'hooks', 'lib', 'failure-pattern-aggregator')
);

let passed = 0;
let failed = 0;
const failures = [];

function check(id, desc, cond) {
  if (cond) {
    passed++;
    if (process.argv.includes('--verbose')) console.log(`  PASS ${id}: ${desc}`);
  } else {
    failed++;
    failures.push(`${id}: ${desc}`);
    console.log(`  FAIL ${id}: ${desc}`);
  }
}

function classify(sig, toolName) {
  const entry = { tool_name: toolName || 'Bash', error_signature: sig };
  const normalized = sig.toLowerCase().trim().replace(/\s+/g, ' ');
  return classifyEntry(entry, normalized, new Map());
}

// --- REGRESSION: Existing 5 types must still work ---

check('R-01', 'permission-blocked on "permission denied"',
  classify('Permission denied') === 'permission-blocked');

check('R-02', 'permission-blocked on "blocked by policy"',
  classify('blocked by policy') === 'permission-blocked');

check('R-03', 'file-not-found on "ENOENT no such file"',
  classify('ENOENT no such file') === 'file-not-found');

check('R-04', 'file-not-found on "file not found"',
  classify('file not found: /some/path') === 'file-not-found');

check('R-05', 'timeout on "ETIMEDOUT"',
  classify('ETIMEDOUT') === 'timeout');

check('R-06', 'timeout on "timeout exceeded"',
  classify('timeout exceeded') === 'timeout');

check('R-07', 'encoding-error on "charmap codec"',
  classify('charmap codec cannot decode') === 'encoding-error');

check('R-08', 'encoding-error on "decode error"',
  classify('decode error at position 42') === 'encoding-error');

check('R-09', 'generic fallback for unknown errors',
  classify('something completely unknown happened') === 'generic');

// --- NEW: 8 strategic failure types ---

check('N-01', 'context-overload on "context window exceeded"',
  classify('context window exceeded') === 'context-overload');

check('N-02', 'context-overload on "token limit"',
  classify('token limit reached') === 'context-overload');

check('N-03', 'context-overload on "output truncated"',
  classify('output truncated due to length') === 'context-overload');

check('N-04', 'external-dependency on "ECONNREFUSED"',
  classify('ECONNREFUSED 127.0.0.1:4000') === 'external-dependency');

check('N-05', 'external-dependency on "503 service unavailable"',
  classify('503 Service Unavailable') === 'external-dependency');

check('N-06', 'external-dependency on "API rate limit"',
  classify('API rate limit exceeded') === 'external-dependency');

check('N-07', 'external-dependency on "ECONNRESET"',
  classify('ECONNRESET') === 'external-dependency');

check('N-08', 'bad-decomposition on "too many sub-tasks"',
  classify('too many sub-tasks spawned') === 'bad-decomposition');

check('N-09', 'bad-decomposition on "circular dependency"',
  classify('circular dependency detected') === 'bad-decomposition');

check('N-10', 'bad-decomposition on "max depth exceeded"',
  classify('max delegation depth exceeded') === 'bad-decomposition');

check('N-11', 'missing-skill on "skill not found"',
  classify('skill not found: nonexistent-skill') === 'missing-skill');

check('N-12', 'missing-skill on "no matching skill"',
  classify('no matching skill for task type') === 'missing-skill');

check('N-13', 'missing-memory on "no relevant entries"',
  classify('no relevant entries found in knowledge base') === 'missing-memory');

check('N-14', 'missing-memory on "memory retrieval returned 0"',
  classify('memory retrieval returned 0 results') === 'missing-memory');

check('N-15', 'missing-eval on "no eval coverage"',
  classify('no eval coverage for this capability') === 'missing-eval');

check('N-16', 'missing-eval on "untested path"',
  classify('untested code path executed') === 'missing-eval');

check('N-17', 'bad-requirements on "ambiguous requirement"',
  classify('ambiguous requirement: multiple interpretations') === 'bad-requirements');

check('N-18', 'bad-requirements on "contradictory spec"',
  classify('contradictory specification detected') === 'bad-requirements');

check('N-19', 'unsafe-autonomy on "requires approval"',
  classify('action requires human approval') === 'unsafe-autonomy');

check('N-20', 'unsafe-autonomy on "station 3 violation"',
  classify('station 3 violation: destructive action attempted') === 'unsafe-autonomy');

check('N-21', 'unsafe-autonomy on "budget exceeded"',
  classify('budget exceeded for this task') === 'unsafe-autonomy');

// --- CODEX: additional error codes (cross-model review) ---

check('C-01', 'permission-blocked on "EACCES"',
  classify('EACCES: permission denied') === 'permission-blocked');

check('C-02', 'permission-blocked on "EPERM"',
  classify('EPERM: operation not permitted') === 'permission-blocked');

check('C-03', 'external-dependency on "429 Too Many Requests"',
  classify('429 Too Many Requests') === 'external-dependency');

check('C-04', 'external-dependency on "502 Bad Gateway"',
  classify('502 Bad Gateway') === 'external-dependency');

check('C-05', 'timeout wins over external-dep for "504 Gateway Timeout"',
  classify('504 Gateway Timeout') === 'timeout');

// --- EDGE: priority ordering (more specific beats less specific) ---

check('E-01', 'permission takes priority over external-dep',
  classify('permission denied by rate limit') === 'permission-blocked');

check('E-02', 'timeout takes priority over external-dep',
  classify('ETIMEDOUT connecting to API') === 'timeout');

check('E-03', 'empty signature returns generic',
  classify('') === 'generic');

check('E-04', 'null-ish entry handled',
  classifyEntry({ tool_name: 'X', error_signature: 42 }, '', new Map()) === 'generic');

// --- REPORT ---

console.log(`\nGap Classification Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
