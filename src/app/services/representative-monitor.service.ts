import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

// External observations only, never Trusted, confirmed node health or chain state.
export interface MonitoredRepresentative {
  account: string;
  name: string | null;
  online: boolean;
  principal: boolean;
  weight: number | null;
  share: number | null; // fraction, not a percent
  verdict: 'good' | 'couldBeBetter' | 'offline' | null;
  outdated: boolean | null; // null for unknown/non-comparable, including RsNano
  crowded: boolean | null;
  node: { implementation: string | null; version: string | null; inSync: boolean | null } | null;
}
export interface RepresentativeMonitorSnapshot {
  takenAt: number;
  representatives: MonitoredRepresentative[];
  byAccount: Record<string, MonitoredRepresentative>;
}

@Injectable({providedIn: 'root'})
export class RepresentativeMonitorService {
  private readonly endpoint = 'https://nanonode.de/api/v1/representatives';
  private nextPollAt = 0;
  private inFlight: Promise<RepresentativeMonitorSnapshot | null> | null = null;
  private snapshot: RepresentativeMonitorSnapshot | null = null;
  constructor(private http: HttpClient) {}

  // One public list request, never individual wallet account IDs.
  // 90s cache; stale responses (>5min) and network/CORS failures are unknown,
  // not evidence that any representative is offline.
  async getSnapshot(): Promise<RepresentativeMonitorSnapshot | null> {
    if (this.inFlight) return this.inFlight;
    if (Date.now() < this.nextPollAt) return this.isFresh(this.snapshot) ? this.snapshot : null;
    this.nextPollAt = Date.now() + 90_000;
    this.inFlight = firstValueFrom(this.http.get<unknown>(this.endpoint).pipe(timeout(7000)))
      .then(data => this.parse(data)).catch(() => null)
      .then(value => { this.snapshot = value; return value; })
      .finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private isFresh(snapshot: RepresentativeMonitorSnapshot | null): boolean {
    if (!snapshot) return false;
    const age = Date.now() - snapshot.takenAt * 1000;
    return age >= -120_000 && age <= 300_000;
  }

  private parse(data: unknown): RepresentativeMonitorSnapshot | null {
    if (!data || typeof data !== 'object') return null;
    const raw = data as {takenAt?: unknown; representatives?: unknown};
    if (typeof raw.takenAt !== 'number' || !Number.isFinite(raw.takenAt) ||
        !Array.isArray(raw.representatives) || raw.representatives.length > 5000) return null;
    const result: RepresentativeMonitorSnapshot = {
      takenAt: raw.takenAt, representatives: [], byAccount: Object.create(null)
    };
    if (!this.isFresh(result)) return null;
    const validAddress = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
    for (const item of raw.representatives) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, any>;
      if (typeof r.account !== 'string' || !validAddress.test(r.account) ||
          typeof r.online !== 'boolean' || result.byAccount[r.account]) continue;
      const node = r.node && typeof r.node === 'object' ? {
        implementation: typeof r.node.implementation === 'string' ? r.node.implementation.slice(0, 32) : null,
        version: typeof r.node.version === 'string' ? r.node.version.slice(0, 32) : null,
        inSync: typeof r.node.inSync === 'boolean' ? r.node.inSync : null
      } : null;
      const rep: MonitoredRepresentative = {
        account: r.account,
        name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 100) : null,
        online: r.online,
        principal: r.principal === true,
        weight: typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight >= 0 ? r.weight : null,
        share: typeof r.share === 'number' && r.share >= 0 && r.share <= 1 ? r.share : null,
        verdict: r.verdict === 'good' || r.verdict === 'couldBeBetter' || r.verdict === 'offline' ? r.verdict : null,
        outdated: typeof r.outdated === 'boolean' ? r.outdated : null,
        crowded: typeof r.crowded === 'boolean' ? r.crowded : null,
        node
      };
      result.byAccount[rep.account] = rep;
      result.representatives.push(rep);
    }
    return result;
  }
}
