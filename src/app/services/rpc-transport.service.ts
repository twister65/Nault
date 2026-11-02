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
      // Distinguish a fetch rejection before any HTTP response (DNS, TLS,
      // connection refusal, browser network error) from an invalid response.
      // Browser engines and Electron can report these as different error
      // classes; the absence of an HTTP response is the reliable boundary.
      let receivedResponse = false;
      fetch(secureEndpoint(url, 'rpc'), {
        method: 'POST', body: JSON.stringify(payload), headers,
        redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal
      }).then(async response => {
        receivedResponse = true;
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
        if (!response.ok) {
          // A Nano RPC action refusal is not a node outage even if a proxy
          // wraps it in HTTP 5xx. Conversely, gateways can return a JSON
          // { error: "Bad Gateway" } body: that is transport failure, not
          // an unsupported Nano RPC action. Keep the HTTP status in both
          // cases so ApiService can make the correct failover decision.
          const errorMessage = body !== null && typeof body === 'object' &&
            typeof body.error === 'string' ? body.error : null;
          const gatewayResponse = response.status >= 500 && errorMessage !== null &&
            /\b(?:bad gateway|gateway[\s-]*time[\s-]*out|service(?: temporarily)? unavailable|upstream(?: connect| request| server| timed| timeout)|proxy error)\b/i
              .test(errorMessage);
          throw { status: response.status, error: body,
            isRpcError: errorMessage !== null && !gatewayResponse };
        }
        observer.next(body);
        observer.complete();
      }).catch(error => {
        if (!receivedResponse) {
          observer.error({ status: 0, error: 'RPC network failure before HTTP response', cause: error });
        } else {
          observer.error(error);
        }
      });
      return () => controller.abort();
    });
  }
}
