import { TranslocoHttpLoader } from './transloco-root.module';

describe('TranslocoHttpLoader', () => {
  const loader = new TranslocoHttpLoader();

  it('loads English, French, Spanish and German settings using separate chunks', async () => {
    const [en, fr, es, de] = await Promise.all([
      loader.getTranslation('en'),
      loader.getTranslation('fr'),
      loader.getTranslation('es'),
      loader.getTranslation('de')
    ]);

    expect(en['general']['settings']).toBe('Settings');
    expect(fr['general']['settings']).toBe('Paramètres');
    expect(es['general']['settings']).toBe('Ajustes');
    expect(de['general']['settings']).toBe('Einstellungen');
    expect(de['ui-notifications']['node-failover']).toContain('{{previous}}');
    expect(de['ui-notifications']['node-failover']).toContain('{{next}}');

    expect(fr['configure-app']['pow-options']['client-side-gpu-webgl']).toContain('GPU/WebGL');
    expect(es['configure-app']['pending-options']['automatic-largest-amount-first'])
      .toContain('Automático');
  });

  it('loads all new dictionaries with the same wallet translation keys', async () => {
    const languages = ['nb', 'da', 'nl', 'fi', 'pt-BR', 'it', 'ja', 'ko', 'zh-CN'];
    const english = await loader.getTranslation('en');
    const englishKeys = Object.keys(english);
    for (const language of languages) {
      const dictionary = await loader.getTranslation(language);
      expect(Object.keys(dictionary)).toEqual(englishKeys);
      expect(dictionary['general']['settings']).toBeTruthy();
      expect(dictionary['ui-receive']['merchant-amount-placeholder']).toContain('Ӿ');
      expect(dictionary['ui-receive']['merchant-accepted-badge-alt']).toBeTruthy();
    }
    const [simplified, traditional, japanese, korean] = await Promise.all([
      loader.getTranslation('zh-CN'),
      loader.getTranslation('zh-HK'),
      loader.getTranslation('ja'),
      loader.getTranslation('ko')
    ]);
    expect(simplified['general']['settings']).toBe('设置');
    expect(traditional['general']['settings']).toBe('設定');
    expect(japanese['general']['settings']).toBe('設定');
    expect(korean['general']['settings']).toBe('설정');
  });

  it('falls back to English for an unsupported language', async () => {
    const result = await loader.getTranslation('unsupported');
    expect(result['general']['settings']).toBe('Settings');
  });
});
