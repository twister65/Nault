// Read the published GitHub results, never infer an empty alert list from a green upload job.
const fs = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');
const expectedCategories = ['/language:actions', '/language:javascript-typescript'];
function uniqueAlerts(...sources) {
  const seen = new Map();
  for (const list of sources) {
    for (const alert of list) seen.set(alert.number, alert);
  }
  return [...seen.values()];
}
function assess(analyses, alerts, sha) {
  const current = analyses.filter(a => a.commit_sha === sha && a.tool?.name === 'CodeQL' && !a.error);
  const missing = expectedCategories.filter(category => !current.some(a => a.category === category));
  const open = alerts.filter(a => a.state === 'open' && a.tool?.name === 'CodeQL').map(a => ({
    number: a.number, rule: a.rule?.id, severity: a.rule?.security_severity_level || a.rule?.severity,
    url: a.html_url, path: a.most_recent_instance?.location?.path,
    line: a.most_recent_instance?.location?.start_line
  }));
  return { sha, missingCategories: missing, openAlerts: open, passed: !missing.length && !open.length };
}
// GitHub accepts SARIF uploads before the asynchronous indexing step finishes.
// Give the published analyses a bounded window to appear, but never interpret
// a successful upload or a green scanner job as evidence that results exist.
async function pollPublishedAnalyses(load, sha, options = {}) {
  const attempts = options.attempts ?? 12;
  const intervalMs = options.intervalMs ?? 30000;
  const delay = options.delay ?? sleep;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12) throw new Error('Invalid polling attempt count.');
  let analyses = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    analyses = await load();
    const missing = assess(analyses, [], sha).missingCategories;
    if (missing.length === 0) return { analyses, attempts: attempt };
    if (attempt < attempts) {
      console.warn(`CodeQL published results not indexed yet (attempt ${attempt}/${attempts}): ${missing.join(', ')}`);
      await delay(intervalMs);
    }
  }
  return { analyses, attempts };
}
async function main() {
  const { GITHUB_REPOSITORY: repo, GITHUB_REF: ref, GITHUB_SHA: sha, GH_TOKEN: token } = process.env;
  if (!repo || !ref || !sha || !token) throw new Error('Missing GitHub Actions context or token.');
  async function pages(resource, extra = '', queryRef = ref) {
    const rows = [];
    for (let page = 1; ; page++) {
      const response = await fetch(`https://api.github.com/repos/${repo}/code-scanning/${resource}?ref=${encodeURIComponent(queryRef)}&per_page=100&page=${page}${extra}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`${resource}: HTTP ${response.status}; result not verified.`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(`${resource}: unexpected response.`);
      rows.push(...data);
      if (data.length < 100) return rows;
    }
  }
  const { analyses, attempts } = await pollPublishedAnalyses(() => pages('analyses'), sha);
  const branchAlerts = await pages('alerts', '&state=open');
  // A temporary refs/pull/N/merge ref can have no indexed alerts even when
  // the candidate branch has open CodeQL findings. Inspect both refs, but do
  // not block on master-only alerts that this PR has already fixed.
  const headRef = process.env.GITHUB_HEAD_REF ? `refs/heads/${process.env.GITHUB_HEAD_REF}` : ref;
  const headAlerts = headRef === ref ? [] : await pages('alerts', '&state=open', headRef);
  const report = { repository: repo, ref, checkedAlertRefs: [...new Set([ref, headRef])],
    pollAttempts: attempts,
    publishedAnalyses: analyses.filter(a => a.commit_sha === sha && a.tool?.name === 'CodeQL')
      .map(a => ({ category: a.category, ref: a.ref, error: a.error || null })),
    ...assess(analyses, uniqueAlerts(branchAlerts, headAlerts), sha) };
  fs.writeFileSync('code-scanning-summary.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error('Merge blocked: missing current analysis or open CodeQL alerts.');
}
module.exports = { assess, uniqueAlerts, pollPublishedAnalyses };
if (require.main === module) main().catch(error => {
  if (!fs.existsSync('code-scanning-summary.json')) fs.writeFileSync('code-scanning-summary.json', JSON.stringify({ passed: false, error: error.message }));
  console.error(error.message);
  process.exitCode = 1;
});
