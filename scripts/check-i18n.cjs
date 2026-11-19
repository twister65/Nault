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

// Validate official nano currency character usage in merchant-only UI.
// Text uses U+04FE (single stroke); the inline SVG uses the two-stroke
// geometry from xno-symbol.svg for the merchant amount input.
const merchantMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'components', 'receive', 'receive.component.html'), 'utf8'
).split('<div class="merchant-mode-overlay"')[1];
assert.ok(merchantMarkup, 'Merchant mode template must exist');
assert.ok(
  merchantMarkup.includes('class="uk-form-icon uk-link-reset uk-link-muted merchant-mode-symbol-icon"') &&
  merchantMarkup.includes('viewBox="0 0 620 820"'),
  'Merchant amount input must contain a real, visible double-stroke SVG'
);
assert.equal(
  (merchantMarkup.match(/class="merchant-mode-currency-symbol"/g) || []).length,
  4,
  'Expected official nano text symbol for unspecified, requested, partial and received amounts'
);
assert.equal(
  (merchantMarkup.match(/role="img" aria-label="nano \(XNO\)">Ӿ<\/span>/g) || []).length,
  4,
  'Each nano amount symbol must have the accessible nano (XNO) label'
);
assert.ok(
  merchantMarkup.includes("'ui-receive.merchant-amount-placeholder' | transloco"),
  'Merchant amount placeholder must use its localized nano symbol label'
);
for (const key of ['merchant-summary-requested', 'merchant-summary-paid']) {
  assert.ok(
    merchantMarkup.includes("('ui-receive." + key + "' | transloco) + ': Ӿ '"),
    'Clipboard payment summary must prefix amounts with U+04FE: ' + key
  );
}
assert.equal(
  (merchantMarkup.match(/\+ ' \(XNO\)'/g) || []).length, 2,
  'Keep ISO 4217 ticker XNO in copied text for interoperability'
);
console.log('Merchant-mode Nano currency symbol validated: U+04FE');
