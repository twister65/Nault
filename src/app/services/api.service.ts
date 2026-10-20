import { Injectable } from '@angular/core';
import { RpcTransportService } from './rpc-transport.service';
import { secureEndpoint } from './endpoint-policy';
import { timeout } from 'rxjs/operators';
import { HttpHeaders } from '@angular/common/http';
import {NodeService} from './node.service';
import {AppSettingsService} from './app-settings.service';
import { TxType } from './util.service';

@Injectable()
export class ApiService {
  storeKey = `nanovault-active-difficulty`;
  constructor(private http: RpcTransportService, private node: NodeService, private appSettings: AppSettingsService) { }

  // Some public RPC proxies still whitelist the legacy pending action names.
  // Only retry when the proxy explicitly denies the modern action; never retry
  // unrelated errors or mutate transaction-processing requests.
  private legacyReceivableAction(action: string, error: any): string | null {
    const legacyAction = action === 'accounts_receivable' ? 'accounts_pending' :
      action === 'receivable' ? 'pending' : null;
    if (!legacyAction) return null;

    const reason = error && error.error && error.error.error;
    return typeof reason === 'string' && reason.trim() === `Action ${action} not allowed`
      ? legacyAction : null;
  }

  private async request(action, data, skipError, url = '', validateResponse?): Promise<any> {
    // Snapshot settings: a pending request must not acquire another server's credentials.
    const settings = { ...this.appSettings.settings };
    const firstUrl = url || settings.serverAPI;
    if (!firstUrl) {
      this.node.setOffline(null);
      return;
    }
    let apiUrl: string;
    try { apiUrl = secureEndpoint(firstUrl, 'rpc'); } catch (error) {
      this.node.setOffline('Unsafe server address: use HTTPS (HTTP is allowed only on loopback).');
      if (skipError) return;
      throw error;
    }
    const endpoints = [apiUrl];
    // Never automatically replay publication after an ambiguous network failure.
    if (!url && !skipError && settings.serverName === 'random' && action !== 'process' && action !== 'work_generate') {
      for (const server of this.appSettings.serverOptions || []) {
        if (!server.shouldRandom || !server.api) continue;
        try {
          const candidate = secureEndpoint(server.api, 'rpc');
          if (!endpoints.includes(candidate)) endpoints.push(candidate);
        } catch (_) { /* Ignore insecure built-in candidates. */ }
      }
    }
    if (this.node.node.status === false && !skipError) this.node.setLoading();
    // Includes legacy compatibility calls; PoW gets one longer, cancellable attempt.
    const deadline = Date.now() + (action === 'work_generate' ? 120000 : 45000);
    let attempts = 0;
    let lastError: any;
    for (const endpoint of endpoints.slice(0, 3)) {
      let requestAction = action;
      while (attempts < 3 && Date.now() < deadline) {
        attempts++;
        const options: any = { responseType: 'json' };
        // Explicit work servers never inherit RPC credentials, even at the same origin.
        if (!url && settings.serverName === 'custom' && endpoint === apiUrl && settings.serverAuth) {
          options.headers = new HttpHeaders().set('Authorization', settings.serverAuth);
        }
        try {
          const remaining = deadline - Date.now();
          const res = await this.http.post(endpoint, { ...data, action: requestAction }, options)
            .pipe(timeout(Math.max(1, Math.min(action === 'work_generate' ? 120000 : 15000, remaining)))).toPromise();
          if (typeof validateResponse === 'function' && validateResponse(res).err != null) {
            throw { isValidationFailure: true };
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
          const retryable = !error.isValidationFailure &&
            (error.status === 0 || error.status === 408 || error.status === 429 ||
             error.status >= 500 || error.name === 'TimeoutError' || error instanceof TypeError);
          if (!retryable) {
            this.node.setOffline();
            throw error;
          }
          break;
        }
      }
    }
    this.node.setOffline(lastError && lastError.status === 429
      ? 'Too Many Requests to the node. Try again later or choose a different node.'
      : 'RPC unavailable. Retry later or choose another node.');
    throw lastError || new Error('RPC request deadline exceeded.');
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
  async representativesOnline(): Promise<{ representatives: any }> {
    return await this.request('representatives_online', { }, false);
  }

  // Nano Node can return JSON-encoded block contents, while RsNano returns a JSON object.
  // Keep the string shape expected by existing Nault callers using JSON.parse(contents).
  private normalizeBlockContents(blockInfo: any): void {
    if (blockInfo && blockInfo.contents !== null && typeof blockInfo.contents === 'object' && !Array.isArray(blockInfo.contents)) {
      blockInfo.contents = JSON.stringify(blockInfo.contents);
    }
  }
  async blocksInfo(blocks): Promise<{blocks: any, error?: string}> {
    const response = await this.request('blocks_info', { hashes: blocks, pending: true, source: true }, false);
    if (response && response.blocks && typeof response.blocks === 'object') {
      Object.keys(response.blocks).forEach(hash => this.normalizeBlockContents(response.blocks[hash]));
    }
    return response;
  }
  async blockInfo(hash): Promise<any> {
    const response = await this.request('block_info', { hash: hash }, false);
    this.normalizeBlockContents(response);
    return response;
  }
  async blockCount(): Promise<{count: number, unchecked: number, cemented: number }> {
    return await this.request('block_count', { include_cemented: 'true'}, false);
  }
  async workGenerate(hash, difficulty, workServer = ''): Promise<{ work: string }> {
    const validateResponse = (res) => {
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
  async process(block, subtype: TxType): Promise<{ hash: string, error?: string }> {
    return await this.request('process', { json_block: 'true', block, subtype: TxType[subtype] }, false);
  }
  async accountHistory(account, count = 25, raw = false, offset = 0, reverse = false): Promise<{history: any }> {
    // use unlimited count if 0
    if (count === 0) {
      return await this.request('account_history', { account, raw, offset, reverse}, false);
    } else {
      return await this.request('account_history', { account, count, raw, offset, reverse}, false);
    }
  }
  async accountInfo(account): Promise<any> {
    return await this.request('account_info', { account, pending: true, representative: true, weight: true }, false);
  }
  async pending(account, count): Promise<any> {
    return await this.request('receivable', { account, count, source: true, include_only_confirmed: true }, false);
  }
  async pendingLimit(account, count, threshold): Promise<any> {
    return await this.request('receivable', { account, count, threshold, source: true, include_only_confirmed: true }, false);
  }
  async pendingSorted(account, count): Promise<any> {
    return await this.request('receivable', { account, count, source: true, include_only_confirmed: true, sorting: true }, false);
  }
  async pendingLimitSorted(account, count, threshold): Promise<any> {
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
