import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { AppSettingsService, RpcServerOption } from './app-settings.service';
import { RpcTransportService } from './rpc-transport.service';
import { secureEndpoint } from './endpoint-policy';

export type RpcNodeHealth = 'synchronized' | 'lagging' | 'unavailable' | 'unverified';

export interface RpcNodeMeasurement {
  value: string;
  name: string;
  api: string;
  count: number | null;
  rttMs: number | null;
  health: RpcNodeHealth;
}

// Observes public metadata only. No wallet addresses, secrets, authorization
// headers, block publication or PoW requests are sent by the background scan.
@Injectable({ providedIn: 'root' })
export class RpcNodeRankingService {
  measurements: RpcNodeMeasurement[] = [];
  ready = false;
  private pending: Promise<void> | null = null;

  constructor(private transport: RpcTransportService, private settings: AppSettingsService) {}

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  async refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.scan().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async probe(server: RpcServerOption): Promise<RpcNodeMeasurement> {
    const unavailable: RpcNodeMeasurement = {
      value: server.value, name: server.name, api: server.api!,
      count: null, rttMs: null, health: 'unavailable'
    };
    try {
      const endpoint = secureEndpoint(server.api!, 'rpc');
      const start = performance.now();
      const response = await firstValueFrom(this.transport.post(endpoint,
        { action: 'block_count', include_cemented: 'true' }, {}).pipe(timeout(5000)));
      const elapsed = performance.now() - start;
      if (!response || response.error || !/^[0-9]+$/.test(String(response.count))) return unavailable;
      const count = Number(response.count);
      if (!Number.isSafeInteger(count) || count < 0) return unavailable;
      return { ...unavailable, count, rttMs: elapsed, health: 'unverified' };
    } catch (_) {
      return unavailable;
    }
  }

  private async scan(): Promise<void> {
    const nodes = this.settings.serverOptions.filter(node =>
      node.allowFailover && node.failoverTarget !== false && !node.isLocal && !!node.api && !node.auth
    );
    const results = await Promise.all(nodes.map(node => this.probe(node)));
    const counts = results.filter(node => node.count !== null).map(node => node.count!);
    if (counts.length >= 3) {
      // Relative agreement between peers, rather than a hard-coded blockchain
      // height. The median resists a single node claiming an inflated height;
      // median absolute deviation adapts to normal differences in block counts.
      const reference = this.median(counts);
      const deviation = this.median(counts.map(count => Math.abs(count - reference)));
      const agreementWindow = Math.max(2, 3 * deviation);
      for (const node of results) {
        if (node.count === null) continue;
        node.health = Math.abs(node.count - reference) <= agreementWindow
          ? 'synchronized' : 'lagging';
      }
    } else if (counts.length === 2 && counts[0] === counts[1]) {
      results.forEach(node => {
        if (node.count !== null) node.health = 'synchronized';
      });
    }
    // A single available RPC (or disagreeing pair) cannot prove network
    // synchronization. Keep its status explicitly unverified rather than
    // falsely declaring it synchronized or filtering every working fallback.
    const ranked = results.filter(node =>
      node.health === 'synchronized' || node.health === 'unverified')
      .sort((a, b) =>
        (a.health === 'synchronized' ? 0 : 1) - (b.health === 'synchronized' ? 0 : 1) ||
        (a.rttMs ?? Infinity) - (b.rttMs ?? Infinity));
    this.measurements = results;
    this.ready = true;
    this.settings.setRankedEndpoints(ranked.map(node => node.api));
  }

  get best(): RpcNodeMeasurement | null {
    const endpoints = this.settings.getRankedFallbackEndpoints('');
    return endpoints?.length ? this.measurements.find(node => node.api === endpoints[0]) || null : null;
  }
}
