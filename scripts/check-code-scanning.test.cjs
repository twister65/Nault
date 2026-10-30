const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assess, uniqueAlerts, pollPublishedAnalyses } = require('./check-code-scanning.cjs');
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

test('waits for GitHub to index both exact-commit CodeQL categories', async () => {
  let requests = 0;
  let waits = 0;
  const result = await pollPublishedAnalyses(async () => {
    requests++;
    return requests < 3 ? analyses.slice(1) : analyses;
  }, 'current', { attempts: 4, intervalMs: 0, delay: async () => { waits++; } });
  assert.equal(result.attempts, 3);
  assert.equal(requests, 3);
  assert.equal(waits, 2);
  assert.equal(assess(result.analyses, [], 'current').passed, true);
});

test('fails closed when indexing never exposes a required category', async () => {
  let requests = 0;
  const result = await pollPublishedAnalyses(async () => {
    requests++;
    return analyses.slice(1);
  }, 'current', { attempts: 3, intervalMs: 0, delay: async () => {} });
  assert.equal(result.attempts, 3);
  assert.equal(requests, 3);
  assert.deepEqual(assess(result.analyses, [], 'current').missingCategories, ['/language:actions']);
  assert.equal(assess(result.analyses, [], 'current').passed, false);
});

test('never accepts results belonging to a different SHA or analyses with errors', async () => {
  const wrongOrFailed = analyses.map(a => ({ ...a, error: 'processing failed' }));
  const result = await pollPublishedAnalyses(async () => [...wrongOrFailed, { ...analyses[0], commit_sha: 'other' }],
    'current', { attempts: 2, intervalMs: 0, delay: async () => {} });
  assert.equal(assess(result.analyses, [], 'current').passed, false);
});
