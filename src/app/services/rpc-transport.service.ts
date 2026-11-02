import { Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { secureEndpoint } from './endpoint-policy';

// XHR follows redirects automatically. Fetch lets us reject them BEFORE another
// endpoint receives a wallet query or its Authorization header.
@Injectable({ providedIn: 'root' })
export class RpcTransportService {
  post(url: string, payload: any, options: { headers?: HttpHeaders }): Observable<any> {
    return new Observable(observer => {
      const controller = new AbortController();
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const rpcHeaders = options.headers;
      if (rpcHeaders) {
        rpcHeaders.keys().forEach(key => {
          const value = rpcHeaders.get(key);
          if (value !== null) headers.set(key, value);
        });
      }
      fetch(secureEndpoint(url, 'rpc'), {
        method: 'POST', body: JSON.stringify(payload), headers,
        redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal
      }).then(async response => {
        let body: any;
        try { body = await response.json(); } catch (_) {
          // Gateways often return 502/503/504 with an HTML error page.
          // Preserve the HTTP status so ApiService can rotate to another node.
          // Only malformed successful replies are validation failures.
          if (!response.ok) {
            throw { status: response.status, error: 'Non-JSON HTTP error response' };
          }
          throw { status: response.status, isValidationFailure: true };
        }
        if (!response.ok) throw { status: response.status, error: body };
        observer.next(body);
        observer.complete();
      }).catch(error => observer.error(error));
      return () => controller.abort();
    });
  }
}
