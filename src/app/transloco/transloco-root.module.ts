import { TranslocoLoader, TranslocoModule, provideTransloco } from '@jsverse/transloco';
import { Injectable, NgModule } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor() {}

  getTranslation(lang: string) {
    return import(/* webpackChunkName: "translation" */ `../../assets/i18n/${lang}.json`).then(res => res.default);
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
          // { id: 'de', label: 'Deutsch' }
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
