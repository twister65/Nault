import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';

import { RepresentativesComponent } from './representatives.component';
import { BehaviorSubject } from 'rxjs';

describe('RepresentativesComponent', () => {
  let component: RepresentativesComponent;
  let fixture: ComponentFixture<RepresentativesComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RepresentativesComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Representative change transaction outcome', () => {
  function setup(result: string | null | undefined) {
    // Test RPC acceptance/failure without any physical Ledger or transactions.
    const component = Object.create(RepresentativesComponent.prototype) as any;
    component.selectedAccounts = [{ id: 'nano_account' }];
    component.toRepresentativeID = 'nano_target';
    component.fullAccounts = [{ id: 'nano_account', representative: 'nano_previous' }];
    component.changingRepresentatives = false;
    component.hideOverview = false;
    component.loadingRepresentatives = false;
    component.walletService = {
      isLocked: () => false,
      isLedgerWallet: () => true,
      getWalletAccount: () => ({ id: 'nano_account', index: 0 }),
      wallet: { accounts: [{ id: 'nano_account' }] }
    };
    component.util = { account: { isValidAccount: () => true } };
    component.nanoBlock = { generateChange: jasmine.createSpy('generateChange').and.resolveTo(result) };
    component.notifications = {
      sendSuccess: jasmine.createSpy('sendSuccess'),
      sendWarning: jasmine.createSpy('sendWarning'),
      sendError: jasmine.createSpy('sendError'),
      sendInfo: jasmine.createSpy('sendInfo')
    };
    component.translocoService = { translate: (key: string) => key };
    component.representativeService = {
      getRepresentativesOverview: jasmine.createSpy('getRepresentativesOverview').and.resolveTo([]),
      detectChangeableReps: jasmine.createSpy('detectChangeableReps').and.resolveTo([]),
      saveRepresentative: jasmine.createSpy('saveRepresentative')
    };
    return component;
  }

  it('does not show success when the disconnected Ledger returns no block hash', async () => {
    const component = setup(undefined);
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendError).toHaveBeenCalled();
    expect(component.selectedAccounts).toEqual([{ id: 'nano_account' }]);
    expect(component.toRepresentativeID).toBe('nano_target');
    expect(component.representativeService.getRepresentativesOverview).not.toHaveBeenCalled();
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('does not show success when signing throws or the RPC rejects a block', async () => {
    const component = setup(null);
    component.nanoBlock.generateChange.and.rejectWith(new Error('Transport unavailable'));
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendError).toHaveBeenCalled();
    expect(component.selectedAccounts.length).toBe(1);
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('reports success and resets the form only after the RPC accepts a block', async () => {
    const component = setup('block-hash');
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).toHaveBeenCalledTimes(1);
    expect(component.selectedAccounts).toEqual([]);
    expect(component.toRepresentativeID).toBe('');
    expect(component.representativeService.getRepresentativesOverview).toHaveBeenCalled();
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('reports partial success and retains only failed accounts for retry', async () => {
    const component = setup('block-hash');
    component.selectedAccounts = [{ id: 'nano_account' }, { id: 'nano_second' }];
    component.fullAccounts.push({ id: 'nano_second', representative: 'nano_previous' });
    component.walletService.getWalletAccount = (id: string) => ({ id, index: id === 'nano_account' ? 0 : 1 });
    component.nanoBlock.generateChange.and.returnValues(Promise.resolve('block-hash'), Promise.resolve(null));
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendWarning).toHaveBeenCalledWith('ui-notifications.rep-updated-partial');
    expect(component.selectedAccounts).toEqual([{ id: 'nano_second' }]);
    expect(component.toRepresentativeID).toBe('nano_target');
  });
});

describe('Inline representative picker', () => {
  const twister = 'nano_3hn3r6bnnmcy39gu6fgtisgnqh384gmt5mnh71a5xo4cb1d38ps16p8sg5c3';
  const trustable = 'nano_1b9wguhh39at8qtm93oghd6r4f4ubk7zmqc9oi5ape6yyz4s1gamuwn3jjit';
  function setup() {
    const component = Object.create(RepresentativesComponent.prototype) as any;
    component.toRepresentativeID = '';
    component.browseRepresentativeList = false;
    component.representativeSearch = '';
    component.onlyOnlineReps = false;
    component.onlyMonitoredGoodReps = false;
    component.representativeOverview = [];
    component.visibleRepresentativeLimit = 12;
    component.matchingRepresentativeCount = 0;
    component.showRepresentatives = false;
    component.representativeResults$ = new BehaviorSubject<any[]>([]);
    component.representativeList = [
      {id: twister, name: 'Twister32', trusted: true},
      {id: trustable, name: 'TRUSTABLE - NN1'},
    ];
    component.monitorSnapshot = {
      byAccount: {
        [twister]: {account:twister,online:true,share:0.00001,node:null},
        [trustable]: {account:trustable,online:false,share:0.0002,node:null}
      }
    };
    component.representativeService = {getRepresentative: () => undefined};
    return component;
  }

  it('prioritizes and filters representatives with positive NanoNode health evidence', () => {
    const component = setup();
    const nanolove = 'nano_34amtofxstsfyqcgphp8piij9u33widykg9wbz6ysjpxhbgmqu8btu1eexer';
    component.representativeList.push({id: nanolove, name: 'Nanolove'});
    component.monitorSnapshot.byAccount[nanolove] = {
      account: nanolove, name: 'Nanolove', online: true, principal: true,
      weight: 624047, share: 0.007, verdict: 'good', crowded: false,
      outdated: false, node: {implementation: 'nano-node', version: '28.2', inSync: true}
    };
    component.browseRepresentativeList = true;
    component.searchRepresentatives();
    expect(component.isMonitoredGoodRepresentative(nanolove)).toBeTrue();
    expect(component.representativeResults$.value[0].id).toBe(twister); // Locally trusted stays first
    expect(component.representativeResults$.value[1].id).toBe(nanolove);
    component.toggleMonitoredGoodOnly();
    expect(component.onlyMonitoredGoodReps).toBeTrue();
    expect(component.representativeResults$.value.map((rep: {id: string}) => rep.id)).toEqual([nanolove]);
    component.onlyMonitoredGoodReps = false;
    component.monitorSnapshot.byAccount[nanolove].node.inSync = false;
    component.searchRepresentatives();
    expect(component.isMonitoredGoodRepresentative(nanolove)).toBeFalse();
  });

  it('does not show an unrequested drop-down on empty input', () => {
    const component = setup();
    component.searchRepresentatives();
    expect(component.showRepresentatives).toBeFalse();
    expect(component.representativeResults$.value).toEqual([]);
  });

  it('keeps the inline list open when an address field loses focus before a browse click', fakeAsync(() => {
    const component = setup();
    component.toRepresentativeID = '';
    // The blur previously scheduled a 400 ms close, after the Browse click.
    void component.validateRepresentative();
    component.toggleRepresentativeBrowser();
    expect(component.showRepresentatives).toBeTrue();
    expect(component.representativeResults$.value.length).toBe(2);
    tick(450);
    expect(component.browseRepresentativeList).toBeTrue();
    expect(component.showRepresentatives).toBeTrue();
    // The very next click closes it; no desynchronised third-click behaviour.
    component.toggleRepresentativeBrowser();
    expect(component.showRepresentatives).toBeFalse();
    component.toggleRepresentativeBrowser();
    expect(component.showRepresentatives).toBeTrue();
  }));

  it('does not close the browser when a pending monitor/directory refresh completes', fakeAsync(() => {
    const component = setup();
    component.representativeMonitor = {getSnapshot: () => Promise.resolve({
      representatives: [{account: twister, name: 'Twister32', online: true}],
      byAccount: {[twister]: {account: twister, online: true}}
    })};
    component.representativeService.getSortedRepresentatives = () => [{id: twister, name: 'Twister32', trusted: true}];
    component.representativeList = [];
    component.toggleRepresentativeBrowser(); // opened before fetch finishes
    expect(component.showRepresentatives).toBeTrue();
    void component.populateRepresentativeList();
    tick(0);
    expect(component.browseRepresentativeList).toBeTrue();
    expect(component.showRepresentatives).toBeTrue();
    expect(component.representativeResults$.value.some((rep: {id: string}) => rep.id === twister)).toBeTrue();
  }));

  it('finds representatives by name or address and excludes offline observations on request', () => {
    const component = setup();
    component.browseRepresentativeList = true;
    component.representativeSearch = 'TRUSTABLE';
    component.searchRepresentatives();
    expect(component.representativeResults$.value[0].id).toBe(trustable);
    component.representativeSearch = '3hn3r6bn';
    component.searchRepresentatives();
    expect(component.representativeResults$.value[0].id).toBe(twister);
    component.onlyOnlineReps = true;
    component.representativeSearch = 'TRUSTABLE';
    component.searchRepresentatives();
    expect(component.representativeResults$.value).toEqual([]);
  });

  it('keeps the wallet current representative in the first 12 results even without the online-only filter', () => {
    const component = setup();
    const currentRep = {id: 'nano_1tk1xkcokgw4gmoq7fjbb7hd8gpzfofnrbjtqijk16u5jw19qjx9zqj9y6gw', name: 'RsNano.com - Nano Rust Port'};
    component.representativeOverview = [{id: currentRep.id, networkObservation: {rpcOnline: false, nanonodeOnline: true}}];
    component.representativeList = [
      ...Array.from({length: 25}, (_, i) => ({id: 'nano_other_' + i, name: 'Example node ' + i})),
      currentRep
    ];
    component.monitorSnapshot.byAccount[currentRep.id] = {account: currentRep.id, online: true, share: 0.0227};
    component.browseRepresentativeList = true;
    component.searchRepresentatives();

    expect(component.onlyOnlineReps).toBeFalse();
    expect(component.matchingRepresentativeCount).toBe(26);
    expect(component.representativeResults$.value[0].id).toBe(currentRep.id);
    expect(component.representativeResults$.value.length).toBe(12);

    component.showMoreRepresentatives();
    expect(component.representativeResults$.value.length).toBe(24);
    component.showMoreRepresentatives();
    expect(component.representativeResults$.value.length).toBe(26);
    component.onlyOnlineReps = true;
    component.searchRepresentatives();
    expect(component.representativeResults$.value.map((rep: {id: string}) => rep.id)).toEqual([currentRep.id]);
  });

  it('keeps a current representative in the online-only list if RPC saw votes but NanoNode did not', () => {
    const component = setup();
    component.representativeOverview = [{
      id: trustable,
      networkObservation: {rpcOnline: true, nanonodeOnline: false}
    }];
    component.browseRepresentativeList = true;
    component.onlyOnlineReps = true;
    component.searchRepresentatives();
    expect(component.representativeResults$.value.some((rep: {id: string}) => rep.id === trustable)).toBeTrue();
  });

  it('displays RPC and NanoNode.de votes independently in the status information bubble', () => {
    const component = setup();
    component.translocoService = {translate: (key: string) => ({
      'ui-representatives.observed-online': 'Votes observés',
      'ui-representatives.not-observed': 'Aucun vote récent observé',
      'ui-representatives.observation-unavailable': 'Observation indisponible'
    } as Record<string, string>)[key]};
    const rep = {networkObservation: {rpcOnline: false, nanonodeOnline: true}};
    expect(component.getVoteObservationsTooltip(rep))
      .toBe('RPC : Aucun vote récent observé • NanoNode.de : Votes observés');
    expect(component.getVoteObservationsTooltip({networkObservation: {rpcOnline: null, nanonodeOnline: undefined}}))
      .toBe('RPC : Observation indisponible • NanoNode.de : Observation indisponible');
  });

  it('preserves a local trusted flag independently of monitor data', () => {
    const component = setup();
    component.toggleRepresentativeBrowser();
    expect(component.representativeResults$.value[0].trusted).toBeTrue();
    expect(component.getMonitoredRepresentative(trustable).online).toBeFalse();
  });

  it('shows a small share as 0,0015 % rather than 0,00 % in French', () => {
    const component = setup();
    component.translocoService = { getActiveLang: () => 'fr' };
    expect(component.formatVotingWeightShare(0.00001548707245931864).replace(/\s/g, '')).toBe('0,0015%');
    expect(component.formatVotingWeightShare(0.0002).replace(/\s/g, '')).toBe('0,02%');
  });

  it('uses the current language and does not report a tiny positive share as zero', () => {
    const component = setup();
    component.translocoService = { getActiveLang: () => 'en' };
    expect(component.formatVotingWeightShare(0.00001548707245931864).replace(/\s/g, '')).toBe('0.0015%');
    expect(component.formatVotingWeightShare(0.0000000001).replace(/\s/g, '')).toBe('<0.0001%');
    expect(component.formatVotingWeightShare(null)).toBe('');
    expect(component.formatVotingWeightShare(-1)).toBe('');
  });
});
