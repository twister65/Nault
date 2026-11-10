import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AppSettingsService } from './app-settings.service';
import { UtilService } from './util.service';
import { WalletService } from './wallet.service';

// API paths are same-origin and inactive until a backend is explicitly deployed.
// Push subscriptions contain private endpoint capabilities: never log them.
const API = '/api/push';
const STORAGE_KEY = 'nault-receivable-push-v1';
const REQUEST_TIMEOUT_MS = 10000;

interface PushBinding {
  id: string;
  managementToken: string;
  endpoint: string;
  snapshot: string;
}

interface PushConfig {
  enabled: boolean;
  vapidPublicKey: string;
}

interface RegistrationResult {
  id: string;
  managementToken: string;
}

// Both preferences share one browser PushSubscription and one backend record.
// Update alerts can be enabled without a wallet.
export type PushNotificationKind = 'notifyReceivable' | 'notifyUpdates';

interface PushPreferences {
  notifyReceivable: boolean;
  notifyUpdates: boolean;
}

interface PushSnapshot extends PushPreferences {
  accounts: string[];
  minimumReceiveRaw: string;
}

export type ReceivablePushStatus =
  'unsupported' | 'unavailable' | 'ready' | 'enabled' | 'busy' | 'error';

@Injectable({ providedIn: 'root' })
export class ReceivablePushService {
  status: ReceivablePushStatus = 'unavailable';
  busy = false;
  private vapidPublicKey: string | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInFlight = false;

  constructor(
    private swPush: SwPush,
    private wallet: WalletService,
    private settings: AppSettingsService,
    private util: UtilService
  ) {
    if (!this.supported) this.status = 'unsupported';
    // Angular may rotate an existing subscription. Never silently reuse an
    // obsolete push endpoint or ask permission without a user gesture.
    if (this.supported) {
      this.swPush.pushSubscriptionChanges.subscribe(() => this.scheduleSync());
    }
  }

  get supported(): boolean {
    return !environment.desktop && this.swPush.isEnabled &&
      typeof window !== 'undefined' && window.isSecureContext &&
      'Notification' in window;
  }

  get hasSubscription(): boolean {
    return this.readBinding() !== null;
  }

  private readBinding(): PushBinding | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const parsed: PushBinding = JSON.parse(value);
      return typeof parsed.id === 'string' && !!parsed.id &&
        typeof parsed.managementToken === 'string' && !!parsed.managementToken &&
        typeof parsed.endpoint === 'string' && !!parsed.endpoint &&
        typeof parsed.snapshot === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  get receivableEnabled(): boolean {
    return this.preferences().notifyReceivable;
  }

  get updatesEnabled(): boolean {
    return this.preferences().notifyUpdates;
  }

  private preferences(): PushPreferences {
    const binding = this.readBinding();
    if (!binding) return { notifyReceivable: false, notifyUpdates: false };
    try {
      const snapshot = JSON.parse(binding.snapshot) as Partial<PushSnapshot>;
      // Backward-compatible with opt-in registrations from the first draft.
      // They only enrolled receivable notifications, never release alerts.
      if (typeof snapshot.notifyReceivable !== 'boolean' &&
          typeof snapshot.notifyUpdates !== 'boolean') {
        return { notifyReceivable: true, notifyUpdates: false };
      }
      return {
        notifyReceivable: snapshot.notifyReceivable === true,
        notifyUpdates: snapshot.notifyUpdates === true,
      };
    } catch {
      return { notifyReceivable: true, notifyUpdates: false };
    }
  }

  private accounts(): string[] {
    return [...new Set(this.wallet.wallet.accounts.map(account => account.id))]
      .filter(id => /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(id))
      .sort();
  }

  private snapshot(preferences: PushPreferences = this.preferences()): PushSnapshot {
    const minimum = this.settings.settings.minimumReceive || '0';
    return {
      notifyReceivable: preferences.notifyReceivable,
      notifyUpdates: preferences.notifyUpdates,
      // A release-only subscription must not disclose or retain wallet accounts.
      accounts: preferences.notifyReceivable && this.wallet.isConfigured() ? this.accounts() : [],
      minimumReceiveRaw: this.util.nano.mnanoToRaw(minimum).toString(10),
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API + path, {
        ...init,
        headers: { 'Accept': 'application/json', ...(init.headers || {}) },
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Push service unavailable (' + response.status + ')');
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async checkAvailability(): Promise<void> {
    if (!this.supported) {
      this.status = 'unsupported';
      return;
    }
    try {
      const config: PushConfig = await (await this.request('/config')).json();
      if (config.enabled !== true ||
        typeof config.vapidPublicKey !== 'string' ||
        !/^[A-Za-z0-9_-]{80,120}$/.test(config.vapidPublicKey)) {
        this.vapidPublicKey = null;
        this.status = 'unavailable';
        return;
      }
      this.vapidPublicKey = config.vapidPublicKey;
      this.status = this.hasSubscription ? 'enabled' : 'ready';
    } catch {
      // A missing backend is expected on all existing deployments. No toast,
      // console error, or retry loop on a fresh PWA installation.
      this.vapidPublicKey = null;
      this.status = 'unavailable';
    }
  }

  // Keep the original entry point for existing callers.
  async enable(): Promise<boolean> {
    return this.enableReceivable();
  }

  async enableReceivable(): Promise<boolean> {
    return this.setPreference('notifyReceivable', true);
  }

  async enableUpdates(): Promise<boolean> {
    return this.setPreference('notifyUpdates', true);
  }

  async disableReceivable(): Promise<boolean> {
    return this.setPreference('notifyReceivable', false);
  }

  async disableUpdates(): Promise<boolean> {
    return this.setPreference('notifyUpdates', false);
  }

  private async setPreference(kind: PushNotificationKind, enabled: boolean): Promise<boolean> {
    if (this.busy) return false;
    const original = this.preferences();
    if (original[kind] === enabled) return true;
    if (enabled && (!this.supported || !this.vapidPublicKey)) return false;
    if (enabled && kind === 'notifyReceivable' &&
        (!this.wallet.isConfigured() || !this.accounts().length)) return false;

    const preferences = { ...original, [kind]: enabled };
    if (!preferences.notifyReceivable && !preferences.notifyUpdates) {
      return this.disable();
    }
    const snapshot = this.snapshot(preferences);
    if (preferences.notifyReceivable && !snapshot.accounts.length) return false;

    const binding = this.readBinding();
    this.busy = true;
    this.status = 'busy';
    let subscription: PushSubscription | null = null;
    try {
      if (binding) {
        // An already-permitted browser receives its second notification kind
        // without a new browser permission prompt or a second subscription.
        await this.request('/subscriptions/' + encodeURIComponent(binding.id), {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + binding.managementToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(snapshot),
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...binding, snapshot: JSON.stringify(snapshot)
        } satisfies PushBinding));
      } else {
        // Must be called directly from a user click: no await before the
        // permission request, and never during application startup.
        subscription = await this.swPush.requestSubscription({
          serverPublicKey: this.vapidPublicKey as string
        });
        const response: RegistrationResult = await (await this.request('/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON(), ...snapshot }),
        })).json();
        if (!response || typeof response.id !== 'string' || !response.id ||
            typeof response.managementToken !== 'string' || !response.managementToken) {
          throw new Error('Invalid push registration response');
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          id: response.id,
          managementToken: response.managementToken,
          endpoint: subscription.endpoint,
          snapshot: JSON.stringify(snapshot),
        } satisfies PushBinding));
      }
      this.status = 'enabled';
      return true;
    } catch {
      if (subscription) {
        try { await this.swPush.unsubscribe(); } catch { /* no registration confirmed */ }
      }
      // Keep the previous preferences and management capability if the server
      // cannot apply an update. An opt-out must not falsely report success.
      this.status = 'error';
      return false;
    } finally {
      this.busy = false;
    }
  }

  async disable(): Promise<boolean> {
    if (this.busy) return false;
    const binding = this.readBinding();
    if (!binding) {
      this.status = this.vapidPublicKey ? 'ready' : 'unavailable';
      return true;
    }

    this.busy = true;
    this.status = 'busy';
    try {
      // Server revocation MUST succeed before the local capability is erased.
      // Otherwise the user could keep receiving push after deleting a wallet.
      await this.request('/subscriptions/' + encodeURIComponent(binding.id), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + binding.managementToken },
      });
      localStorage.removeItem(STORAGE_KEY);
      try { await this.swPush.unsubscribe(); } catch { /* server already revoked */ }
      this.status = this.vapidPublicKey ? 'ready' : 'unavailable';
      return true;
    } catch {
      this.status = 'error';
      return false;
    } finally {
      this.busy = false;
    }
  }

  scheduleSync(): void {
    if (!this.hasSubscription || this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.sync();
    }, 800);
  }

  async sync(): Promise<void> {
    if (!this.hasSubscription || this.busy || this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      const binding = this.readBinding();
      if (!binding) return;
      const preferences = this.preferences();
      // Wallet removal must stop account monitoring, but must not silently
      // revoke a separate release-alert subscription on the same device.
      if (preferences.notifyReceivable &&
          (!this.wallet.isConfigured() || !this.accounts().length)) {
        if (!(await this.disableReceivable())) this.status = 'error';
        return;
      }
      const subscription = await firstValueFrom(this.swPush.subscription.pipe(take(1)));
      if (!subscription || subscription.endpoint !== binding.endpoint) {
        // A rotated or revoked browser endpoint needs explicit re-enrollment.
        // Keep the server management capability available for revocation.
        this.status = 'error';
        return;
      }
      const snapshot = this.snapshot();
      const signature = JSON.stringify(snapshot);
      if (signature === binding.snapshot) {
        this.status = 'enabled';
        return;
      }
      await this.request('/subscriptions/' + encodeURIComponent(binding.id), {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + binding.managementToken,
          'Content-Type': 'application/json',
        },
        body: signature,
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...binding, snapshot: signature }));
      this.status = 'enabled';
    } catch {
      this.status = 'error';
    } finally {
      this.syncInFlight = false;
    }
  }
}
