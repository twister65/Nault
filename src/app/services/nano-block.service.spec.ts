import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { NanoBlockService } from './nano-block.service';

describe('NanoBlockService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [NanoBlockService]
    });
  });

  it('should be created', inject([NanoBlockService], (service: NanoBlockService) => {
    expect(service).toBeTruthy();
  }));
});


describe('NanoBlockService Ledger signing boundary (#58)', () => {
  function setup() {
    // Isolate the transaction path: the unit test must not open real Bluetooth.
    const service = Object.create(NanoBlockService.prototype) as any;
    const account = {id: 'nano_test', index: 0};
    service.api = {
      accountInfo: jasmine.createSpy('accountInfo').and.resolveTo({
        frontier: 'previous', representative: 'nano_representative', balance: '1000'
      }),
      process: jasmine.createSpy('process').and.resolveTo({hash: 'processed'})
    };
    service.util = { account: { getAccountPublicKey: jasmine.createSpy('getAccountPublicKey').and.returnValue('public-key') } };
    service.validateAccount = jasmine.createSpy('validateAccount').and.resolveTo();
    service.settings = { settings: {} };
    service.workPool = {
      workExists: jasmine.createSpy('workExists').and.returnValue(true),
      getWork: jasmine.createSpy('getWork').and.resolveTo('work'),
      addWorkToCache: jasmine.createSpy('addWorkToCache'),
      removeFromCache: jasmine.createSpy('removeFromCache')
    };
    service.notifications = {
      sendInfo: jasmine.createSpy('sendInfo'),
      sendWarning: jasmine.createSpy('sendWarning'),
      removeNotification: jasmine.createSpy('removeNotification')
    };
    service.ledgerService = {
      withSigningSession: jasmine.createSpy('withSigningSession').and.callFake((task: () => Promise<any>) => task()),
      updateCache: jasmine.createSpy('updateCache').and.resolveTo(),
      signBlock: jasmine.createSpy('signBlock').and.resolveTo({signature: 'signed'})
    };
    return {service, account};
  }

  it('keeps cacheBlock and signBlock in one reserved session and submits once', async () => {
    const {service, account} = setup();
    expect(await service.generateSend(account, 'nano_destination', '1', true)).toBe('processed');
    expect(service.ledgerService.withSigningSession).toHaveBeenCalledTimes(1);
    expect(service.ledgerService.updateCache).toHaveBeenCalledTimes(1);
    expect(service.ledgerService.signBlock).toHaveBeenCalledTimes(1);
    expect(service.api.process).toHaveBeenCalledTimes(1);
  });

  it('does not sign again or submit a block when the Ledger is busy', async () => {
    const {service, account} = setup();
    service.ledgerService.withSigningSession.and.rejectWith({id: 'TransportLocked'});
    expect(await service.generateSend(account, 'nano_destination', '1', true)).toBeUndefined();
    expect(service.ledgerService.withSigningSession).toHaveBeenCalledTimes(1);
    expect(service.ledgerService.signBlock).not.toHaveBeenCalled();
    expect(service.api.process).not.toHaveBeenCalled();
    expect(service.notifications.sendWarning).toHaveBeenCalledWith(
      'Ledger is busy. Wait a moment and try signing again.'
    );
  });

  it('distinguishes explicit 0x6985 refusal without retrying or publishing', async () => {
    const {service, account} = setup();
    service.ledgerService.signBlock.and.rejectWith({statusCode: 0x6985});
    expect(await service.generateSend(account, 'nano_destination', '1', true)).toBeUndefined();
    expect(service.ledgerService.signBlock).toHaveBeenCalledTimes(1);
    expect(service.api.process).not.toHaveBeenCalled();
    expect(service.notifications.sendWarning).toHaveBeenCalledWith('Transaction denied on Ledger device');
  });
});
