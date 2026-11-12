import { Injectable } from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {WalletService} from './wallet.service';
import type {BaseApiAccount, WalletApiAccount} from './wallet.service';
import BigNumber from 'bignumber.js';
import {ApiService} from './api.service';
import {UtilService} from './util.service';
import { DEFAULT_REPRESENTATIVE } from './default-representative';
import { getDirectoryRepresentativeName } from './representative-directory';
import { RepresentativeMonitorService, MonitoredRepresentative } from './representative-monitor.service';

/**
 * A narrowly scoped, indicative POSITIVE assessment from one third-party
 * monitor, not a proof of safety, uptime over time or local Trusted status.
 *
 * Its "good" verdict does not itself check inSync, and treats null outdated
 * as acceptable. We require independent sync evidence in its snapshot.
 * RsNano cannot be compared to nano-node versions (outdated:null is expected).
 */
export function hasPositiveNanoNodeHealthEvidence(rep: MonitoredRepresentative | null): boolean {
  if (!rep || rep.online !== true || rep.principal !== true ||
      rep.verdict !== 'good' || rep.node?.inSync !== true ||
      rep.crowded !== false || rep.share === null ||
      !Number.isFinite(rep.share) || rep.share <= 0 || rep.share >= 0.02) return false;
  const versionComparable = rep.outdated === false ||
    (rep.outdated === null && rep.node?.implementation === 'rsnano');
  return versionComparable;
}

export interface RepresentativeStatus {
  online: boolean | null;
  veryHighWeight: boolean;
  highWeight: boolean;
  veryLowUptime: boolean;
  lowUptime: boolean;
  closing: boolean;
  markedToAvoid: boolean;
  markedAsNF: boolean;
  trusted: boolean;
  changeRequired: boolean;
  warn: boolean;
  known: boolean;
  daysSinceLastVoted: number;
  uptime: number | null;
  score: number | null;
}

export interface RepresentativeOverview {
  id: string;
  weight: BigNumber;
  accounts: WalletApiAccount[];
}

export interface StoredRepresentative {
 id: string;
 name: string;
 warn?: boolean;
 trusted?: boolean;
 weight?: number;
 online?: boolean;
}


export interface RepresentativeApiOverview extends BaseApiAccount {
  account: string;
  accounts: WalletApiAccount[];
  delegatedWeight: BigNumber;
}

export interface FullRepresentativeOverview extends RepresentativeApiOverview {
  id: string;
  percent: BigNumber;
  statusText: string;
  label: string|null;
  status: RepresentativeStatus;
  donationAddress?: string;
  networkObservation?: { online: boolean | null; source: 'rpc' | 'nanonode' | null; rpcOnline: boolean | null; nanonodeOnline: boolean | null; observedAt: number | null; version: string | null; inSync: boolean | null; verdict: string | null };
}


@Injectable()
export class RepresentativeService {
  storeKey = `nanovault-representatives`;
  private readonly defaultRepresentativeMigrationKey = 'nanovault-known-representative-twister32-v1';

  representatives$ = new BehaviorSubject<StoredRepresentative[]>([]);
  representatives: StoredRepresentative[] = [];

  // [null] is the initial/loading state, distinct from an empty loaded list.
  walletReps$ = new BehaviorSubject<Array<FullRepresentativeOverview | null>>([null]);
  walletReps: FullRepresentativeOverview[] = [];

  changeableReps$ = new BehaviorSubject<FullRepresentativeOverview[]>([]);
  changeableReps: FullRepresentativeOverview[] = [];

  onlineStakeTotal: BigNumber | null = new BigNumber(115202418);

  loaded = false;

  constructor(
    private wallet: WalletService,
    private api: ApiService,
    private util: UtilService,
    private representativeMonitor: RepresentativeMonitorService
  ) {
    this.representatives = this.defaultRepresentatives.map(rep => ({ ...rep }));
  }

  /**
   * Determine if any accounts in the wallet need a rep change
   * @returns {Promise<FullRepresentativeOverview[]>}
   */
  async detectChangeableReps(cachedReps?: FullRepresentativeOverview[]): Promise<FullRepresentativeOverview[]> {
    const representatives = cachedReps ? cachedReps : await this.getRepresentativesOverview();

    // Now based on some of their properties, we filter them out
    const needsChange = [];
    for (const rep of representatives) {
      if (rep.status.trusted) {
        continue; // Reps marked as trusted are good no matter their status
      }

      // If we have high weight, low uptime or marked as warn, then we need to change
      if (
            rep.status.highWeight
          || rep.status.veryHighWeight
          || rep.status.lowUptime
          || rep.status.veryLowUptime
          || rep.status.warn
        ) {
          needsChange.push(rep);
      }
    }

    this.changeableReps = needsChange;
    this.changeableReps$.next(needsChange);

    return needsChange;
  }

  /**
   * Get a detailed overview of representatives for all acounts in the wallet
   * @returns {Promise<FullRepresentativeOverview[]>}
   */
  async getRepresentativesOverview(): Promise<FullRepresentativeOverview[]> {
    // First get the details of all representatives for accounts in our wallet
    const accounts = await this.wallet.getAccountsDetails();
    const uniqueReps = this.getUniqueRepresentatives(accounts);
    const representatives = await this.getRepresentativesDetails(uniqueReps);
    const [onlineReps, monitored] = await Promise.all([
      this.getOnlineRepresentatives(),
      this.representativeMonitor?.getSnapshot?.() ?? Promise.resolve(null)
    ]);
    const quorum = await this.api.confirmationQuorum();

    const online_stake_total = quorum ? this.util.nano.rawToMnano(quorum.online_stake_total) : null;
    this.onlineStakeTotal = online_stake_total ? new BigNumber(online_stake_total) : null;

    const allReps: FullRepresentativeOverview[] = [];

    // Now, loop through each representative and determine some details about it
    for (const representative of representatives) {
      const monitorRep = monitored?.byAccount[representative.account.toLowerCase()] || null;
      // Prefer the selected RPC's view of recent voting to a remote observer.
      const repOnline = onlineReps === null ? (monitorRep?.online ?? null) : onlineReps.includes(representative.account);
      const knownRep = this.getRepresentative(representative.account);

      const nanoWeight = this.util.nano.rawToMnano(representative.weight || 0);
      const percent = this.onlineStakeTotal ? nanoWeight.div(this.onlineStakeTotal).times(100) : new BigNumber(0);

      const repStatus: RepresentativeStatus = {
        online: repOnline,
        veryHighWeight: false,
        highWeight: false,
        veryLowUptime: false,
        lowUptime: false,
        closing: false,
        markedToAvoid: false,
        markedAsNF: false,
        trusted: false,
        daysSinceLastVoted: 0,
        changeRequired: false,
        warn: false,
        known: false,
        uptime: null,
        score: null
      };

      // Determine the status based on some factors
      let status = 'none';
      let label;

      if (percent.gte(3)) {
        status = 'alert'; // Has extremely high voting weight
        repStatus.veryHighWeight = true;
        repStatus.changeRequired = true;
      } else if (percent.gte(2)) {
        status = 'warn'; // Has high voting weight
        repStatus.highWeight = true;
      }

      // Check hardcoded NF reps (override below if trusted but leave markedAsNF intact)
      const nf = this.nfReps.find(bad => bad.id === representative.account);
      if (nf) {
        repStatus.markedAsNF = true;
        repStatus.changeRequired = true;
        repStatus.warn = true;
        status = 'alert';
      }

      // A locally saved name is an alias, not an independent health check.
      // Trusted and explicitly avoided are deliberate local user decisions.
      if (knownRep) {
        label = knownRep.name;
        repStatus.known = true;
        if (knownRep.trusted) {
          status = 'trusted';
          repStatus.trusted = true;
          repStatus.changeRequired = false;
          repStatus.warn = false;
        }
        if (knownRep.warn) {
          status = 'alert';
          repStatus.markedToAvoid = true;
          repStatus.warn = true;
          repStatus.changeRequired = true;
        }
      } else {
        label = monitorRep?.name || getDirectoryRepresentativeName(representative.account);
      }
      // No inferred negative rating from missing archived directory entries.
      // Lack of third-party telemetry is unknown, not unhealthy.
      if (status === 'none') status = 'unknown';

      // Only promote a genuinely unknown evaluation. Positive independent
      // observations never cancel local warnings, high voting weight, or
      // a poor historical uptime reported by another source.
      // The UI will explicitly attribute this indicative status to NanoNode.de.
      if ((status === 'none' || status === 'unknown') &&
          !repStatus.warn && !repStatus.changeRequired &&
          hasPositiveNanoNodeHealthEvidence(monitorRep)) {
        status = 'monitorGood';
      }

      const additionalData = {
        id: representative.account,
        percent: percent,
        statusText: status,
        label: label ?? null,
        status: repStatus,

        networkObservation: {
          online: repOnline,
          source: onlineReps !== null ? 'rpc' as const : monitorRep ? 'nanonode' as const : null,
          rpcOnline: onlineReps === null ? null : onlineReps.includes(representative.account),
          nanonodeOnline: monitorRep?.online ?? null,
          observedAt: monitorRep ? monitored!.takenAt : null,
          version: monitorRep?.node?.version ?? null,
          inSync: monitorRep?.node?.inSync ?? null,
          verdict: monitorRep?.verdict ?? null
        }
      };

      const fullRep = { ...representative, ...additionalData };
      allReps.push(fullRep);
    }

    this.walletReps = allReps;
    this.walletReps$.next(allReps);

    return allReps;
  }

  /**
   * Build a list of unique representatives based on the accounts provided
   * Many accounts may share the same representative
   * @param accounts
   * @returns {RepresentativeOverview[]}
   */
  getUniqueRepresentatives(accounts: WalletApiAccount[]): RepresentativeOverview[] {
    const representatives: RepresentativeOverview[] = [];
    for (const account of accounts) {
      if (!account || !account.representative) continue; // Account doesn't exist yet

      const existingRep = representatives.find(rep => rep.id === account.representative);
      if (existingRep) {
        existingRep.weight = existingRep.weight.plus(new BigNumber(account.balance));
        existingRep.accounts.push(account);
      } else {
        const newRep = {
          id: account.representative,
          weight: new BigNumber(account.balance),
          accounts: [account],
        };
        representatives.push(newRep);
      }
    }

    return representatives;
  }

  /**
   * Get a list of all online representatives
   * @returns {Promise<string[]>}
   */
  async getOnlineRepresentatives(): Promise<string[] | null> {
    const representatives: string[] = [];
    let reps;
    try {
      reps = await this.api.representativesOnline();
    } catch (_) {
      console.warn('Online representative information is unavailable from this RPC server.');
      return null;
    }
    if (!reps || reps.error || !reps.representatives) return null;
    for (const representative in reps.representatives) {
      if (!reps.representatives.hasOwnProperty(representative)) continue;
      representatives.push(reps.representatives[representative]);
    }

    return representatives;
  }

  /**
   * Add detailed API information to each representative
   * Note: The uglyness allows for requests to run in parallel
   * @param {RepresentativeOverview[]} representatives
   * @returns {Promise<RepresentativeApiOverview[]>}
   */
  async getRepresentativesDetails(representatives: RepresentativeOverview[]): Promise<RepresentativeApiOverview[]> {
    const repInfos = await Promise.all(
      representatives.map(rep =>
        this.api.accountInfo(rep.id)
          .then((res: RepresentativeApiOverview) => {
            res.account = rep.id;
            res.delegatedWeight = rep.weight;
            res.accounts = rep.accounts;

            return res;
          })
      )
    );

    return repInfos;
  }

  /**
   * Load the stored/known representative list from local storage
   * @returns {StoredRepresentative[]}
   */
  loadRepresentativeList(): StoredRepresentative[] {
    if (this.loaded) return this.representatives;

    let list = this.defaultRepresentatives.map(rep => ({ ...rep }));
    const representativeStore = localStorage.getItem(this.storeKey);
    if (representativeStore) {
      list = JSON.parse(representativeStore);
    }
    // Seed a trusted Twister32 once into previously saved address books.
    // Preserve existing entries and user changes made after migration.
    if (localStorage.getItem(this.defaultRepresentativeMigrationKey) !== '1') {
      if (!list.some(rep => rep.id.toLowerCase() === DEFAULT_REPRESENTATIVE.id)) {
        list.unshift({ ...DEFAULT_REPRESENTATIVE });
        localStorage.setItem(this.storeKey, JSON.stringify(list));
      }
      localStorage.setItem(this.defaultRepresentativeMigrationKey, '1');
    }
    this.representatives = list;
    this.representatives$.next(list);
    this.loaded = true;

    return list;
  }

  patchXrbPrefixData() {
    const representativeStore = localStorage.getItem(this.storeKey);
    if (!representativeStore) return;

    const list: StoredRepresentative[] = JSON.parse(representativeStore);

    const newRepList = list.map(entry => {
      if (entry.id.indexOf('xrb_') !== -1) {
        entry.id = entry.id.replace('xrb_', 'nano_');
      }
      return entry;
    });

    localStorage.setItem(this.storeKey, JSON.stringify(newRepList));

    return true;
  }

  getRepresentative(id: string): StoredRepresentative | undefined {
    return this.representatives.find(rep => rep.id === id);
  }

  // Reset representatives list to the default one
  resetRepresentativeList() {
    localStorage.removeItem(this.storeKey);
    this.representatives = this.defaultRepresentatives.map(rep => ({ ...rep }));
    this.representatives$.next(this.representatives);
    this.loaded = false;
  }


  saveRepresentative(accountID: string, name: string, trusted = false, warn = false): void {
    const newRepresentative: StoredRepresentative = {
      id: accountID,
      name: name,
    };
    if (trusted) newRepresentative.trusted = true;
    if (warn) newRepresentative.warn = true;

    const existingRepresentative = this.representatives.find(
      r => r.name.toLowerCase() === name.toLowerCase() || r.id.toLowerCase() === accountID.toLowerCase()
    );
    if (existingRepresentative) {
      this.representatives.splice(this.representatives.indexOf(existingRepresentative), 1, newRepresentative);
    } else {
      this.representatives.push(newRepresentative);
    }

    this.saveRepresentatives();
    this.representatives$.next(this.representatives);
  }

  deleteRepresentative(accountID: string): void {
    const existingIndex = this.representatives.findIndex(a => a.id.toLowerCase() === accountID.toLowerCase());
    if (existingIndex === -1) return;

    this.representatives.splice(existingIndex, 1);

    this.saveRepresentatives();
    this.representatives$.next(this.representatives);
  }

  saveRepresentatives(): void {
    localStorage.setItem(this.storeKey, JSON.stringify(this.representatives));
  }

  getSortedRepresentatives() {
    const weightedReps = this.representatives.map(r => {
      if (r.trusted) {
        r.weight = 2;
      } else if (r.warn) {
        r.weight = 0;
      } else {
        r.weight = 1;
      }
      return r;
    });

    return weightedReps.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  }

  nameExists(name: string): boolean {
    return this.representatives.findIndex(a => a.name.toLowerCase() === name.toLowerCase()) !== -1;
  }

  // Default representatives list
  defaultRepresentatives: StoredRepresentative[] = [{ ...DEFAULT_REPRESENTATIVE }];

  // Bad representatives hardcoded to be avoided. Not visible in the user rep list
  nfReps = [
    {
      id: 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
      name: 'Nano Foundation #1',
    },
    {
      id: 'nano_1stofnrxuz3cai7ze75o174bpm7scwj9jn3nxsn8ntzg784jf1gzn1jjdkou',
      name: 'Nano Foundation #2',
    },
    {
      id: 'nano_1q3hqecaw15cjt7thbtxu3pbzr1eihtzzpzxguoc37bj1wc5ffoh7w74gi6p',
      name: 'Nano Foundation #3',
    },
    {
      id: 'nano_3dmtrrws3pocycmbqwawk6xs7446qxa36fcncush4s1pejk16ksbmakis78m',
      name: 'Nano Foundation #4',
    },
    {
      id: 'nano_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k',
      name: 'Nano Foundation #5',
    },
    {
      id: 'nano_1awsn43we17c1oshdru4azeqjz9wii41dy8npubm4rg11so7dx3jtqgoeahy',
      name: 'Nano Foundation #6',
    },
    {
      id: 'nano_1anrzcuwe64rwxzcco8dkhpyxpi8kd7zsjc1oeimpc3ppca4mrjtwnqposrs',
      name: 'Nano Foundation #7',
    },
    {
      id: 'nano_1hza3f7wiiqa7ig3jczyxj5yo86yegcmqk3criaz838j91sxcckpfhbhhra1',
      name: 'Nano Foundation #8',
    },
  ];

}
