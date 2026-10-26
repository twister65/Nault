import { Component, ElementRef, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {WalletService} from '../../services/wallet.service';
import {NotificationService} from '../../services/notification.service';
import {LedgerService, LedgerStatus} from '../../services/ledger.service';
import {AppSettingsService} from '../../services/app-settings.service';
import {PowService} from '../../services/pow.service';

@Component({
    selector: 'app-wallet-widget',
    templateUrl: './wallet-widget.component.html',
    styleUrls: ['./wallet-widget.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WalletWidgetComponent implements OnInit {
  private readonly translocoService = inject(TranslocoService);

  wallet = this.walletService.wallet;

  // The service owns the current connection status. The event stream adds
  // diagnostic text, but can lag a synchronous transport reset made by the
  // wallet setup screen; never render a stale READY status from that stream.
  private lastReportedLedgerStatus = {
    status: 'not-connected',
    statusText: '',
  };

  get ledgerStatus(): { status: string; statusText: string } {
    const status = this.ledgerService.ledger.status;
    return {
      status,
      statusText: this.lastReportedLedgerStatus.status === status
        ? this.lastReportedLedgerStatus.statusText
        : '',
    };
  }
  powAlert = false;

  unlockPassword = '';

  modal: any = null;
  mayAttemptUnlock = true;
  timeoutIdAllowingUnlock: any = null;

  constructor(
    public walletService: WalletService,
    private notificationService: NotificationService,
    public ledgerService: LedgerService,
    public settings: AppSettingsService,
    private powService: PowService) { }

  // The PWA is not Electron: choose its reconnect label from the transport,
  // not from isDesktop. In particular, ChromeOS PWAs can use WebUSB/WebHID
  // with a Nano S Plus, which has no Bluetooth radio.
  get reconnectTransportTranslationKey(): string {
    return this.ledgerService.transportMode === 'Bluetooth'
      ? 'ui-ledger.reconnect-via-bluetooth'
      : 'ui-ledger.reconnect-via-usb';
  }

  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    const UIkit = (window as any).UIkit;
    const modal = UIkit.modal(document.getElementById('unlock-wallet-modal'));
    UIkit.util.on('#unlock-wallet-modal', 'hidden', () => {
      this.onModalHidden();
    });
    this.modal = modal;

    this.ledgerService.ledgerStatus$.subscribe((ledgerStatus) => {
      this.lastReportedLedgerStatus = ledgerStatus;
    });

    // Detect if a PoW is taking too long and alert
    this.powService.powAlert$.subscribe(async shouldAlert => {
      if (shouldAlert) {
        this.powAlert = true;
      } else {
        this.powAlert = false;
      }
    });

    this.walletService.wallet.unlockModalRequested$.subscribe(async wasRequested => {
      if (wasRequested === true) {
        this.showModal();
      }
    });
  }

  showModal() {
    this.unlockPassword = '';
    this.modal.show();
  }

  onModalHidden() {
    this.unlockPassword = '';
    this.walletService.wallet.unlockModalRequested$.next(false);
  }

  async lockWallet() {
    if (this.wallet.type === 'ledger') {
      return; // No need to lock a ledger wallet, no password saved
    }
    if (!this.wallet.password) {
      return this.notificationService.sendWarning(this.translocoService.translate('ui-notifications.wallet-password-required'));
    }
    const locked = await this.walletService.lockWallet();
    if (locked) {
      this.notificationService.sendSuccess(this.translocoService.translate('ui-notifications.wallet-locked'));
    } else {
      this.notificationService.sendError(this.translocoService.translate('ui-notifications.wallet-lock-failed'));
    }
  }

  async reconnectUsb() {
    if (!this.ledgerService.isDesktop) return;
    // Transport choice is explicit. Disabling Bluetooth on the hardware
    // does not reset Nault's persisted Bluetooth preference.
    // Keep the existing wallet and switch only the Ledger transport.
    this.ledgerService.enableBluetoothMode(false);
    await this.reloadLedger();
  }

  async reconnectBluetooth() {
    if (!this.ledgerService.isDesktop || !this.ledgerService.supportsBluetooth) return;
    // Switch transport without going through "Configure Wallet", which can
    // overwrite an existing wallet configuration. Keep the user gesture for
    // navigator.bluetooth.requestDevice().
    this.ledgerService.enableBluetoothMode(true);
    await this.reloadLedger();
  }

  async reloadLedger() {
    this.notificationService.sendInfo(this.translocoService.translate('ui-notifications.ledger-checking'), { identifier: 'ledger-status', length: 0 });
    try {
      // A manual status click is an explicit reconnect request for Bluetooth.
      // Do not reuse a transport whose radio session might be stale.
      await this.ledgerService.loadLedger(false, this.ledgerService.transportMode === 'Bluetooth');
      this.notificationService.removeNotification('ledger-status');
      if (this.ledgerStatus.status === LedgerStatus.READY) {
        this.notificationService.sendSuccess(this.translocoService.translate('ui-notifications.ledger-connected'));
      }
    } catch (err) {
      console.log(`Got error when loading ledger! `, err);
      this.notificationService.removeNotification('ledger-status');
      // this.notificationService.sendError(`Unable to load Ledger Device: ${err.message}`);
    }
  }

  /**
   * Chromium/BlueZ may acknowledge BLE notifications but stop dispatching
   * characteristicvaluechanged after a radio reconnect. Recreating the
   * document gives Web Bluetooth a fresh execution context without restarting
   * the native Electron process. This is an explicit recovery action only.
   */
  get canResetBluetoothSession(): boolean {
    return this.ledgerService.isDesktop &&
      this.ledgerService.transportMode === 'Bluetooth' &&
      this.ledgerStatus.status === LedgerStatus.NOT_CONNECTED &&
      (this.ledgerStatus.statusText || '').includes('MTU negotiation timed out');
  }

  resetBluetoothSession() {
    if (!this.canResetBluetoothSession) return;
    // No automatic retry of pending Ledger signatures or transfers.
    // The user explicitly requests this reload after the failed handshake.
    window.location.reload();
  }

  allowUnlock(params: any) {
    this.mayAttemptUnlock = true;
    this.timeoutIdAllowingUnlock = null;
    this.unlockPassword = '';

    if (params.focusInputElement === true) {
      setTimeout(() => { this.passwordInput.nativeElement.focus(); }, 10);
    }
  }

  async unlockWallet() {
    if (this.mayAttemptUnlock === false) {
      return;
    }

    this.mayAttemptUnlock = false;

    if (this.timeoutIdAllowingUnlock !== null) {
      clearTimeout(this.timeoutIdAllowingUnlock);
    }

    this.timeoutIdAllowingUnlock = setTimeout(
      () => {
        this.allowUnlock({ focusInputElement: true });
      },
      500
    );

    const unlocked = await this.walletService.unlockWallet(this.unlockPassword);

    if (unlocked) {
      this.notificationService.sendSuccess(this.translocoService.translate('ui-notifications.wallet-unlocked'));
      this.modal.hide();
      if (this.unlockPassword.length < 6) {
        // eslint-disable-next-line max-len
        this.notificationService.sendWarning(this.translocoService.translate('ui-notifications.wallet-password-weak'));
      }

      if (this.timeoutIdAllowingUnlock !== null) {
        clearTimeout(this.timeoutIdAllowingUnlock);
        this.timeoutIdAllowingUnlock = null;
      }

      this.allowUnlock({ focusInputElement: false });
    } else {
      this.notificationService.sendError(this.translocoService.translate('ui-notifications.wallet-password-incorrect'));
    }
  }

  cancelPow() {
    this.powService.cancelAllPow(true);
  }

}
