import { Injectable, Optional } from '@angular/core';
import { RpcTransportService } from './rpc-transport.service';
import { secureEndpoint } from './endpoint-policy';
import { catchError, map, takeUntil, timeout } from 'rxjs/operators';
import { EMPTY, concat, firstValueFrom, timer } from 'rxjs';
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
  // Parallel wallet reads, WS-triggered probes and optional node statistics may
  // settle out of order. A late failure must not undo a newer successful RPC.
  private successfulRpcResponses = 0;
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

  private noteRpcSuccess(endpoint: string, generation: number): void {
    if (this.appSettings.settings.serverAPI !== endpoint ||
        this.node.internetInterruptionGeneration !== generation) return;
    this.successfulRpcResponses++;
    this.node.setOnline();
  }

  private noteRpcFailure(
    endpoint: string, generation: number, successVersionAtStart: number,
    message?: string | null
  ): void {
    if (this.appSettings.settings.serverAPI !== endpoint ||
        this.node.internetInterruptionGeneration !== generation ||
        this.successfulRpcResponses !== successVersionAtStart) {
      console.info('[Nano RPC health] Ignoring stale failure after RPC success, network or server change.');
      return;
    }
    this.node.setOffline(message);
  }

  // Try scored nodes in rank order. If the best RPC rejects this wallet
  // action, try the next; never select the fastest response of an unranked
  // race. Normal wallet RPC, signed process and PoW retain their safeguards.
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
      timeout(3000),
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
    // A single 10-second budget bounds all ranked fallback attempts.
    let selected: { endpoint: string; response: any };
    try {
      selected = await firstValueFrom(concat(...sources).pipe(takeUntil(timer(10000))));
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
    this.noteRpcSuccess(selected.endpoint, expectedNetworkGeneration);
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
    const successVersionAtStart = this.successfulRpcResponses;
    // work_generate has its own availability/fallback lifecycle. Its failures
    // must never clear or set the wallet's Nano RPC/WebSocket status.
    const isPoW = action === 'work_generate';
    const firstUrl = url || settings.serverAPI;
    // A request can finish after a local Internet interruption or after
    // another RPC request has switched the selected node. Its result must
    // never mark the new/current node online or offline.
    // A signed process response may prove publication even if the user loses
    // connectivity immediately afterwards. Never discard that result or
    // encourage manual resubmission because of a later network transition.
    const obsoleteSelectedRequest = (): boolean =>
      !url && action !== 'process' && action !== 'work_generate' && (
        this.appSettings.settings.serverAPI !== firstUrl ||
        this.node.internetInterruptionGeneration !== expectedNetworkGeneration
      );
    if (!firstUrl) {
      if (isPoW) throw new Error('No work server configured.');
      this.node.setOffline(null);
      return;
    }
    let apiUrl: string;
    try { apiUrl = secureEndpoint(firstUrl, 'rpc'); } catch (error) {
      if (!isPoW) this.noteRpcFailure(firstUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : 'Unsafe server address: use HTTPS (HTTP is allowed only on loopback).');
      if (skipError) return;
      throw error;
    }
    const endpoints = [apiUrl];
    // Rotate known built-in or locally saved WSS-capable unauthenticated
    // endpoints. Never replay signed blocks, work generation or optional calls;
    // authenticated local RPCs must remain pinned to their selected endpoint.
    const knownSource = this.appSettings.serverOptions?.find(server =>
      server.allowFailover && !!server.ws && !server.auth &&
      server.api === firstUrl &&
      (settings.serverName === 'random' || server.value === settings.serverName));
    if (!url && !skipError && allowFailover && !this.node.internetRecoveryPending &&
        action !== 'process' && action !== 'work_generate' &&
        knownSource && (settings.serverName === 'random' || settings.serverName === knownSource.value)) {
      const candidates: string[] = [];
      for (const server of this.appSettings.serverOptions || []) {
        if (!server.allowFailover || server.failoverTarget === false ||
            !server.api || !server.ws || server.auth) continue;
        try {
          const candidate = secureEndpoint(server.api, 'rpc');
          if (candidate !== apiUrl && !candidates.includes(candidate)) candidates.push(candidate);
        } catch (_) { /* Ignore insecure or invalid candidates. */ }
      }
      // The scan runs in the background and does not hold up first launch.
      // Until it completes, retain deterministic candidate order. Afterward,
      // only proven or explicitly unverified (insufficient peers) candidates
      // may be selected; never fall back randomly to a known lagging node.
      const ranked = this.appSettings.getRankedFallbackEndpoints?.(apiUrl);
      endpoints.push(...(ranked === null || ranked === undefined
        ? candidates : ranked.filter(endpoint => candidates.includes(endpoint))));
    }
    if (healthProbe) {
      // Public endpoint counts only, not wallet data or RPC authentication.
      // Helps distinguish no eligible alternatives from failed alternatives
      // when Chromium Console displays only failed network requests.
      console.info('[Nano RPC health] Candidate pool:', {
        selected: settings.serverName, totalEndpoints: endpoints.length
      });
    }
    if (!isPoW && this.node.node.status === false && !skipError) this.node.setLoading();
    // Includes legacy compatibility calls; PoW gets one longer, cancellable attempt.
    // A 3-second probe of up to five servers has a strict 15-second ceiling.
    // Ordinary wallet RPC retains its original 45-second and 3-attempt limits.
    const maxAttempts = healthProbe ? this.maxHealthProbeEndpoints : 3;
    const deadline = Date.now() + (healthProbe ? 15000 : isPoW ? perAttemptTimeoutMs : 45000);
    let attempts = 0;
    let lastError: any;
    for (const endpoint of endpoints.slice(0, maxAttempts)) {
      let requestAction = action;
      while (attempts < maxAttempts && Date.now() < deadline) {
        attempts++;
        const options: any = { responseType: 'json' };
        // Explicit work servers never inherit RPC credentials, even at the same origin.
        const localSelection = this.appSettings.serverOptions?.some(server =>
          server.value === settings.serverName && server.isLocal);
        if (!url && (settings.serverName === 'custom' || localSelection) &&
            endpoint === apiUrl && settings.serverAuth) {
          options.headers = new HttpHeaders().set('Authorization', settings.serverAuth);
        }
        try {
          const remaining = deadline - Date.now();
          const res = await this.http.post(endpoint, { ...data, action: requestAction }, options)
            .pipe(timeout(Math.max(1, Math.min(perAttemptTimeoutMs, remaining)))).toPromise();
          if (obsoleteSelectedRequest()) {
            if (skipError) return;
            throw { isStaleFailover: true };
          }
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
            // An optional statistics RPC is not proof wallet reads work.
            if (!skipError && !isPoW) this.noteRpcSuccess(endpoint, expectedNetworkGeneration);
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
            console.info('[Nano RPC health] Failover activated:', {
              from: settings.serverName, to: endpoint, action,
            });
          }
          // An optional statistics RPC is not proof wallet reads work.
          if (!skipError && !isPoW) this.noteRpcSuccess(endpoint, expectedNetworkGeneration);
          return res;
        } catch (error) {
          lastError = error;
          if (obsoleteSelectedRequest()) {
            if (skipError) return;
            throw { isStaleFailover: true };
          }
          if (skipError) return;
          const legacy = this.legacyReceivableAction(requestAction, error);
          if (legacy && attempts < 3) {
            requestAction = legacy;
            continue;
          }
          const failure = error && typeof error === 'object'
            ? error as { isValidationFailure?: boolean; isRpcError?: boolean; isStaleFailover?: boolean; status?: number; name?: string }
            : {};
          if (endpoint === apiUrl && !skipError &&
              (action === 'accounts_balances' || action === 'accounts_frontiers')) {
            // Log the failing action and transport status without exposing
            // account addresses, RPC payloads, credentials or block contents.
            console.info('[Nano RPC health] Wallet read failure:', {
              action, selected: settings.serverName, status: failure.status ?? null,
              reason: failure.name === 'TimeoutError' ? 'timeout' :
                failure.isRpcError ? 'rpc-error' :
                failure.isValidationFailure ? 'invalid-response' : 'network',
              recoveryPending: this.node.internetRecoveryPending,
              fallbackEligible: endpoints.length > 1
            });
          }
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
            // A valid HTTP error response (authorization, unsupported action,
            // malformed RPC payload) is not proof that the node is offline.
            // The caller still receives the failure and can warn that wallet
            // balances need refreshing, but we do not show a false DNS alert.
            const remoteResponded = failure.isRpcError || failure.isValidationFailure ||
              (typeof failure.status === 'number' &&
                failure.status >= 400 && failure.status < 500);
            if (!remoteResponded && !failure.isStaleFailover) {
              if (!isPoW) this.noteRpcFailure(apiUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : undefined);
            }
            throw error;
          }
          // An Ethernet outage is not an RPC-node outage. Hold the current
          // server throughout this offline/online transition.
          if (endpoint === apiUrl && await this.internetDisconnected()) {
            this.markInternetDisconnected();
            if (!isPoW) this.noteRpcFailure(apiUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : undefined);
            throw { status: 0, isInternetDisconnected: true };
          }
          if (endpoint === apiUrl && this.node.internetRecoveryPending) {
            // Physical network has returned, but the selected RPC has not
            // answered. Report the RPC error instead of asserting that the
            // cable is still disconnected; recovery keeps the same endpoint.
            if (healthProbe) console.info(
              '[Nano RPC health] Selected RPC still unresponsive after link restoration:', endpoint);
            if (!isPoW) this.noteRpcFailure(apiUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : undefined);
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
              if (!obsoleteSelectedRequest() &&
                  !(fallbackError && typeof fallbackError === 'object' &&
                    'isStaleFailover' in fallbackError && fallbackError.isStaleFailover)) {
                if (!isPoW) this.noteRpcFailure(apiUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : undefined);
              }
              throw fallbackError;
            }
          }
          break;
        }
      }
    }
    if (obsoleteSelectedRequest()) throw { isStaleFailover: true };
    if (!isPoW) this.noteRpcFailure(apiUrl, expectedNetworkGeneration, successVersionAtStart, silentOffline ? null : (lastError && lastError.status === 429
      ? 'Too Many Requests to the node. Try again later or choose another node.'
      : 'RPC unavailable. Retry later or choose another node.'));
    throw lastError || new Error('RPC request deadline exceeded.');
  }

  // Bounded transport/availability check on the selected RPC, independent
  // of the wallet. Never send an artificial account or wallet data to peers.
  // Real account RPCs are validated separately by the wallet service.
  checkNodeAvailability(silentOffline = false, allowFailover = true): Promise<void> {
    const endpoint = this.appSettings.settings.serverAPI;
    if (allowFailover && this.pendingHealthCheck?.endpoint === endpoint) return this.pendingHealthCheck.promise;
    // A WebSocket outage does not imply the wallet RPC is unavailable.
    // Never probe an artificial account here: some healthy proxies reject it
    // or take too long, producing a false offline warning 30–60s after start.
    // Real wallet reads still validate accounts_balances with real accounts.
    const validateHealth = (res: any): { err: string | null } => ({
      err: res && (typeof res.count === 'string' || typeof res.count === 'number') &&
        /^[0-9]+$/.test(String(res.count)) ? null : 'Invalid block_count response'
    });
    const promise = this.request('block_count', { include_cemented: 'true' },
      false, '', validateHealth, 5000, silentOffline, true, allowFailover)
      .then(() => undefined);
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
  async workGenerate(hash: string, difficulty: string, workServer = '', timeoutMs = 120000): Promise<{ work: string }> {
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

    // Always propagate PoW failures to PowService; do not silently swallow
    // explicit work-server errors or turn them into wallet RPC outages.
    return await this.request('work_generate', { hash, difficulty }, false, workServer, validateResponse, timeoutMs);
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
