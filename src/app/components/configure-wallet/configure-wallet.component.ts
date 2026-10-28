import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MIN_WALLET_PASSWORD_LENGTH, isStrongWalletPassword } from '../../services/wallet-encryption';
import {WalletService, NotificationService, RepresentativeService} from '../../services';
import {ActivatedRoute, Router} from '@angular/router';
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedHex, validateMnemonic } from '../../services/bip39-browser';
import {LedgerService, LedgerStatus, getLedgerReadinessIssue} from '../../services/ledger.service';
import {localizeNotificationMessage} from '../../services/notification-message';
import { QrModalService } from '../../services/qr-modal.service';
import type { QRType } from '../qr-modal/qr-modal.component';
import {UtilService} from '../../services/util.service';
import { wallet } from 'nanocurrency-web';
import { TranslocoService } from '@jsverse/transloco';

enum panels {
  'landing',
  'mnemonicTypeSelection',
  'import',
  'password',
  'backup',
  'final',
}

const INDEX_MAX = 4294967295; // seed index

@Component({
    selector: 'app-configure-wallet',
    templateUrl: './configure-wallet.component.html',
    styleUrls: ['./configure-wallet.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ConfigureWalletComponent implements OnInit {
  panels = panels;
  activePanel = panels.landing;
  wallet = this.walletService.wallet;
  isConfigured = this.walletService.isConfigured;
  isNewWallet = true;
  hasConfirmedBackup = false;
  importSeed = '';
  isExpanded = false;
  keyString = '';

  exampleSeed = '';
  examplePrivateKey = '';
  exampleExpandedPrivateKey = '';
  exampleMnemonicWords: string[] = [];
  showMoreImportOptions = false;

  newWalletSeed = '';
  newWalletMnemonic = '';
  newWalletMnemonicLines: string[][] = [];
  newPassword = '';
  readonly minimumPasswordLength = MIN_WALLET_PASSWORD_LENGTH;
  importSeedModel = '';
  importPrivateKeyModel = '';
  importExpandedKeyModel = '';
  importSeedMnemonicModel = '';
  importSeedBip39MnemonicModel = '';
  importSeedBip39MnemonicIndexModel = '0';
  importSeedBip39MnemonicPasswordModel = '';
  walletPasswordModel = '';
  walletPasswordConfirmModel = '';
  validIndex = true;
  indexMax = INDEX_MAX;

  selectedImportOption = 'seed';

  ledgerStatus = LedgerStatus;
  ledger = this.ledgerService.ledger;
  ledgerSetupInProgress = false;

  constructor(
    private router: ActivatedRoute,
    public walletService: WalletService,
    private notifications: NotificationService,
    private route: Router,
    private qrModalService: QrModalService,
    private ledgerService: LedgerService,
    private util: UtilService,
    private translocoService: TranslocoService) {
    const navigationState = this.route.getCurrentNavigation()?.extras.state;
    if (navigationState?.seed) {
      this.activePanel = panels.import;
      this.importSeedModel = navigationState.seed;
      this.isNewWallet = false;
    } else if (navigationState?.key) {
      this.activePanel = panels.import;
      this.importPrivateKeyModel = navigationState.key;
      this.selectedImportOption = 'privateKey';
      this.isNewWallet = false;
    }
  }

  async ngOnInit() {
    const exampleSeedBytes = this.util.account.generateSeedBytes();
    const exampleSeedFull = this.util.hex.fromUint8(exampleSeedBytes);

    let exampleSeedTrimmed = '';
    let trimIdx = 0;
    do {
      exampleSeedTrimmed = exampleSeedFull.slice(trimIdx, trimIdx + 6);
      trimIdx += 2;
    } while (
        (trimIdx < 30)
      && ( exampleSeedTrimmed.match(/^([0-9]+|[A-F]+)$/g) !== null )
    );

    // must have both letters and numbers
    this.exampleSeed = exampleSeedTrimmed + '...';

    // may have only letters or only numbers with enough luck
    this.examplePrivateKey = exampleSeedFull.slice(trimIdx + 6, trimIdx + 12) + '...';
    this.exampleExpandedPrivateKey = exampleSeedFull.slice(trimIdx + 12, trimIdx + 18) + '...';

    // array of mnemonic words
    this.exampleMnemonicWords = (await entropyToMnemonic(exampleSeedFull)).split(' ');
  }

  async importExistingWallet() {
    this.notifications.sendInfo(this.translocoService.translate('ui-notifications.wallet-scanning'), {length: 7000});
    try {
      await this.walletService.createWalletFromSeed(this.importSeed);
      // All new software-wallet data must be encrypted before reporting success.
      await this.storePassword();
      this.importSeed = '';
      this.route.navigate(['accounts']);
      this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-imported'), {length: 10000});
      this.walletService.informNewWallet();
    } catch {
      this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-encryption-failed'));
    }
  }

  async importSingleKeyWallet() {
    try {
      await this.walletService.createWalletFromSingleKey(this.keyString, this.isExpanded);
      await this.storePassword();
      this.route.navigate(['accounts']);
      this.keyString = '';
      this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-key-imported'));
      this.walletService.informNewWallet();
    } catch {
      this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-encryption-failed'));
    }
  }

  // "Use Ledger" always configures the attached hardware wallet. Reconnect
  // elsewhere in Nault only validates the identity of the stored wallet.
  async connectLedgerByBluetooth() {
    if (this.ledgerSetupInProgress) return;
    this.ledgerService.enableBluetoothMode(true); // Keep browser user activation.
    await this.importLedgerWallet();
  }

  async connectLedgerByUsb() {
    if (this.ledgerSetupInProgress) return;
    if (this.ledgerService.isAndroidWeb) return; // Android web uses Bluetooth only.
    const switchingFromBluetooth = this.ledgerService.transportMode === 'Bluetooth';
    this.ledgerService.enableBluetoothMode(false);
    // Switching modes already discards the previous transport. When already
    // using USB, explicitly release the old session to select a new Ledger.
    // Avoid two consecutive asynchronous closes when switching Bluetooth → USB.
    if (!this.ledgerService.isDesktop) {
      if (!switchingFromBluetooth) this.ledgerService.resetLedger();
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      this.ledgerService.ledgerStatus$.next({ status: LedgerStatus.NOT_CONNECTED, statusText: '' });
    }
    await this.importLedgerWallet();
  }

  get bluetoothConnectionHint(): string {
    return localizeNotificationMessage(
      this.ledgerService.bluetoothErrorMessage,
      key => this.translocoService.translate(key)
    );
  }

  async refreshLedgerStatus() {
    if (this.ledgerSetupInProgress) return;
    this.notifications.sendInfo(this.translocoService.translate('ui-notifications.ledger-checking'),
      { identifier: 'ledger-status', length: 0 });
    try {
      await this.ledgerService.loadLedger(true, this.ledgerService.transportMode === 'Bluetooth');
    } finally {
      this.notifications.removeNotification('ledger-status');
    }
  }

  async importLedgerWallet() {
    // An explicit setup must be singular: overlapping clicks could otherwise
    // close a transport while it is reading or replace the wallet out of order.
    if (this.ledgerSetupInProgress) return;
    this.ledgerSetupInProgress = true;
    // The old configuration stays untouched until the connected hardware has
    // been read and its account list is ready to save.
    const previouslyConfigured = this.isConfigured();
    const storedWallet = localStorage.getItem(this.walletService.storeKey);
    let activating = false;
    let completed = false;

    this.ledgerService.configuringWallet = true;
    this.notifications.sendInfo(this.translocoService.translate('ui-notifications.ledger-checking'),
      { identifier: 'ledger-status', length: 0 });
    try {
      const connected = await this.ledgerService.loadLedger(true, this.ledgerService.transportMode === 'Bluetooth');
      if (!connected || this.ledger.status !== LedgerStatus.READY) {
        if (!this.ledgerService.lastUsbSelectionCancelled && !this.ledgerService.lastBluetoothSelectionCancelled) {
          this.notifications.sendWarning(this.translocoService.translate(
            this.ledger.status === LedgerStatus.LOCKED
              ? 'ui-notifications.ledger-unlock' : 'ui-notifications.ledger-connect-failed'));
        }
        return;
      }

      // Replacing any configured wallet (Ledger or software) requires an
      // explicit confirmation. Keep the Web Bluetooth device chooser before
      // this dialog to preserve the browser user gesture.
      if (previouslyConfigured && !await this.confirmWalletOverwrite()) return;

      this.notifications.sendInfo(this.translocoService.translate('ui-notifications.wallet-scanning'),
        { identifier: 'ledger-setup-scan', length: 0 });
      const accounts = await this.walletService.prepareLedgerReplacementAccounts();
      if (this.ledger.status !== LedgerStatus.READY) throw new Error('Ledger disconnected during setup.');
      activating = true;
      this.walletService.activatePreparedLedgerWallet(accounts);
      completed = true;
      this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.ledger-loaded'));
      await this.route.navigate(['accounts']);
    } catch (error) {
      console.warn('Ledger wallet setup failed', error);
      if (activating && !completed) {
        if (storedWallet === null) localStorage.removeItem(this.walletService.storeKey);
        else localStorage.setItem(this.walletService.storeKey, storedWallet);
        await this.walletService.loadStoredWallet();
      }
      const readinessIssue = getLedgerReadinessIssue(error);
      const key = readinessIssue === 'app-not-open'
        ? 'ui-notifications.ledger-nano-app-not-open'
        : readinessIssue === 'locked'
          ? 'ui-notifications.ledger-locked-reconnect'
          : 'ui-notifications.ledger-replace-failed';
      this.notifications.sendWarning(this.translocoService.translate(key));
    } finally {
      this.ledgerService.configuringWallet = false;
      this.ledgerSetupInProgress = false;
      this.notifications.removeNotification('ledger-status');
      this.notifications.removeNotification('ledger-setup-scan');
      if (!completed) {
        // Never leave the previous wallet marked READY against a failed setup.
        this.ledgerService.resetLedger();
        this.ledger.status = LedgerStatus.NOT_CONNECTED;
        this.ledgerService.ledgerStatus$.next({ status: LedgerStatus.NOT_CONNECTED, statusText: '' });
      }
    }
  }

  // Send a confirmation dialog to the user if they already have a wallet configured
  async confirmWalletOverwrite() {
    if (!this.isConfigured()) return true;

    const UIkit = (window as unknown as { UIkit: { modal: {
      confirm(message: string, options?: { labels: { ok: string; cancel: string } }): Promise<unknown>
    } } }).UIkit;
    try {
      const msg = this.walletService.isLedgerWallet()
        ? '<p class="uk-alert uk-alert-info"><br><span class="uk-flex"><span uk-icon="icon: info; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' + this.translocoService.translate('ui-wallet-setup.overwrite-ledger-before') + ' <b>' + this.translocoService.translate('ui-wallet-setup.overwrite-ledger-strong') + '</b>.</span><br><br>' + this.translocoService.translate('ui-wallet-setup.overwrite-ledger-after') + '</p><br>'
        : '<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' + this.translocoService.translate('ui-wallet-setup.overwrite-ledger-before') + ' <b>' + this.translocoService.translate('ui-wallet-setup.overwrite-software-strong') + '</b>.</span><br><br><b style="font-size: 18px;">' + this.translocoService.translate('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') + '</b><br><br><b style="font-size: 18px;">' + this.translocoService.translate('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') + '</b></p><br>';
      await UIkit.modal.confirm(msg, {
        labels: {
          ok: this.translocoService.translate('ui-wallet-setup.confirm-overwrite'),
          cancel: this.translocoService.translate('general.cancel'),
        },
      });
      return true;
    } catch (err) {
      if (!this.walletService.isLedgerWallet()) {
        this.notifications.sendInfo(this.translocoService.translate('ui-notifications.wallet-backup-tip'));
      }
      return false;
    }
  }

  async setPasswordInit() {
    // if importing from existing, the format check must be done prior the password page
    if (!this.isNewWallet) {
      if (this.selectedImportOption === 'mnemonic' || this.selectedImportOption === 'seed') {
        if (this.selectedImportOption === 'seed') {
          const existingSeed = this.importSeedModel.trim();
          if (existingSeed.length !== 64 || !this.util.nano.isValidSeed(existingSeed)) return this.notifications.sendError(this.translocoService.translate('ui-notifications.seed-invalid'));
          this.importSeed = existingSeed;
        } else if (this.selectedImportOption === 'mnemonic') {
          // Clean the value by trimming it and removing newlines
          const mnemonic = this.importSeedMnemonicModel.toLowerCase().trim().replace(/\n/g, ``);

          const words = mnemonic.split(' ');
          if (words.length < 20) return this.notifications.sendError(this.translocoService.translate('ui-notifications.mnemonic-short'));

          // Try and decode the mnemonic
          try {
            const newSeed = await mnemonicToEntropy(mnemonic);
            if (!newSeed || newSeed.length !== 64 || !this.util.nano.isValidSeed(newSeed)) return this.notifications.sendError(this.translocoService.translate('ui-notifications.mnemonic-invalid'));
            this.importSeed = newSeed.toUpperCase(); // Force uppercase, for consistency
          } catch (err) {
            return this.notifications.sendError(this.translocoService.translate('ui-notifications.mnemonic-decode-failed'));
          }
        } else {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.import-option-invalid'));
        }
      } else if (this.selectedImportOption === 'privateKey' || this.selectedImportOption === 'expandedKey') {
        if (this.selectedImportOption === 'privateKey') {
          this.isExpanded = false;
        } else if (this.selectedImportOption === 'expandedKey') {
          this.isExpanded = true;
        } else {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.import-option-invalid'));
        }

        this.keyString = this.isExpanded ? this.importExpandedKeyModel : this.importPrivateKeyModel;
        this.keyString = this.keyString.trim();
        if (this.isExpanded && this.keyString.length === 128) {
          // includes deterministic R value material which we ignore
          this.keyString = this.keyString.substring(0, 64);
          if (!this.util.nano.isValidSeed(this.keyString)) {
            return this.notifications.sendError(this.translocoService.translate('ui-notifications.private-key-invalid'));
          }
        } else if (this.keyString.length !== 64 || !this.util.nano.isValidSeed(this.keyString)) {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.private-key-invalid'));
        }
      } else if (this.selectedImportOption === 'bip39-mnemonic') {
        // If bip39, import wallet as a single private key
        if (!await validateMnemonic(this.importSeedBip39MnemonicModel)) {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.mnemonic-invalid'));
        }
        if (!this.validIndex) {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.account-index-invalid'));
        }

        // Native WebCrypto PBKDF2 retains the previous 2048-round SHA-512 derivation.
        const bip39Seed = await mnemonicToSeedHex(
          this.importSeedBip39MnemonicModel, this.importSeedBip39MnemonicPasswordModel
        );

        // derive private key from bip39 seed using the account index provided
        const accounts = wallet.accounts(bip39Seed, Number(this.importSeedBip39MnemonicIndexModel),
        Number(this.importSeedBip39MnemonicIndexModel));
        this.keyString = accounts[0].privateKey;
        this.isExpanded = false;
      }
    }

    // If a wallet already exists, confirm that the seed is saved
    const confirmed = await this.confirmWalletOverwrite();
    if (!confirmed) return;
    this.activePanel = panels.password;
  }

  async createNewWallet() {
    const seedBytes = this.util.account.generateSeedBytes();
    this.newWalletSeed = this.util.hex.fromUint8(seedBytes);
    this.newWalletMnemonic = await entropyToMnemonic(this.newWalletSeed);

    // Split the seed up so we can show 4 per line
    const words = this.newWalletMnemonic.split(' ');
    const lines = [
      words.slice(0, 4),
      words.slice(4, 8),
      words.slice(8, 12),
      words.slice(12, 16),
      words.slice(16, 20),
      words.slice(20, 24),
    ];
    this.newWalletMnemonicLines = lines;

    this.activePanel = panels.backup;
  }

  async confirmNewSeed() {
    if (!this.hasConfirmedBackup) {
      return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.confirm-wallet-backup'));
    }
    try {
      await this.walletService.createNewWallet(this.newWalletSeed);
      await this.storePassword();
      this.newWalletSeed = '';
      this.newWalletMnemonicLines = [];
      this.saveNewWallet();
      this.activePanel = panels.final;
    } catch {
      this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-encryption-failed'));
    }
  }

  async saveWalletPassword() {
    if (this.walletPasswordConfirmModel !== this.walletPasswordModel) {
      return this.notifications.sendError(this.translocoService.translate('ui-notifications.password-confirm-invalid'));
    }
    if (!isStrongWalletPassword(this.walletPasswordModel)) {
      return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.password-minimum'));
    }

    if (this.isNewWallet) {
      try {
        // The mnemonic checksum uses async WebCrypto in the Vite browser build.
        // Do not clear password fields or advance the wizard if it fails.
        await this.createNewWallet();
      } catch {
        this.newWalletSeed = '';
        this.newWalletMnemonic = '';
        this.newWalletMnemonicLines = [];
        return this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-encryption-failed'));
      }
    }

    this.newPassword = this.walletPasswordModel;
    this.walletPasswordModel = '';
    this.walletPasswordConfirmModel = '';

    if (!this.isNewWallet && (this.selectedImportOption === 'mnemonic' || this.selectedImportOption === 'seed')) {
      await this.importExistingWallet();
    } else if (!this.isNewWallet && (this.selectedImportOption === 'privateKey' || this.selectedImportOption === 'expandedKey'
    || this.selectedImportOption === 'bip39-mnemonic')) {
      await this.importSingleKeyWallet();
    }
  }

  async storePassword(): Promise<void> {
    await this.walletService.setSoftwareWalletPassword(this.newPassword);
    this.newPassword = '';
  }

  saveNewWallet() {
    this.walletService.saveWalletExport();
    this.walletService.informNewWallet();

    this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-created'));
  }

  setPanel(panel: panels) {
    this.activePanel = panel;
    if (panel === panels.landing) {
      this.isNewWallet = true;
    } else if (panel === panels.import) {
      this.isNewWallet = false;
    }
  }

  copiedNewWalletSeed() {
    this.notifications.removeNotification('success-copied');
    this.notifications.sendSuccess(
      this.translocoService.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-seed'),
      { identifier: 'success-copied' }
    );
  }

  copiedNewWalletMnemonic() {
    this.notifications.removeNotification('success-copied');
    this.notifications.sendSuccess(
      this.translocoService.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-mnemonic'),
      { identifier: 'success-copied' }
    );
  }

  importFromFile(files: FileList | null) {
    if (!files?.length) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = reader.result;
      if (typeof fileData !== 'string') {
        return this.notifications.sendError(this.translocoService.translate('ui-notifications.import-file-invalid'));
      }
      try {
        const importData = JSON.parse(fileData);
        if ((!importData.seed && !importData.privateKey && !importData.expandedKey) ||
        (!importData.hasOwnProperty('accountsIndex') && !importData.hasOwnProperty('indexes'))) {
          return this.notifications.sendError(this.translocoService.translate('ui-notifications.import-data-bad'));
        }

        const walletEncrypted = btoa(JSON.stringify(importData));
        this.route.navigate(['import-wallet'], { fragment: walletEncrypted });
      } catch (err) {
        this.notifications.sendError(this.translocoService.translate('ui-notifications.import-file-invalid'));
      }
    };

    reader.readAsText(file);
  }

  // open qr reader modal
  openQR(reference: string, type: QRType) {
    const qrResult = this.qrModalService.openQR(reference, type);
    qrResult.then((data) => {
      switch (data.reference) {
        case 'seed1':
          this.importSeedModel = data.content;
          break;
        case 'mnemo1':
          this.importSeedMnemonicModel = data.content;
          break;
        case 'mnemo2':
          this.importSeedBip39MnemonicModel = data.content;
          break;
        case 'priv1':
          this.importPrivateKeyModel = data.content;
          break;
        case 'expanded1':
          this.importExpandedKeyModel = data.content;
          break;
      }
    }, () => {}
    );
  }

  accountIndexChange(index: string) {
    let invalid = false;
    if (this.util.string.isNumeric(index) && Number(index) % 1 === 0) {
      const parsedIndex = parseInt(index, 10);
      if (!this.util.nano.isValidIndex(parsedIndex)) {
        invalid = true;
      }
      if (parsedIndex > INDEX_MAX) {
        invalid = true;
      }
    } else {
      invalid = true;
    }
    this.validIndex = !invalid;
  }

}
