import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { RepresentativeService } from './representative.service';
import { DEFAULT_REPRESENTATIVE } from './default-representative';
import BigNumber from 'bignumber.js';

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
});
