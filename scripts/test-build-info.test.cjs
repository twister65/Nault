'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCommitSha } = require('./write-build-info.cjs');

const shaA = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
const shaB = '1234567890abcdef1234567890abcdef12345678';

test('uses exact Vercel build SHA ahead of other sources', () => {
  assert.equal(resolveCommitSha(
    { VERCEL_GIT_COMMIT_SHA: shaA, GITHUB_SHA: shaB },
    () => { throw Error('git should not be invoked'); }
  ), shaA.toLowerCase());
});

test('uses GitHub Actions SHA and then the local checkout', () => {
  assert.equal(resolveCommitSha({ GITHUB_SHA: shaA }, () => shaB), shaA.toLowerCase());
  assert.equal(resolveCommitSha({}, () => shaB), shaB);
});

test('never trusts invalid or missing commit metadata', () => {
  assert.equal(resolveCommitSha({ VERCEL_GIT_COMMIT_SHA: 'fake' }, () => null), null);
  assert.equal(resolveCommitSha({}, () => 'git output not available'), null);
});
