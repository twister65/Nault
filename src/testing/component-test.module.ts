import { NgModule } from '@angular/core';
import { HttpClientTestingModule, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { EMPTY } from 'rxjs';
import { AppModule } from '../app/app.module';
import { LedgerService } from '../app/services/ledger.service';
import { MusigService } from '../app/services/musig.service';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

// Use the application's actual declarations and DI graph. No permissive schemas
// or mocked components: invalid templates and missing providers still fail.
@NgModule({ exports: [AppModule, HttpClientTestingModule, RouterTestingModule], imports: [AppModule, RouterTestingModule], providers: [provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting()] })
export class ComponentTestModule {}

// Constructor smoke tests must not probe hardware or fetch/instantiate WASM.
// Lifecycle and behavior tests configure their own explicit boundary doubles.
export function isolateConstructorIO() {
  spyOn(LedgerService.prototype, 'checkBrowserSupport').and.returnValue(Promise.resolve());
  spyOn(MusigService.prototype, 'getWASM').and.returnValue(EMPTY);
}
