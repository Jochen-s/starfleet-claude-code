#!/usr/bin/env node
'use strict';

const path = require('path');

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

const libPath = path.join(require('os').homedir(), '.claude', 'hooks', 'lib', 'momentum-ratchet.js');
const { detectArtifacts, formatMessage } = require(libPath);

// --- Test: artifact detection from action entries ---

const testActions = [
  { tool: 'Write', file: '/home/user/.claude/skills/new-skill/SKILL.md', success: true },
  { tool: 'Write', file: '/home/user/.claude/instincts/new-instinct.md', success: true },
  { tool: 'Edit', file: '/home/user/.claude/hooks/some-hook.js', success: true },
  { tool: 'Write', file: '/home/user/project/tests/test-something.js', success: true },
  { tool: 'Read', file: '/home/user/project/README.md', success: true },
  { tool: 'Bash', file: 'git status', success: true },
];

const result1 = detectArtifacts(testActions);
check('M-01', 'detects skill file creation',
  result1.skills > 0);

check('M-02', 'detects instinct file creation',
  result1.instincts > 0);

check('M-03', 'detects test file creation',
  result1.tests > 0);

check('M-04', 'does not count Read as artifact',
  result1.total > 0 && result1.total === result1.skills + result1.instincts + result1.tests + result1.hooks);

check('M-05', 'detects hook modification',
  result1.hooks > 0);

// --- Test: empty session ---

const emptyResult = detectArtifacts([]);
check('M-06', 'empty actions returns zero artifacts',
  emptyResult.total === 0);

// --- Test: session with no artifacts ---

const noArtifactActions = [
  { tool: 'Read', file: '/some/file.js', success: true },
  { tool: 'Glob', file: '**/*.md', success: true },
  { tool: 'Grep', file: 'pattern', success: true },
];

const result2 = detectArtifacts(noArtifactActions);
check('M-07', 'no-artifact session returns zero total',
  result2.total === 0);

// --- Test: K-LEAN entry detection ---

const kleanActions = [
  { tool: 'Edit', file: '/home/user/.knowledge-db/entries.jsonl', success: true },
];

const result3 = detectArtifacts(kleanActions);
check('M-08', 'detects K-LEAN entry modification',
  result3.klean > 0);

// --- Test: message generation ---

const msg1 = formatMessage(result1);
check('M-09', 'message includes artifact count',
  msg1.includes('artifact'));

const msg2 = formatMessage(emptyResult);
check('M-10', 'zero-artifact message is observational',
  msg2.includes('No reusable artifacts') && !msg2.includes('Consider'));

// --- Test: Windows paths ---

const winActions = [
  { tool: 'Write', file: 'C:\\work\\.claude\\skills\\test\\SKILL.md', success: true },
  { tool: 'Write', file: 'C:\\work\\.claude\\tests\\test-new.js', success: true },
];

const result4 = detectArtifacts(winActions);
check('M-11', 'detects skill on Windows path',
  result4.skills > 0);

check('M-12', 'detects test on Windows path',
  result4.tests > 0);

// --- Test: failed actions are excluded ---

const failedActions = [
  { tool: 'Write', file: '/home/user/.claude/skills/x/SKILL.md', success: false },
];

const result5 = detectArtifacts(failedActions);
check('M-13', 'failed Write does not count as artifact',
  result5.total === 0);

// --- REPORT ---

console.log(`\nMomentum Ratchet Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
