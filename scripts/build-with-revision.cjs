'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isFullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);

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
  for (const candidate of [env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA]) {
    if (isFullSha(candidate)) return candidate.toLowerCase();
  }
  const gitSha = fallback();
  return isFullSha(gitSha) ? gitSha.toLowerCase() : null;
}

function angularBuildArgs(config, commit, angularCliPath) {
  if (commit !== null && !isFullSha(commit)) {
    throw new Error('Invalid build commit; expected a full Git SHA or null.');
  }
  const args = [angularCliPath, 'build'];
  if (config) args.push('--configuration', config);
  if (config === 'desktop') args.push('--base-href', '');
  // Pass the full quoted string literal to Angular esbuild. Never substitute
  // a moving GitHub branch HEAD at runtime or load a separate JSON asset.
  args.push('--define', `__NAULT_BUILD_COMMIT__=${JSON.stringify(commit)}`);
  return args;
}

function main() {
  const config = process.argv[2] || '';
  if (config && config !== 'production' && config !== 'desktop') {
    throw new Error('Unknown Angular build configuration: ' + config);
  }
  const sha = resolveCommitSha();
  console.log('Nault embedded build commit:', sha ? sha.slice(0, 7) : 'unavailable');
  const angularCli = require.resolve('@angular/cli/bin/ng.js');
  const child = spawnSync(process.execPath, angularBuildArgs(config, sha, angularCli), {
    cwd: root, stdio: 'inherit', env: process.env
  });
  if (child.error) throw child.error;
  if (child.signal) {
    console.error('Angular build interrupted by', child.signal);
    process.exit(1);
  }
  process.exit(child.status === null ? 1 : child.status);
}

if (require.main === module) main();
module.exports = { resolveCommitSha, angularBuildArgs };
