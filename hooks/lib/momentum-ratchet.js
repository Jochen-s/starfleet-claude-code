'use strict';

const ARTIFACT_PATTERNS = {
  skills:    /[/\\]\.claude[/\\]skills[/\\].+[/\\]SKILL\.md$/i,
  instincts: /[/\\]\.claude[/\\]instincts[/\\].+\.md$/i,
  hooks:     /[/\\]\.claude[/\\]hooks[/\\][^/\\]+\.js$/i,
  tests:     /[/\\]tests?[/\\][^/\\]*\.(?:test|spec)\.(?:js|ts)$|[/\\]tests?[/\\]test[_-][^/\\]*\.js$/i,
  klean:     /[/\\]\.knowledge-db[/\\]entries\.jsonl$/i,
};

function detectArtifacts(actions) {
  const counts = { skills: 0, instincts: 0, hooks: 0, tests: 0, klean: 0, total: 0 };

  for (const action of actions) {
    if (action.success === false) continue;
    const tool = action.tool;
    if (tool !== 'Write' && tool !== 'Edit') continue;
    const file = (action.file || '').replace(/\\/g, '/');
    if (!file) continue;

    for (const [category, pattern] of Object.entries(ARTIFACT_PATTERNS)) {
      if (pattern.test(file)) {
        counts[category]++;
        counts.total++;
        break;
      }
    }
  }

  return counts;
}

function formatMessage(counts) {
  if (counts.total === 0) {
    return 'No reusable artifacts (skills, instincts, hooks, tests, K-LEAN) detected this session.';
  }
  const parts = [];
  if (counts.skills > 0) parts.push(`${counts.skills} skill`);
  if (counts.instincts > 0) parts.push(`${counts.instincts} instinct`);
  if (counts.hooks > 0) parts.push(`${counts.hooks} hook`);
  if (counts.tests > 0) parts.push(`${counts.tests} test`);
  if (counts.klean > 0) parts.push(`${counts.klean} K-LEAN update`);
  return `This session produced ${counts.total} reusable artifact(s): ${parts.join(', ')}.`;
}

module.exports = { detectArtifacts, formatMessage };
