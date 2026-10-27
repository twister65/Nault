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
for (const language of ['fr', 'es']) {
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
