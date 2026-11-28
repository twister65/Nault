import { TranslocoLoader, TranslocoModule, provideTransloco } from '@jsverse/transloco';
import { Injectable, NgModule } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor() {}

  getTranslation(lang: string) {
    // Static imports ensure Angular's esbuild application builder creates a
    // separate lazy-loaded chunk for every supported language.
    switch (lang) {
      case 'fr': return import('../../assets/i18n/fr.json').then(res => res.default);
      case 'es': return import('../../assets/i18n/es.json').then(res => res.default);
      case 'de': return import('../../assets/i18n/de.json').then(res => res.default);
      case 'zh-HK': return import('../../assets/i18n/zh-HK.json').then(res => res.default);
      case 'nb': return import('../../assets/i18n/nb.json').then(res => res.default);
      case 'da': return import('../../assets/i18n/da.json').then(res => res.default);
      case 'nl': return import('../../assets/i18n/nl.json').then(res => res.default);
      case 'fi': return import('../../assets/i18n/fi.json').then(res => res.default);
      case 'pt-BR': return import('../../assets/i18n/pt-BR.json').then(res => res.default);
      case 'it': return import('../../assets/i18n/it.json').then(res => res.default);
      case 'ja': return import('../../assets/i18n/ja.json').then(res => res.default);
      case 'ko': return import('../../assets/i18n/ko.json').then(res => res.default);
      case 'zh-CN': return import('../../assets/i18n/zh-CN.json').then(res => res.default);
      default: return import('../../assets/i18n/en.json').then(res => res.default);
    }
  }
}

@NgModule({
  exports: [ TranslocoModule ],
  providers: [
    // Transloco 8 needs its complete provider set, not only the config and loader
    // tokens. AppComponent and AppSettingsService inject TranslocoService at startup.
    provideTransloco({
      config: {
        availableLangs: [
          { id: 'en', label: 'English' },
          { id: 'fr', label: 'Français' },
          { id: 'es', label: 'Español' },
          { id: 'de', label: 'Deutsch' },
          { id: 'zh-HK', label: '繁體中文（香港）' },
          { id: 'nb', label: 'Norsk bokmål' },
          { id: 'da', label: 'Dansk' },
          { id: 'nl', label: 'Nederlands' },
          { id: 'fi', label: 'Suomi' },
          { id: 'pt-BR', label: 'Português (Brasil)' },
          { id: 'it', label: 'Italiano' },
          { id: 'ja', label: '日本語' },
          { id: 'ko', label: '한국어' },
          { id: 'zh-CN', label: '简体中文' }
        ],
        defaultLang: 'en',
        fallbackLang: 'en',
        missingHandler: {
          useFallbackTranslation: true
        },
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader
    })
  ]
})
export class TranslocoRootModule {}
