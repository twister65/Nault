'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCommitSha, angularBuildArgs } = require('./build-with-revision.cjs');

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

test('embeds the quoted full SHA into the Angular JS bundle', () => {
  const args = angularBuildArgs('production', shaA.toLowerCase(), '/path/ng.js');
  assert.deepEqual(args, [
    '/path/ng.js', 'build', '--configuration', 'production',
    '--define', '__NAULT_BUILD_COMMIT__="' + shaA.toLowerCase() + '"'
  ]);
});

test('preserves Electron relative base-href and never accepts arbitrary code', () => {
  const args = angularBuildArgs('desktop', shaB, '/path/ng.js');
  assert.deepEqual(args, [
    '/path/ng.js', 'build', '--configuration', 'desktop',
    '--base-href', '', '--define', '__NAULT_BUILD_COMMIT__="' + shaB + '"'
  ]);
  assert.throws(() => angularBuildArgs('production', 'fake;script', '/path/ng.js'));
  assert.equal(angularBuildArgs('', null, '/path/ng.js').at(-1), '__NAULT_BUILD_COMMIT__=null');
});
