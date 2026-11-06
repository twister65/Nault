import { Injectable } from '@angular/core';
import {AppSettingsService} from './app-settings.service';
import {ApiService} from './api.service';
import {NotificationService} from './notification.service';
import { PoWSource } from './app-settings.service';
import { RpcNodeRankingService } from './rpc-node-ranking.service';
import { PoWApiKeyVaultService } from './pow-api-key-vault.service';
import { secureEndpoint } from './endpoint-policy';
// Native browser worker; esbuild bundles the worker from a stable module-relative URL.
const createPowWorker = () => new Worker(new URL('../../assets/lib/cpupow.js', import.meta.url));
import {UtilService} from './util.service';
import {BehaviorSubject} from 'rxjs';

// Emscripten exposes the PoW module on Window at runtime.
const mod = (window as unknown as {
  Module: { cwrap: (name: string, result: string, args: string[]) => (hash: string) => string };
}).Module;
export const baseThreshold = 'fffffff800000000'; // threshold since v21 epoch update
const hardwareConcurrency = window.navigator.hardwareConcurrency || 2;
const workerCount = Math.max(hardwareConcurrency - 1, 1);
let workerList: Array<{ terminate(): void }> = [];
export enum workState {'success', 'cancelled', 'error'}

export interface PowResult {
  state: workState | null;
  work: string;
}

// Session-only diagnostics: never persist or use this state to change the wallet RPC.
export type PoWProviderStatus = 'unverified' | 'checking' | 'available' | 'unavailable';
export interface ActivePoWProvider {
  source: PoWSource;
  name: string;
  endpoint: string;
  status: PoWProviderStatus;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

interface PowQueueItem {
  hash: string;
  multiplier: number;
  work: string | null;
  promise: Deferred<PowResult>;
}

@Injectable()
export class PowService {

  webGLAvailable = false;
  webGLTested = false;

  powAlertLimit = 60; // alert long pow after X sec
  PoWPool: PowQueueItem[] = [];
  parallelQueue = false;
  processingQueueItem = false;
  currentProcessTime = 0; // start timestamp for PoW
  powAlert$: BehaviorSubject<boolean|false> = new BehaviorSubject(false);
  public shouldContinueQueue = true; // set to false to disable further processing
  cpuWorkerResolve: (() => void) | null = null; // worker cancellation control
  cpuWorkerReject: ((reason?: unknown) => void) | null = null;
  shouldAbortGpuPow = false; // set to true to abort GPU pow
  private androidPowStartup: Promise<void> | null = null;
  readonly activeProvider$ = new BehaviorSubject<ActivePoWProvider>({
    source: 'server', name: '', endpoint: '', status: 'unverified'
  });

  constructor(
    private appSettings: AppSettingsService,
    private api: ApiService,
    private notifications: NotificationService,
    private util: UtilService,
    private ranking: RpcNodeRankingService,
    private powApiKeys: PoWApiKeyVaultService
  ) { }

  // Keep the displayed provider independent from RPC failover and from saved
  // settings. A successful PoW fallback only updates this observable.
  private publishProvider(endpoint: string, status: PoWProviderStatus): void {
    const source = this.appSettings.settings.powSource;
    const actualEndpoint = endpoint || (source === 'custom'
      ? this.appSettings.settings.customWorkServer
      : this.appSettings.getSelectedServerWorkUrl() || this.appSettings.settings.serverAPI || '');
    const matching = this.appSettings.serverOptions.find(node => node.api &&
      (node.work === actualEndpoint || node.api === actualEndpoint));
    let name = matching?.name || 'External PoW';
    const authenticated = PoWApiKeyVaultService.providerForUrl(actualEndpoint);
    if (authenticated === 'nano-to') name = 'Nano.to';
    else if (authenticated === 'nanswap') name = 'Nanswap';
    if (source === 'clientCPU') name = 'CPU';
    else if (source === 'clientWebGL') name = 'WebGL';
    else if (actualEndpoint && !matching && !authenticated) {
      try { name = new URL(actualEndpoint).hostname; } catch (_) { /* No URL in UI. */ }
    }
    this.activeProvider$.next({ source, name, endpoint: actualEndpoint, status });
  }

  // Called after initial settings restoration and when the user explicitly
  // changes a configuration. Do not erase a working fallback on page visits.
  syncProviderFromSettings(force = false): void {
    const previous = this.activeProvider$.value;
    if (!force && previous.name && previous.source === this.appSettings.settings.powSource) return;
    this.publishProvider('', 'unverified');
  }

  private async requestServerWork(hash: string, multiplier: number,
      endpoint: string, timeoutMs = 120000): Promise<string | null> {
    const source = this.appSettings.settings.powSource;
    const rpc = this.appSettings.settings.serverAPI;
    const custom = this.appSettings.settings.customWorkServer;
    const stillCurrent = () => this.appSettings.settings.powSource === source &&
      this.appSettings.settings.serverAPI === rpc &&
      this.appSettings.settings.customWorkServer === custom;
    if (stillCurrent()) this.publishProvider(endpoint, 'checking');
    // Keep the historical three-argument call for the standard timeout;
    // focused regression tests and custom-server routing rely on it.
    const work = timeoutMs === 120000
      ? await this.getHashServer(hash, multiplier, endpoint)
      : await this.getHashServer(hash, multiplier, endpoint, timeoutMs);
    if (stillCurrent()) this.publishProvider(endpoint, work ? 'available' : 'unavailable');
    return work;
  }


  // Only explicit, unlocked credentials authorize these two exact HTTPS work
  // endpoints. No key is transmitted to ordinary RPC nodes or diagnostics.
  private getAuthenticatedWorkTargets(): Array<{ api: string; workUrl: string }> {
    return this.powApiKeys.unlockedProviders().map(provider => {
      const workUrl = provider === 'nano-to'
        ? 'https://rpc.nano.to/' : 'https://nodes.nanswap.com/XNO';
      return { api: workUrl, workUrl };
    });
  }

  private async generateAuthenticatedWork(
    workServer: string, hash: string, threshold: string, timeoutMs: number,
    headers: Record<string, string>
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(workServer, {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'work_generate', hash, difficulty: threshold })
      });
      if (!response.ok) return null;
      const result: unknown = await response.json();
      const work = result !== null && typeof result === 'object'
        ? (result as { work?: unknown }).work : null;
      return typeof work === 'string' && /^[0-9a-f]{16}$/i.test(work) &&
        this.util.nano.validateWork(hash, threshold, work) ? work : null;
    } catch (_) {
      // Do not log fetch exceptions: they can include confidential headers.
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private isAndroidInstalledPwa(): boolean {
    // Android Chrome tabs, Chromebook PWAs, iOS and Electron keep the
    // established PoW selection. Only an installed Android PWA opts in.
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) &&
      typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
       window.matchMedia('(display-mode: fullscreen)').matches);
  }

  // Run concurrently with the existing app-startup node ranking. Never block
  // the wallet UI; only the first Android PWA PoW request awaits discovery.
  // The selected work provider is session-only and independent of RPC settings.
  initializeAndroidPwaExternalPoW(): Promise<void> {
    if (!this.isAndroidInstalledPwa() ||
        (this.appSettings.settings.powSource !== 'server' &&
         this.appSettings.settings.powSource !== 'best')) return Promise.resolve();
    if (!this.androidPowStartup) {
      this.androidPowStartup = this.ranking.refresh()
        .then(() => {
          const selected = this.ranking.getExternalPoWTargets()[0];
          if (selected && this.activeProvider$.value.status === 'unverified') {
            const health = this.ranking.measurements.find(node => node.api === selected.api)?.powHealth;
            this.publishProvider(selected.workUrl, health === 'available' ? 'available' : 'unverified');
          }
          console.info('[Nano PoW] Android PWA external work:', selected ? 'ready' : 'no verified provider');
        })
        .catch(() => { console.info('[Nano PoW] External work scan unavailable.'); });
    }
    return this.androidPowStartup;
  }

  private async getAndroidPwaExternalPoW(
    hash: string, multiplier: number, saved: AppSettingsService['settings']
  ): Promise<{ handled: boolean; work: string | null }> {
    // Respect explicitly configured private/authenticated or offline nodes
    // and user-selected custom, CPU or WebGL PoW sources.
    if (!this.isAndroidInstalledPwa() || saved.serverAuth ||
        saved.serverName === 'custom' || saved.serverName === 'offline' ||
        (saved.powSource !== 'server' && saved.powSource !== 'best')) {
      return { handled: false, work: null };
    }
    // Discovery is never on the critical path of a receive/send. When a
    // wallet has just been imported and no scan is ready, immediately use the
    // configured server (Twister32 /pow on first launch), without waiting.
    void this.initializeAndroidPwaExternalPoW();
    if (!this.ranking.ready) return { handled: false, work: null };
    // The unauthenticated probe may classify a paid API as unavailable.
    // Unlocked API-key providers are separate candidates, not RPC nodes.
    const ranked = this.ranking.getExternalPoWTargets();
    const authenticated = this.getAuthenticatedWorkTargets();
    // Keep the best measured provider first, but reserve fallback slots for
    // the unlocked paid PoW endpoints even when their anonymous probe failed.
    const targets = [
      ...ranked.slice(0, 1),
      ...authenticated,
      ...ranked.slice(1)
    ].filter((target, index, all) =>
      all.findIndex(other => other.workUrl === target.workUrl) === index).slice(0, 3);
    if (!targets.length) return { handled: false, work: null };

    for (let i = 0; i < targets.length; i++) {
      if (!this.shouldContinueQueue ||
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          saved.serverAPI !== this.appSettings.settings.serverAPI ||
          saved.powSource !== this.appSettings.settings.powSource) {
        return { handled: true, work: null };
      }
      const { api, workUrl } = targets[i];
      // A proven provider gets first attempt; the remaining public providers
      // are fallbacks for the very same PoW root, never for signed process.
      const work = await this.requestServerWork(hash, multiplier, workUrl, i === 0 ? 30000 : 20000);
      this.ranking.recordPoWResult(api, !!work);
      if (work) return { handled: true, work };
    }
    return { handled: true, work: null };
  }

  private async getServerPoWWithFallback(hash: string, multiplier: number, selectedWorkUrl: string): Promise<string | null> {
    const saved = { ...this.appSettings.settings };
    const android = await this.getAndroidPwaExternalPoW(hash, multiplier, saved);
    if (android.handled) return android.work;
    const primary = this.appSettings.serverOptions.find(node =>
      node.api && node.api === saved.serverAPI &&
      (saved.serverName === 'random' || node.value === saved.serverName));
    // Never forward private RPC credentials, override a custom work source,
    // or choose another wallet node because only PoW failed.
    if (!primary || !primary.allowFailover || !primary.ws || primary.auth ||
        saved.serverName === 'offline' || saved.serverName === 'custom') {
      return this.requestServerWork(hash, multiplier, selectedWorkUrl);
    }

    const possible = this.appSettings.serverOptions.filter(node =>
      node.allowFailover && node.failoverTarget !== false &&
      node.api && node.ws && !node.auth && node.api !== primary.api);
    const ranked = this.appSettings.getRankedFallbackEndpoints(primary.api!);
    const knownOrder = ranked === null ? possible.map(node => node.api!) : ranked;
    const authenticated = this.getAuthenticatedWorkTargets();
    const order = authenticated.length
      ? [...knownOrder.filter(api => possible.some(node =>
          node.api === api && node.value === 'twister32-rsnano')),
        ...authenticated.map(node => node.api), ...knownOrder]
      : knownOrder;
    const seen = new Set<string>([secureEndpoint(selectedWorkUrl || primary.api!, 'rpc')]);
    const backups: Array<{ api: string; workUrl: string }> = [];
    for (const api of order) {
      const node = possible.find(candidate => candidate.api === api);
      const paid = authenticated.find(candidate => candidate.api === api);
      if ((!node && !paid) || (!paid && this.ranking.measurements.some(result =>
          result.api === node?.api && result.powHealth === 'unavailable'))) continue;
      try {
        const workUrl = secureEndpoint(paid?.workUrl || node?.work || node?.api || '', 'rpc');
        if (!seen.has(workUrl)) {
          seen.add(workUrl);
          backups.push({ api, workUrl });
        }
      } catch (_) { /* Invalid or insecure PoW endpoint: do not retry it. */ }
      if (backups.length === 2) break;
    }

    // Preserve the established 2-minute attempt if no safe backup is known.
    if (!backups.length) {
      const result = await this.requestServerWork(hash, multiplier, selectedWorkUrl);
      this.ranking.recordPoWResult(primary.api!, !!result);
      return result;
    }

    const primaryUrl = secureEndpoint(selectedWorkUrl || primary.api!, 'rpc');
    const targets = [{ api: primary.api!, workUrl: primaryUrl }, ...backups];
    for (let index = 0; index < targets.length; index++) {
      if (!this.shouldContinueQueue || (index > 0 &&
          (typeof navigator !== 'undefined' && navigator.onLine === false))) return null;
      const target = targets[index];
      // The first work server gets a reasonable computation window; two
      // independent backups get smaller, bounded windows. Each request is
      // abortable, and the signed 'process' RPC is NEVER replayed.
      const work = await this.requestServerWork(hash, multiplier, target.workUrl, index === 0 ? 30000 : 20000);
      this.ranking.recordPoWResult(target.api, !!work);
      if (work) {
        if (index > 0) console.info('[Nano PoW] Recovered through alternate work server.');
        return work;
      }
      // Do not continue retrying a PoW request after user switched servers.
      if (saved.serverAPI !== this.appSettings.settings.serverAPI ||
          saved.powSource !== this.appSettings.settings.powSource) break;
    }
    return null;
  }

  // A custom public PoW endpoint is eligible for work-only fallback. Keep
  // local, intranet and reserved hostnames pinned to their user-selected
  // endpoint; the URL check is not a proof that public DNS cannot resolve to
  // a private address, so credentials and private RPC selections remain pinned.
  private isPublicCustomWorkUrl(workUrl: string): boolean {
    try {
      const endpoint = new URL(secureEndpoint(workUrl, 'rpc'));
      const host = endpoint.hostname.toLowerCase();
      if (endpoint.protocol !== 'https:' || !host.includes('.') ||
          /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') ||
          /(?:^|\.)(?:localhost|local|lan|home|internal|intranet|corp|test|example|invalid|onion)$/.test(host)) {
        return false;
      }
      return true;
    } catch (_) { return false; }
  }

  private async getCustomPoWWithFallback(
    hash: string, multiplier: number, workUrl: string
  ): Promise<string | null> {
    const saved = { ...this.appSettings.settings };
    // This is never wallet/RPC failover: no account data, credentials or
    // signed process requests are sent to the alternate PoW providers.
    if (!this.isPublicCustomWorkUrl(workUrl) || saved.serverAuth ||
        saved.serverName === 'custom' || saved.serverName === 'offline') {
      return this.requestServerWork(hash, multiplier, workUrl);
    }

    // Prefer already-ranked healthy public providers, but do not block a
    // receive on discovery. RsNano /pow is a deterministic safe default
    // when no ranking exists (including an installed Android PWA).
    const publicNodes = this.appSettings.serverOptions.filter(node =>
      !node.isLocal && node.allowFailover && node.failoverTarget !== false &&
      !!node.api && !!node.ws && !node.auth
    ).sort((a, b) => (a.value === 'twister32-rsnano' ? -1 : 0) -
                     (b.value === 'twister32-rsnano' ? -1 : 0));
    const measured = this.ranking.ready ? this.ranking.getExternalPoWTargets() : [];
    // Prefer own verified work endpoint, then unlocked paid work providers.
    // Other public nodes are last-resort fallbacks; absence of a credential
    // never causes an API key to be sent in plaintext or in a URL.
    const available = [
      ...publicNodes.filter(node => node.value === 'twister32-rsnano')
        .map(node => ({ api: node.api!, workUrl: node.work || node.api! })),
      ...this.getAuthenticatedWorkTargets(),
      ...measured,
      ...publicNodes.filter(node => node.value !== 'twister32-rsnano')
        .map(node => ({ api: node.api!, workUrl: node.work || node.api! }))
    ];
    const candidates: Array<{ api: string; workUrl: string }> = [];
    const seen = new Set<string>();
    try { seen.add(secureEndpoint(workUrl, 'rpc')); }
    catch (_) { return this.requestServerWork(hash, multiplier, workUrl); }
    for (const node of available) {
      try {
        const url = secureEndpoint(node.workUrl, 'rpc');
        if (seen.has(url)) continue;
        seen.add(url);
        candidates.push({ api: node.api, workUrl: url });
      } catch (_) { /* Ignore unsafe work endpoints. */ }
      if (candidates.length === 2) break;
    }
    // Do not shorten the deliberate custom-server timeout when no public
    // fallback is actually eligible.
    if (!candidates.length) return this.requestServerWork(hash, multiplier, workUrl);

    const stillCurrent = () => this.shouldContinueQueue &&
      (typeof navigator === 'undefined' || navigator.onLine !== false) &&
      saved.powSource === this.appSettings.settings.powSource &&
      saved.customWorkServer === this.appSettings.settings.customWorkServer &&
      saved.serverAPI === this.appSettings.settings.serverAPI &&
      saved.serverName === this.appSettings.settings.serverName &&
      saved.serverAuth === this.appSettings.settings.serverAuth;

    if (!stillCurrent()) return null;
    const primaryWork = await this.requestServerWork(hash, multiplier, workUrl, 30000);
    if (primaryWork || !stillCurrent()) return primaryWork;

    for (const target of candidates) {
      if (!stillCurrent()) return null;
      const fallbackWork = await this.requestServerWork(hash, multiplier, target.workUrl, 20000);
      this.ranking.recordPoWResult(target.api, !!fallbackWork);
      if (fallbackWork) {
        console.info('[Nano PoW] Custom public work server recovered via alternate provider.');
        return fallbackWork;
      }
    }
    return null;
  }

  /**
   * Determine the best PoW Method available for this browser
   */
  determineBestPoWMethod(): PoWSource {
    // if (this.hasWebGLSupport()) return 'clientWebGL';
    // if (this.hasWorkerSupport()) return 'clientCPU'; // For now, server is better than a CPU default (For Mobile)

    return 'server';
  }

  /**
   * Get PoW for a hash.  If it's already being processed, return the promise.
   * Otherwise, add it into the queue and return when it is ready
   */
  async getPow(hash: string, multiplier: number): Promise<PowResult> {
    const existingPoW = this.PoWPool.find(p => p.hash === hash);
    if (existingPoW) {
      return existingPoW.promise.promise; // Its okay if its resolved already
    }

    return this.addQueueItem(hash, multiplier);
  }

  /**
   * Add a new hash into the queue to perform work on.
   * Returns a promise that is resolved when work is completed
   */
  addQueueItem(hash: string, multiplier: number): Promise<PowResult> {
    const existingPoW = this.PoWPool.find(p => p.hash === hash);
    if (existingPoW) {
      return existingPoW.promise.promise;
    }

    const queueItem = {
      hash,
      work: null,
      promise: this.getDeferredPromise<PowResult>(),
      multiplier: multiplier,
    };

    this.PoWPool.push(queueItem);
    this.processQueue();

    return queueItem.promise.promise;
  }

  /**
   * Determine if the browser has WebWorker support
   * @returns {boolean}
   */
  public hasWorkerSupport() {
    return !!window['Worker'];
  }

  /**
   * Determine if the browser has WebGL support
   * @returns {boolean}
   */
  public hasWebGLSupport() {
    if (this.webGLTested) return this.webGLAvailable;

    this.webGLTested = true;

    try {
      const canvas = document.createElement( 'canvas' );
      const webGL = !! window['WebGLRenderingContext'] && (canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ));
      this.webGLAvailable = !!webGL;
      return this.webGLAvailable;
    } catch (e) {
      this.webGLAvailable = false;
      return false;
    }
  }

  /**
   * Gets the next item in the queue and sends it to be processed
   */
  private processQueue() {
    if (!this.PoWPool.length) return; // No items in the queue
    if (this.parallelQueue) return; // Not yet implemented

    if (this.processingQueueItem) return; // Already processing.

    // Get the next item from the queue and process it
    this.processNextQueueItem();
  }

  /**
   * Process an individual hash from the queue
   * Uses the latest app settings to determine which type of PoW to use
   */
  private async processNextQueueItem() {
    if (!this.PoWPool.length) return; // Nothing in the queue?
    this.processingQueueItem = true;
    const queueItem = this.PoWPool[0];
    this.powAlert$.next(false); // extra safety to ensure the alert is always reset

    let powSource = this.appSettings.settings.powSource;
    const multiplierSource: number = this.appSettings.settings.multiplierSource;
    let localMultiplier: number = 1;

    if (powSource === 'best') {
      powSource = this.determineBestPoWMethod();
    }

    if (powSource === 'clientCPU' || powSource === 'clientWebGL' || powSource === 'custom') {
      if (multiplierSource > 1) { // use manual difficulty
        localMultiplier = multiplierSource;
      } else { // use default requested difficulty
        localMultiplier = queueItem.multiplier;
      }
    }

    const work: PowResult = {state: null, work: ''};
    switch (powSource) {
      default:
      case 'server':
        // A named RPC server may expose PoW at a different URL (e.g. /pow,
        // while account RPC uses /proxy). All other nodes keep the RPC default.
        const selectedWorkServer = this.appSettings.getSelectedServerWorkUrl();
        const serverWork = await this.getServerPoWWithFallback(queueItem.hash, queueItem.multiplier, selectedWorkServer);
        if (serverWork) {
          work.work = serverWork;
          work.state = workState.success;
        } else {
          work.state = workState.error;
        }
        break;
      case 'clientCPU':
        this.publishProvider('', 'checking');
        try {
          work.work = await this.getHashCPUWorker(queueItem.hash, localMultiplier);
          work.state = workState.success;
        } catch (state) {
          work.state = state === workState.cancelled ? workState.cancelled : workState.error;
        }
        this.publishProvider('', work.state === workState.success ? 'available' : 'unavailable');
        break;
      case 'clientWebGL':
        this.publishProvider('', 'checking');
        try {
          work.work = await this.getHashWebGL(queueItem.hash, localMultiplier);
          work.state = workState.success;
        } catch (state) {
          work.state = state === workState.cancelled ? workState.cancelled : workState.error;
        }
        this.publishProvider('', work.state === workState.success ? 'available' : 'unavailable');
        break;
      case 'custom':
        const workServer = this.appSettings.settings.customWorkServer;
        // Check all known APIs and return true if there is no match. Then allow local PoW mutliplier
        const allowLocalMulti = workServer !== '' &&
          this.appSettings.knownApiEndpoints.every(endpointUrl => !workServer.includes(endpointUrl));

        const customWork = await this.getCustomPoWWithFallback(
          queueItem.hash, allowLocalMulti ? localMultiplier : queueItem.multiplier, workServer);
        if (customWork) {
          work.work = customWork;
          work.state = workState.success;
        } else {
          work.state = workState.error;
        }
        break;
    }

    this.currentProcessTime = 0; // Reset timer
    this.PoWPool.shift(); // Remove this item from the queue
    this.processingQueueItem = false;

    if (work.state === workState.success) {
      queueItem.work = work.work;
      queueItem.promise.resolve(work);
    } else {
      // this.notifications.sendError(`Unable to generate work for ${queueItem.hash} using ${powSource}`);
      queueItem.promise.reject(work);
    }

    if (this.shouldContinueQueue) {
      this.processQueue();
    }

    return queueItem;
  }

  /**
   * Actual PoW functions
   */
  async getHashServer(hash: string, multiplier: number, workServer = '', timeoutMs = 120000): Promise<string | null> {
    const newThreshold = this.util.nano.difficultyFromMultiplier(multiplier, baseThreshold);
    const serverString = workServer === '' ? 'external' : 'custom';
    console.log('Generating work with multiplier ' + multiplier + ' at threshold ' +
      newThreshold + ' using ' + serverString + ' server for hash: ', hash);
    // With a selected Nano.to RPC node the caller may use the implicit work
    // URL. Resolve it only for PoW: ordinary RPC reads stay unauthenticated.
    const authUrl = workServer || this.appSettings.settings.serverAPI || '';
    const headers = this.powApiKeys.getAuthorizedHeaders(authUrl);
    if (headers) {
      return this.generateAuthenticatedWork(authUrl, hash, newThreshold, timeoutMs, headers);
    }
    return await this.api.workGenerate(hash, newThreshold, workServer, timeoutMs)
    .then(result => result && typeof result.work === 'string' &&
      this.util.nano.validateWork(hash, newThreshold, result.work) ? result.work : null)
    // Do not fallback to CPU pow. Let the user decide
    // .catch(async err => await this.getHashCPUWorker(hash, multiplier))
    .catch(err => null);
  }

  /**
   * Generate PoW using CPU without workers (Not used)
   */
  getHashCPUSync(hash: string): Promise<string> {
    const response = this.getDeferredPromise();

    const PoW = mod.cwrap('launchPoW', 'string', ['string']);
    const start = Date.now();
    let work;
    do { work = PoW(hash); } while (work === '0000000000000000');
    console.log(`Synchronous CPU: Found work (${work}) for ${hash} after ${(Date.now() - start) / 1000} seconds`);

    response.resolve(work);
    return response.promise;
  }

  /**
   * Generate PoW using CPU and WebWorkers
   */
  async getHashCPUWorker(hash: string, multiplier: number): Promise<string> {
    this.checkPowProcessLength(); // start alert timer
    // console.log('Generating work using CPU for', hash);

    const response = this.getDeferredPromise();

    const start = Date.now();
    // -- OLD CPU CODE THAT CANT DEFINE THRESHOLD-- //
    /*
    const NUM_THREADS = navigator.hardwareConcurrency < 4 ? navigator.hardwareConcurrency : 4;
    const workers = window['pow_initiate'](NUM_THREADS, '/assets/lib/pow/');

    window['pow_callback'](workers, hash, () => {}, (work) => {
      console.log(`CPU Worker: Found work (${work}) for ${hash} after ${(Date.now() - start) / 1000} seconds [${NUM_THREADS} Workers]`);
      response.resolve(work);
    });
    */

    // calculate threshold from multiplier
    const newThreshold = this.util.nano.difficultyFromMultiplier(multiplier, baseThreshold);
    const work = () => new Promise<void>((resolve, reject) => {
      this.cpuWorkerResolve = resolve;
      this.cpuWorkerReject = reject;
      console.log('Generating work with multiplier ' + multiplier + ' at threshold ' +
        newThreshold + ' using CPU workers for hash: ', hash);
      workerList = [];
      for (let i = 0; i < workerCount; i++) {
        // const worker = new Worker()
        const worker = createPowWorker();
        worker.postMessage({
          blockHash: hash,
          workerIndex: i,
          workerCount: workerCount,
          workThreshold: newThreshold,
        });
        worker.onmessage = (workerwork: MessageEvent<string>) => {
          console.log(`CPU Worker: Found work (${workerwork.data}) for ${hash} after ${(Date.now() - start) / 1000} seconds [${workerCount} Workers]`);
          response.resolve(workerwork.data);
          this.terminateCpuWorkers(true);
        };
        workerList.push(worker);
      }
    });
    try {
      await work();
    } catch (msg) {
      response.reject(msg);
    }

    return response.promise;
  }

  /**
   * Generate PoW using WebGL
   */
  getHashWebGL(hash: string, multiplier: number): Promise<string> {
    this.checkPowProcessLength(); // start alert timer
    const newThreshold = this.util.nano.difficultyFromMultiplier(multiplier, baseThreshold);
    console.log('Generating work with multiplier ' + multiplier + ' at threshold ' + newThreshold + ' using WebGL for hash: ', hash);

    const response = this.getDeferredPromise();

    const start = Date.now();
    try {
      const webglPow = (window as unknown as {
        NanoWebglPow: (
          hash: string,
          onWork: (work: string, iterations: number) => void,
          onProgress: (iterations: number) => boolean | undefined,
          threshold: string
        ) => void;
      }).NanoWebglPow;
      webglPow(hash, (work: string, n: number) => {
          console.log(`WebGL Worker: Found work (${work}) for ${hash} after ${(Date.now() - start) / 1000} seconds [${n} iterations]`);
          response.resolve(work);
        },
        (n: number) => {
          if (this.shouldAbortGpuPow) {
            this.shouldAbortGpuPow = false;
            response.reject(workState.cancelled);
            return true;
          }
        },
        '0x' + newThreshold.substring(0, 8).toUpperCase() // max threshold for webglpow is currently ffffffff00000000
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'webgl2_required') {
        this.webGLAvailable = false;
        console.warn('WebGL is required for GPU pow');
      }
      response.reject(workState.error);
    }

    return response.promise;
  }


  // Helper for returning a deferred promise that we can resolve when work is ready
  private getDeferredPromise<T = string>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  // Check if pow takes longer than limit, then notify user
  async checkPowProcessLength() {
    this.shouldAbortGpuPow = false;
    this.currentProcessTime = Date.now();
    while (this.currentProcessTime !== 0) {
      // display alert of PoW has been running more than X ms
      if (Date.now() - this.currentProcessTime >= this.powAlertLimit * 1000) {
        this.powAlert$.next(true);
      }
      await this.sleep(1000);
    }
    this.powAlert$.next(false);
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Interupt running pow and empty the queue
  public cancelAllPow(notify: boolean) {
    if (this.currentProcessTime !== 0) {
      this.currentProcessTime = 0; // reset timer
      this.powAlert$.next(false); // announce alert to close
      this.shouldContinueQueue = false; // disable further processing
      this.terminateCpuWorkers(false); // abort CPU worker if running
      this.shouldAbortGpuPow = true; // abort GPU pow if running
      if (notify) {
        this.notifications.sendInfo(`Proof of Work generation cancelled by the user`);
      }
      return true;
    }
    return false;
  }

  terminateCpuWorkers(successful: boolean): void {
    for (const workerIndex in workerList) {
      if (Object.prototype.hasOwnProperty.call(workerList, workerIndex)) {
        workerList[workerIndex].terminate();
      }
    }
    if (successful && this.cpuWorkerResolve) {
      this.cpuWorkerResolve();
    } else if (!successful && this.cpuWorkerReject) {
      this.cpuWorkerReject(workState.cancelled);
    }
  }

}
