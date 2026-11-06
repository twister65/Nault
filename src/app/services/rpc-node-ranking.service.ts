import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { AppSettingsService, RpcServerOption } from './app-settings.service';
import { RpcTransportService } from './rpc-transport.service';
import { secureEndpoint } from './endpoint-policy';

export type RpcNodeHealth = 'synchronized' | 'lagging' | 'unavailable' | 'unverified';
export type PoWHealth = 'available' | 'unavailable' | 'unverified';

export interface RpcNodeMeasurement {
  value: string;
  name: string;
  api: string;
  count: number | null; // Total blocks in local ledger, including unconfirmed blocks.
  cemented: number | null; // Confirmed blocks: preferred synchronization comparison.
  rttMs: number | null;
  health: RpcNodeHealth;
  powHealth: PoWHealth;
  powRttMs: number | null;
  isLocal?: boolean;
}

// Background RPC ranking also checks whether a server can generate a tiny
// synthetic PoW nonce. No wallet roots, secrets, auth headers or signed blocks
// are sent. Cache probes so network reconnects do not spam public PoW servers.
@Injectable({ providedIn: 'root' })
export class RpcNodeRankingService {
  measurements: RpcNodeMeasurement[] = [];
  ready = false;
  private pending: Promise<void> | null = null;
  private readonly powCache = new Map<string, { health: PoWHealth; rttMs: number | null; time: number }>();
  private readonly powProbeHash = 'A'.repeat(64);
  private readonly powProbeDifficulty = '0000000000000000';
  private readonly powCacheMs = 15 * 60 * 1000;

  constructor(private transport: RpcTransportService, private settings: AppSettingsService) {}

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  async refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.ready = false;
    this.pending = this.scan().finally(() => { this.pending = null; });
    return this.pending;
  }

  private parseCount(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (!/^[0-9]+$/.test(String(value))) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  private async probePoW(server: RpcServerOption): Promise<{ health: PoWHealth; rttMs: number | null }> {
    // The explicit low difficulty keeps this optional capability check cheap.
    // It proves that work_generate answers, not performance at send threshold.
    const url = secureEndpoint(server.work || server.api!, 'rpc');
    const cached = this.powCache.get(url);
    if (cached && Date.now() - cached.time < (cached.health === 'available' ?
        this.powCacheMs : 60 * 1000)) {
      return { health: cached.health, rttMs: cached.rttMs };
    }
    const start = performance.now();
    let health: PoWHealth = 'unverified';
    let rttMs: number | null = null;
    try {
      const response = await firstValueFrom(this.transport.post(url, {
        action: 'work_generate', hash: this.powProbeHash,
        difficulty: this.powProbeDifficulty
      }, {}).pipe(timeout(5000)));
      if (response && typeof response.work === 'string' && /^[0-9a-f]{16}$/i.test(response.work)) {
        health = 'available';
        rttMs = performance.now() - start;
      } else {
        health = 'unavailable';
      }
    } catch (error) {
      const status = (error && typeof error === 'object' && 'status' in error)
        ? (error as { status?: number }).status : null;
      // A network interruption or timeout is not proof of missing PoW support.
      health = status && status >= 400 ? 'unavailable' : 'unverified';
    }
    this.powCache.set(url, { health, rttMs, time: Date.now() });
    return { health, rttMs };
  }

  // Real work results are more significant than a synthetic capability probe.
  // A PoW failure never changes Nano RPC status or the selected wallet node.
  recordPoWResult(api: string, success: boolean): void {
    const server = this.settings.serverOptions.find(node => node.api === api && !!node.ws && !node.auth);
    if (!server) return;
    const url = secureEndpoint(server.work || server.api!, 'rpc');
    const health: PoWHealth = success ? 'available' : 'unavailable';
    this.powCache.set(url, { health, rttMs: null, time: Date.now() });
    this.measurements.forEach(node => {
      if (node.api === api) node.powHealth = health;
    });
  }

  private async probe(server: RpcServerOption): Promise<RpcNodeMeasurement> {
    const unavailable: RpcNodeMeasurement = {
      value: server.value, name: server.name, api: server.api!,
      count: null, cemented: null, rttMs: null, health: 'unavailable',
      powHealth: 'unverified', powRttMs: null
    };
    try {
      const endpoint = secureEndpoint(server.api!, 'rpc');
      const start = performance.now();
      const response = await firstValueFrom(this.transport.post(endpoint,
        { action: 'block_count', include_cemented: 'true' }, {}).pipe(timeout(5000)));
      const elapsed = performance.now() - start;
      if (!response || response.error) return unavailable;
      // Standard Nano RPC uses count/cemented. Some compatible gateways use
      // block_count/cemented_count; never mix the two metrics in a comparison.
      const count = this.parseCount(response.count ?? response.block_count);
      const cemented = this.parseCount(response.cemented ?? response.cemented_count);
      if (count === null || (cemented !== null && cemented > count)) return unavailable;
      const pow = await this.probePoW(server);
      return { ...unavailable, count, cemented, rttMs: elapsed,
        health: 'unverified', powHealth: pow.health, powRttMs: pow.rttMs };
    } catch (_) {
      return unavailable;
    }
  }

  private async scan(): Promise<void> {
    // Locally saved public nodes may join The best and automatic failover when
    // they provide WSS and need no authorization. Never send auth credentials
    // during the public metadata scan.
    const nodes = this.settings.serverOptions.filter(node =>
      node.allowFailover && node.failoverTarget !== false &&
      !!node.api && !!node.ws && !node.auth
    );
    // An endpoint may be listed both officially and as a user's local entry.
    // Probe it only once; duplicate measurements must not count as independent
    // peers when deciding whether the Nano ledger is synchronized.
    const unique = nodes.filter((node, index) =>
      nodes.findIndex(other => other.api === node.api) === index);
    const results = await Promise.all(unique.map(node => this.probe(node)));

    // Nano does not have one linear chain height. Total ledger counts include
    // unconfirmed blocks and can differ substantially between fully usable
    // nodes: compare *cemented* block totals, when at least two offer them.
    // Never compare a total from one node to a cemented count from another.
    const withCemented = results.filter(node => node.cemented !== null);
    const compareCemented = withCemented.length >= 2;
    const cohort = compareCemented
      ? withCemented
      : results.filter(node => node.cemented === null && node.count !== null);
    const metric = (node: RpcNodeMeasurement): number =>
      (compareCemented ? node.cemented : node.count)!;

    if (cohort.length >= 3) {
      const counts = cohort.map(metric);
      const reference = this.median(counts);
      const deviation = this.median(counts.map(count => Math.abs(count - reference)));
      // A small discrepancy during concurrent probes is normal. Cap a
      // dispersion-based window so grossly stale peers cannot inflate it.
      const agreementWindow = Math.max(10, Math.min(500, 3 * deviation));
      for (const node of cohort) {
        const delta = metric(node) - reference;
        node.health = Math.abs(delta) <= agreementWindow
          ? 'synchronized'
          : delta < 0 ? 'lagging' : 'unverified';
      }
    } else if (cohort.length === 2 && Math.abs(metric(cohort[0]) - metric(cohort[1])) <= 10) {
      cohort.forEach(node => { node.health = 'synchronized'; });
    }
    // One surviving node (or two divergent peers) cannot independently prove
    // sync. Mark it unverified, not falsely lagging or synchronized.
    // A greater total than peers is not evidence of being behind.

    const ranked = results.filter(node =>
      node.health === 'synchronized' || node.health === 'unverified')
      .sort((a, b) =>
        // Prefer a synchronized RPC with proven PoW over a fast RPC whose
        // work_generate was refused. Keep RPC-only nodes as a last resort.
        (a.powHealth === 'available' ? 0 : a.powHealth === 'unverified' ? 1 : 2) -
        (b.powHealth === 'available' ? 0 : b.powHealth === 'unverified' ? 1 : 2) ||
        (a.health === 'synchronized' ? 0 : 1) - (b.health === 'synchronized' ? 0 : 1) ||
        (a.rttMs ?? Infinity) - (b.rttMs ?? Infinity));
    // Show both official and local labels in the diagnostics, sharing the
    // measured health/RTT when they point to the same underlying RPC endpoint.
    this.measurements = nodes.map(node => {
      const measured = results.find(result => result.api === node.api)!;
      return { ...measured, value: node.value, name: node.name, isLocal: !!node.isLocal };
    });
    this.settings.setRankedEndpoints(ranked.map(node => node.api));
    this.ready = true;
  }

  get best(): RpcNodeMeasurement | null {
    const endpoints = this.settings.getRankedFallbackEndpoints('');
    return endpoints?.length ? this.measurements.find(node => node.api === endpoints[0]) || null : null;
  }
}
