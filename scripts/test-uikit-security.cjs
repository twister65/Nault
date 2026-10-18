'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'src/assets/lib/base');
const purify = fs.readFileSync(path.join(base, 'purify.min.js'), 'utf8');
const code = fs.readFileSync(path.join(base, 'uikit.js'), 'utf8');
const min = fs.readFileSync(path.join(base, 'uikit.min.js'), 'utf8');
if (!purify.includes('DOMPurify 3.4.17')) throw Error('Expected pinned DOMPurify missing');
if (!code.includes('RETURN_DOM_FRAGMENT: true')) throw Error('Non-minified bundle lacks sanitation');
if (!code.includes('container.appendChild(cleanFragment)')) throw Error('Sanitized nodes not inserted');
if (!min.startsWith('/*! UIkit 3.9.4')) throw Error('Minified UIkit version mismatch');
const index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
if (index.indexOf('purify.min.js') < 0 || index.indexOf('uikit.min.js') < 0 || index.indexOf('purify.min.js') > index.indexOf('uikit.min.js')) {
  throw Error('DOMPurify must load before UIkit');
}
const chrome = process.env.CHROME_BIN || 'google-chrome';
const fixture = `<!doctype html><meta charset="utf-8">
<script src="${pathToFileURL(path.join(base,'purify.min.js')).href}"></script>
<script src="${pathToFileURL(path.join(base,'uikit.min.js')).href}"></script>
<script>
  (() => {
    try {
      window.__xssTriggered = false;
      const payload = '<img src="x" onerror="window.__xssTriggered=true">' +
        '<a href="javascript:window.__xssTriggered=true">Link</a><span id="safe">SAFE</span>';
      const nodes = UIkit.util.fragment(payload);
      const holder = document.createElement('div');
      (Array.isArray(nodes) ? nodes : [nodes]).forEach(node => holder.appendChild(node));
      document.body.appendChild(holder);
      const goodMarkup = !!holder.querySelector('#safe');
      const unsafeEvent = !!holder.querySelector('[onerror]');
      const unsafeUrl = [...holder.querySelectorAll('[href]')].some(x => /^\\s*javascript:/i.test(x.getAttribute('href')));
      const withoutPurify = window.DOMPurify;
      delete window.DOMPurify;
      const fallback = UIkit.util.fragment('<img src=x onerror="window.__xssTriggered=true">');
      window.DOMPurify = withoutPurify;
      const textOnly = fallback && fallback.nodeType === 3;
      document.documentElement.setAttribute('data-security-result',
        goodMarkup && !unsafeEvent && !unsafeUrl && textOnly && !window.__xssTriggered ? 'pass' : 'fail');
    } catch (error) {
      document.documentElement.setAttribute('data-security-result','exception');
      document.documentElement.setAttribute('data-error',String(error.message).slice(0,100));
    }
  })();
</script>`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nault-uikit-'));
try {
  const file = path.join(dir, 'xss-smoke.html');
  fs.writeFileSync(file, fixture);
  const output = execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=2000', '--dump-dom', pathToFileURL(file).href],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore','pipe','ignore'] });
  if (!output.includes('data-security-result="pass"')) {
    throw Error('UIkit browser XSS smoke test failed: ' + output.slice(0,450));
  }
  console.log('PASS: UIkit 3.9.4 sanitized fragment DOM; event/URL payloads inert; missing sanitizer fails closed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
