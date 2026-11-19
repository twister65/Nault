// Keep the translated dictionaries structurally identical to the English source.
// Also guard interpolation parameters used for wallet amounts, account IDs, etc.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '..', 'src', 'assets', 'i18n');
const read = language => JSON.parse(fs.readFileSync(path.join(directory, language + '.json'), 'utf8'));
const flatten = (value, prefix = '', result = {}) => {
  for (const [key, entry] of Object.entries(value)) {
    const fullKey = prefix ? prefix + '.' + key : key;
    if (typeof entry === 'string') {
      result[fullKey] = entry;
    } else {
      assert(entry && typeof entry === 'object' && !Array.isArray(entry), 'Invalid translation node ' + fullKey);
      flatten(entry, fullKey, result);
    }
  }
  return result;
};
const placeholders = text => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)]
  .map(match => match[1].trim()).sort();

const en = flatten(read('en'));
for (const language of ['fr', 'es', 'de']) {
  const translation = flatten(read(language));
  assert.deepEqual(Object.keys(translation).sort(), Object.keys(en).sort(), language + ': missing or extra translation keys');
  for (const [key, reference] of Object.entries(en)) {
    const localized = translation[key];
    assert(localized.trim().length > 0, language + ': empty label: ' + key);
    assert.deepEqual(placeholders(localized), placeholders(reference), language + ': interpolation mismatch: ' + key);
    // Sentence fragments surrounding HTML links must retain their whitespace.
    if (reference.endsWith(' ')) assert(localized.endsWith(' '), language + ': missing trailing space: ' + key);
    if (reference.startsWith(' ')) assert(localized.startsWith(' '), language + ': missing leading space: ' + key);
  }
  console.log('Translation validated: ' + language + ', ' + Object.keys(translation).length + ' entries');
}

// Merchant checkout uses the Nano symbol instead of visible XNO text.
// The QR/payment header uses the bundled blue circle badge; numeric amounts
// use U+04FE, and the amount input uses the double-stroke SVG artwork.
const merchantMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'components', 'receive', 'receive.component.html'), 'utf8'
).split('<div class="merchant-mode-overlay"')[1];
assert.ok(merchantMarkup, 'Merchant mode template must exist');

const blueBadge = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'assets', 'img', 'nano-circle-badge-blue.svg'), 'utf8'
);
assert.match(blueBadge, /<circle[^>]+fill="#209CE9"/, 'Blue badge must use official Nano Blue');
assert.match(blueBadge, /fill="#fff"/, 'Blue badge should have a white Nano mark');
assert.ok(
  merchantMarkup.includes('src="assets/img/nano-circle-badge-blue.svg"') &&
  merchantMarkup.includes("'ui-receive.merchant-badge-alt' | transloco"),
  'Merchant QR/payment title must display the accessible bundled blue circle badge'
);
assert.doesNotMatch(
  merchantMarkup,
  />XNO<| \(XNO\)|\/ XNO/,
  'Merchant payment content should show Nano symbols, not the XNO ticker'
);
assert.ok(
  merchantMarkup.includes('class="uk-form-icon uk-link-reset uk-link-muted merchant-mode-symbol-icon"') &&
  merchantMarkup.includes('viewBox="0 0 620 820"'),
  'Merchant amount input must contain a visible double-stroke SVG'
);
assert.equal(
  (merchantMarkup.match(/class="merchant-mode-currency-symbol"/g) || []).length,
  3,
  'Only numeric amount displays should show the Unicode currency sign (no orphan sign)'
);
assert.equal(
  (merchantMarkup.match(/role="img" aria-label="nano">Ӿ<\/span>/g) || []).length,
  3,
  'All numeric amount prefixes must use accessible Nano U+04FE glyphs'
);
for (const language of ['en', 'fr', 'de', 'es']) {
  const labels = read(language)['ui-receive'];
  assert.ok(
    labels['merchant-amount-placeholder'].includes('Ӿ'),
    language + ': merchant amount placeholder should display the Nano symbol'
  );
  assert.doesNotMatch(
    labels['merchant-send-xno'],
    /XNO/,
    language + ': QR payment header should not contain the currency ticker'
  );
}
for (const key of ['merchant-summary-requested', 'merchant-summary-paid']) {
  assert.ok(
    merchantMarkup.includes("('ui-receive." + key + "' | transloco) + ': Ӿ '"),
    'Copied payment summary should prefix amounts with U+04FE: ' + key
  );
}
console.log('Merchant currency and blue circle badge validated');
