import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { RepresentativeService } from './representative.service';
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
