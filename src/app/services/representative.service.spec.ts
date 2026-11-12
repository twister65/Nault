import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { RepresentativeService, hasPositiveNanoNodeHealthEvidence } from './representative.service';
import { DEFAULT_REPRESENTATIVE } from './default-representative';
import BigNumber from 'bignumber.js';
import { getDirectoryRepresentativeName } from './representative-directory';

describe('RepresentativeService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [RepresentativeService]
    });
  });

  it('should be created', inject([RepresentativeService], (service: RepresentativeService) => {
    expect(service).toBeTruthy();
  }));

  it('seeds Twister32 as trusted on a fresh launch, and restores it on reset', inject(
    [RepresentativeService], (service: RepresentativeService) => {
      const saved = localStorage.getItem(service.storeKey);
      const markerKey = 'nanovault-known-representative-twister32-v1';
      const marker = localStorage.getItem(markerKey);
      try {
        localStorage.removeItem(service.storeKey);
        localStorage.removeItem(markerKey);
        expect(service.loadRepresentativeList()).toEqual([{ ...DEFAULT_REPRESENTATIVE }]);
        service.resetRepresentativeList();
        expect(service.loadRepresentativeList()).toEqual([{ ...DEFAULT_REPRESENTATIVE }]);
      } finally {
        if (saved === null) localStorage.removeItem(service.storeKey);
        else localStorage.setItem(service.storeKey, saved);
        if (marker === null) localStorage.removeItem(markerKey);
        else localStorage.setItem(markerKey, marker);
      }
    }
  ));

  it('migrates an existing address book once without overriding later user removals', inject(
    [RepresentativeService], (service: RepresentativeService) => {
      const saved = localStorage.getItem(service.storeKey);
      const markerKey = 'nanovault-known-representative-twister32-v1';
      const marker = localStorage.getItem(markerKey);
      try {
        localStorage.removeItem(markerKey);
        localStorage.setItem(service.storeKey, JSON.stringify([{ id: 'nano_other', name: 'Other' }]));
        const reps = service.loadRepresentativeList();
        expect(reps.length).toBe(2);
        expect(reps[0]).toEqual({ ...DEFAULT_REPRESENTATIVE });
        expect(reps[1].name).toBe('Other');
        service.deleteRepresentative(DEFAULT_REPRESENTATIVE.id);
        service.loaded = false;
        expect(service.loadRepresentativeList().some(rep => rep.id === DEFAULT_REPRESENTATIVE.id)).toBeFalse();
      } finally {
        if (saved === null) localStorage.removeItem(service.storeKey);
        else localStorage.setItem(service.storeKey, saved);
        if (marker === null) localStorage.removeItem(markerKey);
        else localStorage.setItem(markerKey, marker);
      }
    }
  ));

  it('keeps a locally trusted representative trusted if Ninja reports it missing', async () => {
    const service = Object.create(RepresentativeService.prototype) as any;
    service.wallet = { getAccountsDetails: async () => [{ id: 'nano_account', representative: DEFAULT_REPRESENTATIVE.id, balance: '1' }] };
    service.getUniqueRepresentatives = () => [{ id: DEFAULT_REPRESENTATIVE.id, weight: new BigNumber(1), accounts: [] }];
    service.getRepresentativesDetails = async () => [{ account: DEFAULT_REPRESENTATIVE.id, weight: '0', delegatedWeight: new BigNumber(1), accounts: [] }];
    service.getOnlineRepresentatives = async () => null;
    service.api = { confirmationQuorum: async () => null };
    service.representativeMonitor = { getSnapshot: async () => null };
    service.util = { nano: { rawToMnano: (raw: string) => new BigNumber(raw) } };
    service.ninja = { getAccount: async () => false };
    service.nfReps = [];
    service.getRepresentative = () => ({ ...DEFAULT_REPRESENTATIVE });
    service.walletReps$ = { next: jasmine.createSpy('next') };
    const overview = await service.getRepresentativesOverview();
    expect(overview[0].label).toBe('Twister32');
    expect(overview[0].statusText).toBe('trusted');
    expect(overview[0].status.trusted).toBeTrue();
  });
  it('recognizes Nano Community aliases without marking them Trusted', async () => {
    const account = 'nano_1b9wguhh39at8qtm93oghd6r4f4ubk7zmqc9oi5ape6yyz4s1gamuwn3jjit';
    const service = Object.create(RepresentativeService.prototype) as any;
    service.wallet = { getAccountsDetails: async () => [{ id: 'nano_wallet', representative: account, balance: '1' }] };
    service.getUniqueRepresentatives = () => [{ id: account, weight: new BigNumber(1), accounts: [] }];
    service.getRepresentativesDetails = async () => [{ account, weight: '0', delegatedWeight: new BigNumber(1), accounts: [] }];
    service.getOnlineRepresentatives = async () => null;
    service.api = { confirmationQuorum: async () => null };
    service.representativeMonitor = { getSnapshot: async () => null };
    service.util = { nano: { rawToMnano: (raw: string) => new BigNumber(raw) } };
    service.ninja = { getAccount: async () => null };
    service.nfReps = [];
    service.getRepresentative = () => undefined;
    service.walletReps$ = { next: jasmine.createSpy('next') };
    const overview = await service.getRepresentativesOverview();
    expect(getDirectoryRepresentativeName(account)).toBe('TRUSTABLE - NN1');
    expect(overview[0].label).toBe('TRUSTABLE - NN1');
    expect(overview[0].status.trusted).toBeFalse();
    expect(overview[0].statusText).toBe('unknown');
  });

  it('uses an observed online vote status without making the directory alias trusted', async () => {
    const account = 'nano_1b9wguhh39at8qtm93oghd6r4f4ubk7zmqc9oi5ape6yyz4s1gamuwn3jjit';
    const service = Object.create(RepresentativeService.prototype) as any;
    service.wallet = {getAccountsDetails: async () => []};
    service.getUniqueRepresentatives = () => [{id:account, weight:new BigNumber(1), accounts:[]}];
    service.getRepresentativesDetails = async () => [{account, weight:'0', delegatedWeight:new BigNumber(1), accounts:[]}];
    service.getOnlineRepresentatives = async () => null;
    service.representativeMonitor = {getSnapshot: async () => ({
      takenAt: Math.floor(Date.now()/1000),
      byAccount: {[account]:{account,name:'TRUSTABLE - NN1',online:true,verdict:'couldBeBetter',node:null}}
    })};
    service.api = {confirmationQuorum: async () => null};
    service.util = {nano: {rawToMnano: (raw: string) => new BigNumber(raw)}};
    service.ninja = {getAccount: async () => null};
    service.nfReps = [];
    service.getRepresentative = () => undefined;
    service.walletReps$ = {next: jasmine.createSpy('next')};
    const rep = (await service.getRepresentativesOverview())[0];
    expect(rep.label).toBe('TRUSTABLE - NN1');
    expect(rep.status.trusted).toBeFalse();
    expect(rep.networkObservation?.online).toBeTrue();
    expect(rep.networkObservation?.source).toBe('nanonode');
    expect(rep.networkObservation?.inSync).toBeNull();
  });

});


describe('Positive NanoNode health evidence', () => {
  const id = 'nano_34amtofxstsfyqcgphp8piij9u33widykg9wbz6ysjpxhbgmqu8btu1eexer';
  const sample = () => ({
    account: id, name: 'Nanolove', online: true, principal: true,
    weight: 620000, share: 0.007, verdict: 'good' as const,
    crowded: false, outdated: false, node: {
      implementation: 'nano-node', version: '28.2', inSync: true
    }
  });

  it('accepts an observed, synchronized principal representative with less than 2% voting weight', () => {
    expect(hasPositiveNanoNodeHealthEvidence(sample())).toBeTrue();
  });

  it('rejects votes alone, outdated nodes, unsynced telemetry, and high voting weight', () => {
    const valid = sample();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, online: false})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, principal: false})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, verdict: 'couldBeBetter'})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, share: 0.0201})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, crowded: true})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, outdated: true})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, node: {...valid.node, inSync: false}})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, node: null})).toBeFalse();
    expect(hasPositiveNanoNodeHealthEvidence(null)).toBeFalse();
  });

  it('allows comparable RsNano sync observations without treating outdated:null as a version failure', () => {
    const valid = sample();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, outdated: null, node: {
      implementation: 'rsnano', version: '3.1', inSync: true
    }})).toBeTrue();
    expect(hasPositiveNanoNodeHealthEvidence({...valid, outdated: null})).toBeFalse();
  });

  it('does not turn a Ninja 404 into a bad representative when NanoNode has positive evidence', async () => {
    const rep = sample();
    const service = Object.create(RepresentativeService.prototype) as any;
    service.wallet = {getAccountsDetails: async () => []};
    service.getUniqueRepresentatives = () => [{id, weight: new BigNumber(1), accounts: []}];
    service.getRepresentativesDetails = async () => [{account:id, weight:'0', delegatedWeight:new BigNumber(1), accounts:[]}];
    service.getOnlineRepresentatives = async () => null;
    service.representativeMonitor = {getSnapshot: async () => ({
      takenAt: Math.floor(Date.now() / 1000), byAccount: {[id]: rep}
    })};
    service.api = {confirmationQuorum: async () => null};
    service.util = {nano:{rawToMnano: (raw: string) => new BigNumber(raw)}};
    service.ninja = {getAccount: async () => false};
    service.getRepresentative = () => undefined;
    service.nfReps = [];
    service.walletReps$ = {next: jasmine.createSpy('next')};
    const overview = (await service.getRepresentativesOverview())[0];
    expect(overview.statusText).toBe('monitorGood');
    expect(overview.status.trusted).toBeFalse();
    expect(overview.status.warn).toBeFalse();
    expect(overview.networkObservation?.nanonodeOnline).toBeTrue();
    expect(overview.networkObservation?.inSync).toBeTrue();
    expect(overview.networkObservation?.verdict).toBe('good');
  });

  it('preserves the high-voting-weight warning even when NanoNode gives a good verdict', async () => {
    const rep = sample();
    const service = Object.create(RepresentativeService.prototype) as any;
    service.wallet = {getAccountsDetails: async () => []};
    service.getUniqueRepresentatives = () => [{id, weight: new BigNumber(1), accounts: []}];
    service.getRepresentativesDetails = async () => [{account:id, weight:'1', delegatedWeight:new BigNumber(1), accounts:[]}];
    service.getOnlineRepresentatives = async () => null;
    service.representativeMonitor = {getSnapshot: async () => ({
      takenAt: Math.floor(Date.now() / 1000), byAccount: {[id]: rep}
    })};
    service.api = {confirmationQuorum: async () => ({online_stake_total:'10'})};
    service.util = {nano:{rawToMnano: (raw: string) => new BigNumber(raw)}};
    service.ninja = {getAccount: async () => null};
    service.getRepresentative = () => undefined;
    service.nfReps = [];
    service.walletReps$ = {next: jasmine.createSpy('next')};
    const overview = (await service.getRepresentativesOverview())[0];
    expect(overview.statusText).toBe('alert');
    expect(overview.status.veryHighWeight).toBeTrue();
    expect(overview.status.trusted).toBeFalse();
  });
});
