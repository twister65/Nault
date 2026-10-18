const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assess } = require('./check-code-scanning.cjs');
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
