'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const isFullSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function resolveCommitSha(env = process.env, fallback = readGitCommit) {
  // Vercel and GitHub Actions export the exact checked-out revision.
  for (const candidate of [env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA]) {
    if (isFullSha(candidate)) return candidate.toLowerCase();
  }
  const gitSha = fallback();
  return isFullSha(gitSha) ? gitSha.toLowerCase() : null;
}

function main() {
  const commit = resolveCommitSha();
  const output = path.join(root, 'src', 'assets', 'build-info.json');
  fs.writeFileSync(output, JSON.stringify({ commit }) + '\n');
  console.log('Nault build commit:', commit ? commit.slice(0, 7) : 'unavailable');
}

if (require.main === module) main();

module.exports = { resolveCommitSha };
