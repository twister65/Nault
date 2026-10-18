const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assess, uniqueAlerts } = require('./check-code-scanning.cjs');
const analyses = ['actions','javascript-typescript'].map(language => ({ commit_sha: 'current', tool: { name: 'CodeQL' }, category: `/language:${language}` }));
test('requires both analyses from the exact commit', () => {
  assert.equal(assess(analyses, [], 'current').passed, true);
  assert.equal(assess(analyses, [], 'other').passed, false);
  assert.equal(assess(analyses.slice(1), [], 'current').passed, false);
  assert.equal(assess(analyses.map(a => ({ ...a, error: 'failed' })), [], 'current').passed, false);
});
test('open published CodeQL alerts block; resolved alerts do not', () => {
  const alert = { tool: { name: 'CodeQL' }, state: 'open', rule: { id: 'example' } };
  assert.equal(assess(analyses, [alert], 'current').passed, false);
  assert.equal(assess(analyses, [{ ...alert, state: 'fixed' }], 'current').passed, true);
});

test('open findings in candidate head ref block an otherwise clean PR merge ref', () => {
  const headAlert = { number: 11, tool: { name: 'CodeQL' }, state: 'open', rule: { id: 'js/prototype-polluting-assignment' } };
  const mergeRefAlerts = [];
  const combined = uniqueAlerts(mergeRefAlerts, [headAlert], [headAlert]);
  assert.equal(combined.length, 1);
  assert.equal(assess(analyses, mergeRefAlerts, 'current').passed, true);
  assert.equal(assess(analyses, combined, 'current').passed, false);
});
test('fixed base-branch findings absent from candidate do not block a PR', () => {
  assert.equal(assess(analyses, uniqueAlerts([], []), 'current').passed, true);
});
