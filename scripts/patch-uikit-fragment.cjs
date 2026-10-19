'use strict';
// Reproducible, fail-closed security patch for the archived UIkit 3.9.4 bundle.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src/assets/lib/base/uikit.js');
let source = fs.readFileSync(file, 'utf8');
if (!source.startsWith('/*! UIkit 3.9.4')) throw Error('Unexpected UIkit version; inspect upstream changes');
const start = source.indexOf('    function fragment(html) {');
const end = source.indexOf('\n    function apply$1(', start);
if (start < 0 || end < 0 || !source.slice(start,end).includes("container.insertAdjacentHTML('beforeend', html.trim());")) {
  throw Error('Expected legacy unsafe fragment() was not found');
}
const safe = `    function fragment(html) {

        var container = document.createElement('div');
        // The renderer must load the reviewed DOMPurify bundle before UIkit.
        // If it is unavailable, fail closed and show text instead of HTML.
        var purifier = typeof window !== 'undefined' && window.DOMPurify;
        if (fragmentRe.test(html) && purifier && typeof purifier.sanitize === 'function') {
            var cleanFragment = purifier.sanitize(html.trim(), { RETURN_DOM_FRAGMENT: true });
            // Insert already-sanitized DOM nodes. Never parse untrusted HTML
            // via innerHTML or insertAdjacentHTML at this trust boundary.
            container.appendChild(cleanFragment);
        } else {
            container.textContent = html;
        }

        return container.childNodes.length > 1 ? toNodes(container.childNodes) : container.firstChild;

    }
`;
source = source.slice(0, start) + safe + source.slice(end);
if (source.includes("container.insertAdjacentHTML('beforeend', html.trim())")) throw Error('Unsafe sink remains');
fs.writeFileSync(file, source);
console.log('UIkit 3.9.4 fragment() now uses DOMPurify DOM fragments with a text-only fallback.');
