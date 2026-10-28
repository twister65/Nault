import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ManageWalletComponent } from './manage-wallet.component';

describe('ManageWalletComponent', () => {
  let component: ManageWalletComponent;
  let fixture: ComponentFixture<ManageWalletComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ManageWalletComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('generates a compatible 24-word backup without Node stream hashing', async () => {
    // Public deterministic BIP39 test vector; never a wallet for real funds.
    const isolated = Object.create(ManageWalletComponent.prototype) as any;
    isolated.wallet = { type: 'seed', seed: '00'.repeat(32), locked: false };
    isolated.mnemonicGeneration = 0;
    isolated.seedMnemonicValue = '';
    await isolated.refreshSeedMnemonic(false);
    expect(isolated.seedMnemonicValue).toBe(Array(23).fill('abandon').concat('art').join(' '));
    isolated.wallet.locked = true;
    await isolated.refreshSeedMnemonic(true);
    expect(isolated.seedMnemonicValue).toBe('');
  });

});
