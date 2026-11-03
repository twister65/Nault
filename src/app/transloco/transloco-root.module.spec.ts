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

  it('falls back to English for an unsupported language', async () => {
    const result = await loader.getTranslation('unsupported');
    expect(result['general']['settings']).toBe('Settings');
  });
});
