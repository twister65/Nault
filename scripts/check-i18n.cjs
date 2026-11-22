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
const languages = ['fr', 'es', 'de', 'zh-HK', 'nb', 'da', 'nl', 'fi', 'pt-BR', 'it', 'ja', 'ko', 'zh-CN'];
for (const language of languages) {
  const translation = flatten(read(language));
  assert.deepEqual(Object.keys(translation).sort(), Object.keys(en).sort(), language + ': missing or extra translation keys');
  for (const [key, reference] of Object.entries(en)) {
    const localized = translation[key];
    assert(localized.trim().length > 0, language + ': empty label: ' + key);
    assert.deepEqual(placeholders(localized), placeholders(reference), language + ': interpolation mismatch: ' + key);
    // The Nano single-stroke currency glyph is a Cyrillic letter by Unicode
    // classification: never let translators turn it into a Han/Kana/Hangul character.
    if (['ja', 'ko', 'zh-CN', 'zh-HK'].includes(language)) {
      assert.equal(
        (localized.match(/Ӿ/g) || []).length,
        (reference.match(/Ӿ/g) || []).length,
        language + ': modified the Nano U+04FE sign: ' + key
      );
    }
    // Sentence fragments surrounding HTML links must retain their whitespace.
    if (reference.endsWith(' ')) assert(localized.endsWith(' '), language + ': missing trailing space: ' + key);
    if (reference.startsWith(' ')) assert(localized.startsWith(' '), language + ': missing leading space: ' + key);
  }
  console.log('Translation validated: ' + language + ', ' + Object.keys(translation).length + ' entries');
}

// Bluetooth SIG permits translations of its word mark only for Chinese,
// Japanese and Korean. Keep the ® on prominent Latin-script actions, never
// attach ® to the unregistered Simplified Chinese translation (蓝牙).
// An ownership footnote is not a claim that Nault holds a trademark license.
const bluetoothNames = {
  'zh-HK': '藍牙', 'zh-CN': '蓝牙', ja: 'ブルートゥース', ko: '블루투스'
};
for (const language of ['en', ...languages]) {
  const strings = read(language);
  const wallet = strings['ui-wallet-setup'];
  const ledger = strings['ui-ledger'];
  const notice = strings['ui-notifications']['bluetooth-unavailable'];
  const expectedWordMark = bluetoothNames[language] || 'Bluetooth®';
  assert.ok(
    wallet['connect-bluetooth'].includes(expectedWordMark) &&
    ledger['reconnect-via-bluetooth'].includes(expectedWordMark) &&
    notice.includes(expectedWordMark),
    language + ': unsupported or missing Bluetooth word mark in a prominent action/notice'
  );
  if (language === 'zh-CN') {
    assert.doesNotMatch(wallet['connect-bluetooth'], /®/,
      'Do not claim registration for Simplified Chinese 蓝牙');
  }
  const footnote = wallet['bluetooth-trademark-attribution'];
  assert.ok(
    footnote.includes('Bluetooth®') && footnote.includes('Bluetooth SIG, Inc.'),
    language + ': missing Bluetooth SIG ownership attribution'
  );
}
const walletSetupMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'components', 'configure-wallet', 'configure-wallet.component.html'), 'utf8'
);
assert.ok(
  walletSetupMarkup.includes("'ui-wallet-setup.bluetooth-trademark-attribution' | transloco") &&
  walletSetupMarkup.includes("selectedImportOption === 'ledger'"),
  'The Ledger wallet configuration must display the Bluetooth ownership footnote'
);
console.log('Bluetooth SIG word marks and attribution validated in all 14 languages');

// Preserve the selected fiat currency code beside each converted sidebar balance.
const sidebarMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'app.component.html'), 'utf8'
);
assert.equal(
  (sidebarMarkup.match(/<span class="estimate-symbol">~<\/span>\{\{ settings\.settings\.displayCurrency \}\}/g) || []).length,
  2,
  'Keep the selected fiat currency code visible in both sidebar balance cards'
);

// Official, language-dependent Nano "accepted here" badge is displayed
// above the QR code. Keep currency glyphs only beside numeric amounts.
const merchantMarkup = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'components', 'receive', 'receive.component.html'), 'utf8'
).split('<div class="merchant-mode-overlay"')[1];
const receiveSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', 'components', 'receive', 'receive.component.ts'), 'utf8'
);
assert.ok(merchantMarkup, 'Merchant mode template must exist');
assert.ok(
  merchantMarkup.includes('class="merchant-mode-accepted-badge"') &&
  merchantMarkup.includes('[src]="merchantModeAcceptedBadgeUrl"') &&
  merchantMarkup.includes("'ui-receive.merchant-accepted-badge-alt' | transloco"),
  'Merchant checkout must use an official Nano accepted-here badge'
);
assert.doesNotMatch(
  merchantMarkup, /ui-receive\.merchant-send-xno|class="merchant-mode-nano-circle-badge"/,
  'Legacy merchant heading and old tiny circle badge must be removed'
);
const badgeUrlMatches = [...receiveSource.matchAll(/https:\/\/[^\s"'`]+\.svg/g)].map(match => match[0]);
const hasOfficialBadgeUrl = badgeUrlMatches.some(urlText => {
  try {
    const parsed = new URL(urlText);
    return (
      parsed.protocol === 'https:' &&
      parsed.host === 'assets.nano.org' &&
      parsed.pathname.startsWith('/img/badges/blue-') &&
      parsed.pathname.endsWith('-var1.svg')
    );
  } catch {
    return false;
  }
});
assert.ok(
  hasOfficialBadgeUrl &&
  receiveSource.includes('const NANO_MERCHANT_BADGE_CODES') &&
  receiveSource.includes("ko: ['kr', 'ko']") &&
  receiveSource.includes("ja: ['jp', 'ja']") &&
  receiveSource.includes("'pt-BR': ['pt-br', 'br']") &&
  receiveSource.includes("'zh-HK': ['zh-hk']") &&
  receiveSource.includes("'zh-CN': ['zh-cn', 'cn']") &&
  receiveSource.includes("merchantModeBadgeCandidateIndex++") &&
  merchantMarkup.includes('(error)="merchantModeHandleBadgeLoadError()"'),
  'Use locale-specific official Nano badges with resilient translated fallback'
);
assert.ok(
  merchantMarkup.includes('src="assets/img/nano-circle-badge-blue.svg"') &&
  merchantMarkup.includes('merchantModeAcceptedBadgeLoadFailed'),
  'Provide a local offline image fallback'
);
assert.doesNotMatch(
  merchantMarkup, />\x58NO<| \(\x58NO\)|\/ \x58NO/,
  'Merchant payment content should display Nano symbols, not the obsolete ticker'
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
for (const language of ['en', ...languages]) {
  const labels = read(language)['ui-receive'];
  assert.ok(
    labels['merchant-amount-placeholder'].includes('Ӿ'),
    language + ': merchant amount placeholder should display the Nano symbol'
  );
  assert.ok(
    labels['merchant-accepted-badge-alt']?.trim(),
    language + ': the official badge needs accessible translated alternative text'
  );
}
assert.equal(read('fr')['ui-receive']['merchant-accepted-badge-alt'], 'Nano accepté ici');
assert.equal(read('en')['ui-receive']['merchant-accepted-badge-alt'], 'Nano accepted here');
assert.equal(read('zh-HK')['ui-receive']['merchant-accepted-badge-alt'], '這裏接受 Nano');
for (const key of ['merchant-summary-requested', 'merchant-summary-paid']) {
  assert.ok(
    merchantMarkup.includes("('ui-receive." + key + "' | transloco) + ': Ӿ '"),
    'Copied payment summary should prefix amounts with U+04FE: ' + key
  );
}
// Distinct translations prevent an accidental English-only dictionary masquerading
// as Hong Kong Chinese while allowing untranslatable product names and URLs.
const zhHK = flatten(read('zh-HK'));
const untranslated = Object.keys(en).filter(key => zhHK[key] === en[key]);
assert.deepEqual(untranslated, [
  'configure-app.this-has-to-be-a-valid-work.2-link-work',
  'welcome.any-node-always-available.1.2-link-nault'
], 'Unexpected untranslated Hong Kong Chinese labels');
console.log('Official localized Nano accepted-here badge and currency symbol validated');
