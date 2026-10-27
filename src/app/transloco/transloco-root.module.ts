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
          { id: 'es', label: 'Español' }
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
