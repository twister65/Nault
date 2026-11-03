import { Injectable, Optional } from '@angular/core';
import { RpcTransportService } from './rpc-transport.service';
import { secureEndpoint } from './endpoint-policy';
import { catchError, map, timeout } from 'rxjs/operators';
import { EMPTY, firstValueFrom, merge } from 'rxjs';
import { HttpHeaders } from '@angular/common/http';
import {NodeService} from './node.service';
import {AppSettingsService} from './app-settings.service';
import { TxType } from './util.service';
import { DesktopService } from './desktop.service';

@Injectable()
export class ApiService {
  storeKey = `nanovault-active-difficulty`;
  // A failed WS handshake and a manual server save may ask for the same
  // health check concurrently. Share one request per selected endpoint.
  private pendingHealthCheck: { endpoint: string | null; promise: Promise<void> } | null = null;
  // Wallet RPC reads keep their existing three-attempt budget. An isolated
  // background health probe may check every eligible built-in fallback so
  // random choice does not omit the only working node.
  private readonly maxHealthProbeEndpoints = 5;
  constructor(private http: RpcTransportService, private node: NodeService,
    private appSettings: AppSettingsService, @Optional() private desktop?: DesktopService) { }

  // Chromium's fetch TypeError does not reliably expose
  // net::ERR_INTERNET_DISCONNECTED versus net::ERR_NAME_NOT_RESOLVED.
  // False from either renderer or native Electron means local offline.
  // True does NOT prove any particular remote host is available.
  private async internetDisconnected(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return (await this.desktop?.isNetworkOnline()) === false;
  }

  private markInternetDisconnected(): void {
    this.node.markInternetInterrupted();
    console.info('[Nano RPC health] Internet disconnected; preserving selected server.');
  }

  // Kept separate to test selection deterministically without mocking
  // Math.random globally (which can disrupt Jasmine and Zone.js internals).
  private randomFallbackIndex(lastIndex: number): number {
    return Math.floor(Math.random() * (lastIndex + 1));
  }

  // Only anonymous, synthetic availability checks may run concurrently.
  // Aborts pending backup requests as soon as the first valid response wins.
  // Normal wallet RPC (including signed process and PoW) remains sequential
  // with its established attempt budget and cannot enter this method.
  private async probeHealthyBackup(
    candidates: string[],
    requestAction: string,
    requestData: Record<string, unknown>,
    validateResponse: (res: any) => { err: string | null },
    expectedName: string,
    expectedUrl: string,
    expectedNetworkGeneration: number
  ): Promise<any> {
    let lastFailure: any = new Error('No responsive Nano RPC fallback');
    const sources = candidates.map(endpoint => this.http.post(endpoint,
      { ...requestData, action: requestAction }, { responseType: 'json' } as any).pipe(
      timeout(10000),
      map(res => {
        if (res && typeof res.error === 'string') {
          throw { isRpcError: true, error: res.error };
        }
        if (validateResponse(res).err != null) {
          throw { isValidationFailure: true };
        }
        return { endpoint, response: res };
      }),
      catchError(error => {
        lastFailure = error;
        const failure = error && typeof error === 'object'
          ? error as { status?: number; name?: string; isRpcError?: boolean; isValidationFailure?: boolean }
          : {};
        console.info('[Nano RPC health] Probe failed:', endpoint, {
          status: failure.status ?? null,
          reason: failure.isRpcError ? 'rpc-error' :
            failure.isValidationFailure ? 'invalid-response' :
            failure.name === 'TimeoutError' ? 'timeout' : 'network'
        });
        return EMPTY;
      })
    ));
    for (const endpoint of candidates) {
      console.info('[Nano RPC health] Trying fallback:', endpoint);
    }
    // firstValueFrom unsubscribes the other requests on the first valid
    // response. A single 10-second budget covers every public fallback.
    let selected: { endpoint: string; response: any };
    try {
      selected = await firstValueFrom(merge(...sources));
    } catch (_) {
      throw lastFailure;
    }
    // A backup may complete after the Ethernet cable is reconnected.
    // If the offline transition was observed, it must not replace the
    // selected server: first retry the original on network recovery.
    if (this.node.internetInterruptionGeneration !== expectedNetworkGeneration) {
      // A backup from before the outage is stale even after original recovery.
      throw { isStaleFailover: true };
    }
    if (this.node.internetRecoveryPending) {
      // Failover stays blocked until the link recovery completes. This is not
      // proof that the Internet is still disconnected.
      throw { isStaleFailover: true };
    }
    if (await this.internetDisconnected()) {
      this.markInternetDisconnected();
      throw { status: 0, isInternetDisconnected: true };
    }
    if (!this.appSettings.activateFailover(expectedName, expectedUrl, selected.endpoint)) {
      throw { isStaleFailover: true };
    }
    console.info('[Nano RPC health] Failover activated:', selected.endpoint);
    this.node.setOnline();
    return selected.response;
  }

  // Some public RPC proxies still whitelist the legacy pending action names.
  // Only retry when the proxy explicitly denies the modern action; never retry
  // unrelated errors or mutate transaction-processing requests.
  private legacyReceivableAction(action: string, error: any): string | null {
    const legacyAction = action === 'accounts_receivable' ? 'accounts_pending' :
      action === 'receivable' ? 'pending' : null;
    if (!legacyAction) return null;

    // Both HTTP 200 { error: "..." } and HTTP 4xx/5xx with a JSON error
    // payload can mean an older Nano proxy denied a newer RPC action.
    const reason = typeof error?.error === 'string' ? error.error : error?.error?.error;
    return typeof reason === 'string' && reason.trim() === `Action ${action} not allowed`
      ? legacyAction : null;
  }

  private async request(
    action: string,
    data: Record<string, unknown>,
    skipError: boolean,
    url = '',
    validateResponse?: (response: any) => { err: string | null },
    perAttemptTimeoutMs = 15000,
    silentOffline = false,
    healthProbe = false,
    allowFailover = true
  ): Promise<any> {
    // Snapshot settings: a pending request must not acquire another server's credentials.
    const settings = { ...this.appSettings.settings };
    const expectedNetworkGeneration = this.node.internetInterruptionGeneration;
    const firstUrl = url || settings.serverAPI;
    if (!firstUrl) {
      this.node.setOffline(null);
      return;
    }
    let apiUrl: string;
    try { apiUrl = secureEndpoint(firstUrl, 'rpc'); } catch (error) {
      this.node.setOffline(silentOffline ? null : 'Unsafe server address: use HTTPS (HTTP is allowed only on loopback).');
      if (skipError) return;
      throw error;
    }
    const endpoints = [apiUrl];
    // Rotate only trusted built-in RPC nodes on retryable network failures.
    // Never replay signed blocks, work generation, optional calls or custom RPC.
    const knownSource = this.appSettings.serverOptions?.find(server =>
      server.allowFailover && server.api === firstUrl);
    if (!url && !skipError && allowFailover && !this.node.internetRecoveryPending &&
        action !== 'process' && action !== 'work_generate' &&
        knownSource && (settings.serverName === 'random' || settings.serverName === knownSource.value)) {
      // Do not give the first entry in serverOptions an artificial priority.
      // Pick a randomized order without replacement for this failover cycle.
      // Keep the current server first, and exclude it and disabled/unsafe
      // candidates from the shuffled public pool.
      const candidates: string[] = [];
      for (const server of this.appSettings.serverOptions || []) {
        // SpyNano is temporarily selectable as a failing test node but must
        // never be chosen as a fallback target.
        if (!server.allowFailover || server.failoverTarget === false || !server.api) continue;
        try {
          const candidate = secureEndpoint(server.api, 'rpc');
          if (candidate !== apiUrl && !candidates.includes(candidate)) candidates.push(candidate);
        } catch (_) { /* Ignore insecure built-in candidates. */ }
      }
      // Fisher-Yates shuffle: each distinct eligible fallback can be tried
      // first, regardless of its order in serverOptions.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = this.randomFallbackIndex(i);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      endpoints.push(...candidates);
    }
    if (healthProbe) {
      // Public endpoint counts only, not wallet data or RPC authentication.
      // Helps distinguish no eligible alternatives from failed alternatives
      // when Chromium Console displays only failed network requests.
      console.info('[Nano RPC health] Candidate pool:', {
        selected: settings.serverName, totalEndpoints: endpoints.length
      });
    }
    if (this.node.node.status === false && !skipError) this.node.setLoading();
    // Includes legacy compatibility calls; PoW gets one longer, cancellable attempt.
    // A 3-second probe of up to five servers has a strict 15-second ceiling.
    // Ordinary wallet RPC retains its original 45-second and 3-attempt limits.
    const maxAttempts = healthProbe ? this.maxHealthProbeEndpoints : 3;
    const deadline = Date.now() + (healthProbe ? 15000 : action === 'work_generate' ? 120000 : 45000);
    let attempts = 0;
    let lastError: any;
    for (const endpoint of endpoints.slice(0, maxAttempts)) {
      let requestAction = action;
      while (attempts < maxAttempts && Date.now() < deadline) {
        attempts++;
        const options: any = { responseType: 'json' };
        // Explicit work servers never inherit RPC credentials, even at the same origin.
        if (!url && settings.serverName === 'custom' && endpoint === apiUrl && settings.serverAuth) {
          options.headers = new HttpHeaders().set('Authorization', settings.serverAuth);
        }
        try {
          const remaining = deadline - Date.now();
          const res = await this.http.post(endpoint, { ...data, action: requestAction }, options)
            .pipe(timeout(Math.max(1, Math.min(action === 'work_generate' ? 120000 : perAttemptTimeoutMs, remaining)))).toPromise();
          // Older public Nano nodes may reject the new RPC action in a JSON
          // response with HTTP 200. Retry its legacy alias on this same node;
          // never confuse a JSON RPC error with transport unavailability.
          if (res && typeof res.error === 'string') {
            const legacy = this.legacyReceivableAction(requestAction, res);
            if (legacy && attempts < 3) {
              requestAction = legacy;
              continue;
            }
            // Preserve the API's existing error response on the selected node,
            // but do not select a fallback that rejects this wallet action.
            if (endpoint !== apiUrl) throw { isRpcError: true, error: res.error };
            if (typeof validateResponse === 'function') {
              throw { isRpcError: true, error: res.error };
            }
            this.node.setOnline();
            return res;
          }
          if (typeof validateResponse === 'function' && validateResponse(res).err != null) {
            throw { isValidationFailure: true };
          }
          if (endpoint !== apiUrl && !url && !skipError) {
            if (this.node.internetInterruptionGeneration !== expectedNetworkGeneration) {
              throw { isStaleFailover: true };
            }
            if (this.node.internetRecoveryPending) {
              throw { isStaleFailover: true };
            }
            if (await this.internetDisconnected()) {
              this.markInternetDisconnected();
              throw { status: 0, isInternetDisconnected: true };
            }
            const activated = this.appSettings.activateFailover(settings.serverName, firstUrl, endpoint);
            // Reject a stale request if the user changed servers before the
            // backup responded. Never claim to be online on the wrong server.
            if (!activated) {
              console.info('[Nano RPC health] Backup responded but saved server changed; ignoring stale result.');
              throw { isStaleFailover: true };
            }
            if (healthProbe) console.info('[Nano RPC health] Failover activated:', endpoint);
          }
          this.node.setOnline();
          return res;
        } catch (error) {
          lastError = error;
          if (skipError) return;
          const legacy = this.legacyReceivableAction(requestAction, error);
          if (legacy && attempts < 3) {
            requestAction = legacy;
            continue;
          }
          const failure = error && typeof error === 'object'
            ? error as { isValidationFailure?: boolean; isRpcError?: boolean; isStaleFailover?: boolean; status?: number; name?: string }
            : {};
          if (healthProbe) {
            console.info('[Nano RPC health] Probe failed:', endpoint, {
              status: failure.status ?? null,
              reason: failure.isRpcError ? 'rpc-error' :
                failure.isValidationFailure ? 'invalid-response' :
                failure.isStaleFailover ? 'stale-selection' :
                failure.name === 'TimeoutError' ? 'timeout' : 'network'
            });
          }
          // JSON-RPC application errors show that the node answered; they are
          // not evidence of a DNS, connection or gateway failure. The same
          // applies to malformed successful JSON responses.
          const retryable = !failure.isValidationFailure && !failure.isRpcError &&
            (failure.status === 0 || failure.status === 408 || failure.status === 429 ||
             (typeof failure.status === 'number' && failure.status >= 500) ||
             failure.name === 'TimeoutError' || error instanceof TypeError);
          if (!retryable) {
            if (!failure.isRpcError && !failure.isStaleFailover) {
              this.node.setOffline(silentOffline ? null : undefined);
            }
            throw error;
          }
          // An Ethernet outage is not an RPC-node outage. Hold the current
          // server throughout this offline/online transition.
          if (endpoint === apiUrl && await this.internetDisconnected()) {
            this.markInternetDisconnected();
            this.node.setOffline(silentOffline ? null : undefined);
            throw { status: 0, isInternetDisconnected: true };
          }
          if (endpoint === apiUrl && this.node.internetRecoveryPending) {
            // Physical network has returned, but the selected RPC has not
            // answered. Report the RPC error instead of asserting that the
            // cable is still disconnected; recovery keeps the same endpoint.
            if (healthProbe) console.info(
              '[Nano RPC health] Selected RPC still unresponsive after link restoration:', endpoint);
            this.node.setOffline(silentOffline ? null : undefined);
            throw error;
          }
          if (healthProbe && endpoint === apiUrl && endpoints.length > 1 &&
              typeof validateResponse === 'function') {
            try {
              // The primary still has its fast 3-second DNS/connection check.
              // Check other public nodes concurrently for up to 10 seconds.
              // Sequential 3-second aborts were falsely rejecting every
              // candidate in the user's Electron Linux HAR.
              return await this.probeHealthyBackup(
                endpoints.slice(1, this.maxHealthProbeEndpoints), requestAction, data,
                validateResponse, settings.serverName, firstUrl,
                expectedNetworkGeneration
              );
            } catch (fallbackError) {
              // A late backup from an old network generation must not mark a
              // successfully recovered original node offline again.
              if (!(fallbackError && typeof fallbackError === 'object' &&
                'isStaleFailover' in fallbackError && fallbackError.isStaleFailover)) {
                this.node.setOffline(silentOffline ? null : undefined);
              }
              throw fallbackError;
            }
          }
          break;
        }
      }
    }
    this.node.setOffline(silentOffline ? null : (lastError && lastError.status === 429
      ? 'Too Many Requests to the node. Try again later or choose a different node.'
      : 'RPC unavailable. Retry later or choose another node.'));
    throw lastError || new Error('RPC request deadline exceeded.');
  }

  // A first-run wallet has no actual accounts to read. Its synthetic burn
  // address accounts_balances checks consistently timed out on *all* public
  // backups in the Windows HAR despite healthy block_count/version replies.
  // For silent (unconfigured-wallet) checks, test light RPC availability with
  // block_count instead. This checks endpoint liveness, NOT wallet capabilities:
  // real configured-wallet reads still require validated accounts_balances.
  // Neither check sends wallet data, credentials or signed transactions.
  checkNodeAvailability(silentOffline = false, allowFailover = true): Promise<void> {
    const endpoint = this.appSettings.settings.serverAPI;
    if (allowFailover && this.pendingHealthCheck?.endpoint === endpoint) return this.pendingHealthCheck.promise;
    const burnAccount = 'nano_1111111111111111111111111111111111111111111111111111hifc8npp';
    const healthAction = silentOffline ? 'block_count' : 'accounts_balances';
    const healthArgs = silentOffline ? { include_cemented: 'true' } : { accounts: [burnAccount] };
    const validateHealth = (res: any): { err: string | null } => ({
      err: silentOffline
        ? (res && (typeof res.count === 'string' || typeof res.count === 'number') &&
            /^\\d+$/.test(String(res.count)) ? null : 'Invalid block_count response')
        : (res && res.balances && typeof res.balances === 'object' && !Array.isArray(res.balances)
            ? null : 'Invalid accounts_balances response'),
    });
    const promise = this.request(healthAction, healthArgs, false, '', validateHealth,
      3000, silentOffline, true, allowFailover).then(() => undefined);
    const pending = { endpoint, promise };
    if (allowFailover) this.pendingHealthCheck = pending;
    // Never create an unhandled rejection from a .finally() cleanup.
    void promise.then(
      () => { if (this.pendingHealthCheck === pending) this.pendingHealthCheck = null; },
      () => { if (this.pendingHealthCheck === pending) this.pendingHealthCheck = null; }
    );
    return promise;
  }

  async accountsBalances(accounts: string[]): Promise<{balances: any }> {
    return await this.request('accounts_balances', { accounts }, false);
  }
  async accountsFrontiers(accounts: string[]): Promise<{frontiers: any }> {
    return await this.request('accounts_frontiers', { accounts }, false);
  }
  async accountsPending(accounts: string[], count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_receivable', { accounts, count, source: true, include_only_confirmed: true }, false);
  }
  async accountsPendingLimit(accounts: string[], threshold: string, count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_receivable', { accounts, count, threshold, source: true, include_only_confirmed: true }, false);
  }
  async accountsPendingSorted(accounts: string[], count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_receivable',
      { accounts, count, source: true, include_only_confirmed: true, sorting: true }, false
    );
  }
  async accountsPendingLimitSorted(accounts: string[], threshold: string, count: number = 50): Promise<{blocks: any }> {
    return await this.request('accounts_receivable',
      { accounts, count, threshold, source: true, include_only_confirmed: true, sorting: true }, false
    );
  }
  async delegatorsCount(account: string): Promise<{ count: string }> {
    return await this.request('delegators_count', { account }, false);
  }
  async representativesOnline(): Promise<{ representatives: Record<string, string>, error?: string } | null> {
    const settings = this.appSettings.settings;
    // A restricted public proxy may reject this optional RPC even though
    // balances, frontiers and WebSocket notifications are fully functional.
    // Match by endpoint as random mode keeps serverName === 'random'.
    const knownUnsupported = settings.serverName !== 'custom' &&
      this.appSettings.serverOptions?.some(server =>
        server.api === settings.serverAPI && server.supportsRepresentativesOnline === false);
    if (knownUnsupported) return null;

    // Optional representative metadata must not mark an otherwise healthy
    // wallet RPC server offline when an endpoint refuses the action.
    return (await this.request('representatives_online', { }, true)) || null;
  }

  // Nano Node can return JSON-encoded block contents, while RsNano returns a JSON object.
  // Keep the string shape expected by existing Nault callers using JSON.parse(contents).
  private normalizeBlockContents(blockInfo: any): void {
    if (blockInfo && blockInfo.contents !== null && typeof blockInfo.contents === 'object' && !Array.isArray(blockInfo.contents)) {
      blockInfo.contents = JSON.stringify(blockInfo.contents);
    }
  }
  async blocksInfo(blocks: string[]): Promise<{blocks: any, error?: string}> {
    const response = await this.request('blocks_info', { hashes: blocks, pending: true, source: true }, false);
    if (response && response.blocks && typeof response.blocks === 'object') {
      Object.keys(response.blocks).forEach(hash => this.normalizeBlockContents(response.blocks[hash]));
    }
    return response;
  }
  async blockInfo(hash: string): Promise<any> {
    const response = await this.request('block_info', { hash: hash }, false);
    this.normalizeBlockContents(response);
    return response;
  }
  async blockCount(): Promise<{count: number, unchecked: number, cemented: number }> {
    return await this.request('block_count', { include_cemented: 'true'}, false);
  }
  // Statistics are optional: restricted public proxies may reject block_count
  // while their wallet RPC is fully usable. Do not rotate nodes, mark them
  // offline or display wallet errors for dashboard-only metadata.
  async optionalBlockCount(): Promise<{count: number, unchecked: number, cemented: number } | null> {
    const result = await this.request('block_count', { include_cemented: 'true'}, true);
    // Some public proxies return HTTP 200 with a JSON RPC action denial.
    // Do not render "NaN" counters or claim statistics are available.
    return result && !result.error && result.count != null && result.cemented != null
      ? result : null;
  }
  async workGenerate(hash: string, difficulty: string, workServer = ''): Promise<{ work: string }> {
    const validateResponse = (res: {work?: unknown} | null): {err: string | null} => {
      if(!res || res.work == null) {
        return {
          err: `Missing field "work".`,
        };
      };

      if(typeof res.work !== 'string') {
        return {
          err: `Invalid type of field "work", expected "string", got "${ typeof res.work }".`,
        };
      };

      if(res.work.length !== 16) {
        return {
          err: `Invalid length of field "work", expected 16, got ${ res.work.length }.`,
        };
      };

      if( /^[0-9A-F]+$/i.test(res.work) === false ) {
        return {
          err: `Invalid contents of field "work", expected hex characters.`,
        };
      };

      return {
        err: null,
      };
    };

    return await this.request('work_generate', { hash, difficulty }, workServer !== '', workServer, validateResponse);
  }
  async process(block: unknown, subtype: TxType): Promise<{ hash: string, error?: string }> {
    return await this.request('process', { json_block: 'true', block, subtype: TxType[subtype] }, false);
  }
  async accountHistory(account: string, count = 25, raw = false, offset = 0, reverse = false): Promise<{history: any }> {
    // use unlimited count if 0
    if (count === 0) {
      return await this.request('account_history', { account, raw, offset, reverse}, false);
    } else {
      return await this.request('account_history', { account, count, raw, offset, reverse}, false);
    }
  }
  async accountInfo(account: string): Promise<any> {
    return await this.request('account_info', { account, pending: true, representative: true, weight: true }, false);
  }
  async pending(account: string, count: number): Promise<any> {
    return await this.request('receivable', { account, count, source: true, include_only_confirmed: true }, false);
  }
  async pendingLimit(account: string, count: number, threshold: string): Promise<any> {
    return await this.request('receivable', { account, count, threshold, source: true, include_only_confirmed: true }, false);
  }
  async pendingSorted(account: string, count: number): Promise<any> {
    return await this.request('receivable', { account, count, source: true, include_only_confirmed: true, sorting: true }, false);
  }
  async pendingLimitSorted(account: string, count: number, threshold: string): Promise<any> {
    return await this.request('receivable', { account, count, threshold, source: true, include_only_confirmed: true, sorting: true }, false);
  }
  async version(): Promise<{rpc_version: number, store_version: number, protocol_version: number, node_vendor: string, network: string,
    network_identifier: string, build_info: string }> {
    return await this.request('version', { }, true);
  }
  async confirmationQuorum(): Promise<{quorum_delta: string, online_weight_quorum_percent: number, online_weight_minimum: string,
    online_stake_total: string, trended_stake_total: string, peers_stake_total: string }> {
    return await this.request('confirmation_quorum', { }, true);
  }
  public deleteCache() {
    localStorage.removeItem(this.storeKey);
  }

}
