import TransportBLE from '@ledgerhq/hw-transport-web-ble';
import { getBluetoothServiceUuids, getInfosForServiceUuid } from '@ledgerhq/devices';
import { Device, Characteristic } from '@ledgerhq/hw-transport-web-ble/lib/types';
import { Subject } from 'rxjs';
import { Buffer } from 'buffer';

// Keep Ledger's discovery, framing and exchange implementation, but own the
// notification lifecycle. Upstream 6.27.5 neither terminates pending exchanges
// on GATT loss nor removes its notification listener on cleanup.
export default class LedgerWebBle extends TransportBLE {
  private disposeSession: () => void = () => {};

  static async open(device: Device | string, openTimeout = 30000,
                    mtuTimeoutMs = 12000, retryMtu = true): Promise<LedgerWebBle> {
    if (typeof device === 'string') throw new Error('Select a Ledger Bluetooth device first');
    const frames = new Subject<Buffer>();
    let transport: LedgerWebBle;
    let characteristic: Characteristic;
    let disposed = false;
    // Diagnostic phases contain no Bluetooth identifiers or Ledger payloads.
    let openingPhase = 'selected';
    let phaseStartedAt = Date.now();
    const setPhase = (phase: string) => { openingPhase = phase; phaseStartedAt = Date.now(); };
    let timer;
    let rejectDisconnected: (error: Error) => void;
    const disconnected = new Promise<never>((_resolve, reject) => { rejectDisconnected = reject; });
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      console.info('[Ledger BLE GATT] session disposed', {
        connected: device.gatt.connected,
        phase: openingPhase,
        phaseElapsedMs: Date.now() - phaseStartedAt
      });
      clearTimeout(timer);
      device.removeEventListener('gattserverdisconnected', dispose);
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', onValue);
        // Every exit also closes GATT (or follows GATT loss), which stops
        // notifications. Do not queue stopNotifications against a closed or
        // subsequently reconnected server.
      }
      if (transport) transport.notYetDisconnected = false;
      // A GATT drop during service setup can indicate an invalid pairing.
      // Web Bluetooth does not expose the HCI authentication reason, so give
      // actionable advice without asserting that the device is unpaired.
      const mayBePairing = openingPhase === 'GATT service discovery' ||
        openingPhase === 'GATT characteristic discovery' ||
        openingPhase === 'GATT notification subscription';
      const error = new Error(mayBePairing
        ? 'Ledger Nano X Bluetooth pairing may be missing or invalid (authentication may have failed). ' +
          'Re-pair your Ledger in your computer Bluetooth settings (Linux: bluetoothctl), then click Reconnect.'
        : 'Ledger Bluetooth disconnected. Click Reconnect.');
      error.name = 'DisconnectedDevice';
      frames.error(error);
      rejectDisconnected(error);
      if (transport) transport.emit('disconnect');
    };
    const onValue = () => {
      const value: DataView = characteristic.value;
      if (!disposed && value) {
        const frame = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        // Only report protocol metadata, never APDU payloads or signatures.
        if (frame[0] === 0x08) console.info('[Ledger BLE GATT] MTU response received', { length: frame.length });
        frames.next(frame);
      }
    };
    const checkActive = () => {
      if (disposed || !device.gatt.connected) throw new Error('Ledger Bluetooth connection closed');
    };
    const connect = async () => {
      // The chooser already completed within the user gesture. Release any
      // native Electron USB/HID worker before initiating GATT; USB shutdown
      // is asynchronous and a pending worker may survive a transport switch.
      setPhase('USB release');
      if (typeof window !== 'undefined' && window.naultDesktop) {
        const released = await window.naultDesktop.releaseLedgerUsb();
        if (!released) throw new Error('Ledger USB transport could not be released');
      }
      if (disposed) throw new Error('Ledger Bluetooth connection closed');
      setPhase('GATT connection');
      console.info('[Ledger BLE GATT] opening connection', { alreadyConnected: device.gatt.connected });
      if (!device.gatt.connected) await device.gatt.connect();
      console.info('[Ledger BLE GATT] connected');
      checkActive();
      setPhase('GATT service discovery');
      console.info('[Ledger BLE GATT] discovering services');
      let services;
      try {
        services = await device.gatt.getPrimaryServices();
      } catch (error) {
        // The disconnect event can win the session race. Preserve the native
        // Web Bluetooth rejection separately to diagnose BlueZ service discovery.
        // Error objects may cross the preload / test-realm boundary, where
        // instanceof Error is not reliable.
        const reason = error && typeof error === 'object'
          ? error as { name?: string; message?: string }
          : null;
        console.warn('[Ledger BLE GATT] service discovery rejected', {
          name: reason && typeof reason.name === 'string' ? reason.name : 'Unknown',
          message: reason && typeof reason.message === 'string' ? reason.message : String(error),
          connected: device.gatt.connected
        });
        // A native auth failure is conclusive; a generic disconnect is not.
        const nativeReason = error && typeof error === 'object' ? error as {message?: string} : null;
        if (/authentication failed|pin or key missing|insufficient authentication/i.test(String(nativeReason && nativeReason.message || ''))) {
          const auth = new Error('Ledger Nano X Bluetooth authentication failed. Your device may not be paired correctly. ' +
            'Re-pair it in your computer Bluetooth settings (Linux: bluetoothctl), then click Reconnect.');
          auth.name = 'LedgerBluetoothAuthenticationError';
          throw auth;
        }
        throw error;
      }
      checkActive();
      const service = services.find(item => getBluetoothServiceUuids().includes(item.uuid));
      const infos = service && getInfosForServiceUuid(service.uuid);
      if (!infos) throw new Error('Ledger Bluetooth service not found');
      setPhase('GATT characteristic discovery');
      console.info('[Ledger BLE GATT] Ledger service found; discovering characteristics');
      const write = await service.getCharacteristic(infos.writeUuid);
      checkActive();
      characteristic = await service.getCharacteristic(infos.notifyUuid);
      checkActive();
      characteristic.addEventListener('characteristicvaluechanged', onValue);
      setPhase('GATT notification subscription');
      console.info('[Ledger BLE GATT] starting notifications');
      try {
        await characteristic.startNotifications();
      } catch (error) {
        // Windows may connect to GATT and discover services but fail to
        // authenticate the encrypted notification subscription. This is not
        // an MTU or Ledger Nano application failure.
        if (error && /authentication failed/i.test(String(error.message || error))) {
          const pairingError = new Error(
            'Bluetooth authentication failed while enabling notifications. ' +
            'Remove the Ledger from the computer Bluetooth settings, pair it again, ' +
            'and retry the connection in Nault.'
          );
          pairingError.name = 'LedgerBluetoothAuthenticationError';
          throw pairingError;
        }
        throw error;
      }
      console.info('[Ledger BLE GATT] notifications started');
      checkActive();
      transport = new LedgerWebBle(device, write, frames, infos.deviceModel);
      transport.disposeSession = dispose;
      setPhase('Ledger MTU negotiation');
      console.info('[Ledger BLE GATT] negotiating MTU');
      // A radio reconnect may establish GATT without delivering the MTU reply.
      // Bound this handshake; do not guess the MTU or allow a stuck session.
      let mtuTimer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          transport.inferMTU(),
          new Promise<never>((_, reject) => {
            mtuTimer = setTimeout(() => reject(new Error('Ledger Bluetooth MTU negotiation timed out; reconnect the device')), mtuTimeoutMs);
          })
        ]);
      } finally {
        clearTimeout(mtuTimer);
      }
      setPhase('connected');
      console.info('[Ledger BLE GATT] MTU negotiated');
      checkActive();
      return transport;
    };
    device.addEventListener('gattserverdisconnected', dispose);
    timer = setTimeout(dispose, openTimeout);
    try {
      console.info('[Ledger BLE GATT] device selected; initializing session');
      return await Promise.race([connect(), disconnected]);
    } catch (error) {
      console.error('[Ledger BLE GATT] session opening failed', { phase: openingPhase }, error);
      // The first reconnect after a radio outage can successfully enable
      // notifications but fail to deliver the MTU control reply. Recreate
      // GATT/characteristic subscriptions exactly once, *before* any Nano
      // APDU or signature command. Do not silently retry transactions.
      const mtuReplyMissing = retryMtu &&
        openingPhase === 'Ledger MTU negotiation' &&
        /Ledger Bluetooth MTU negotiation timed out/.test(String(error && (error.message || error)));
      dispose();
      if (device.gatt.connected) device.gatt.disconnect();
      if (mtuReplyMissing) {
        console.warn('[Ledger BLE GATT] retrying one fresh GATT session after missing MTU reply');
        // Give BlueZ and Chromium time to retire the previous notification
        // context before discovering new service/characteristic objects.
        await new Promise(resolve => setTimeout(resolve, 400));
        return LedgerWebBle.open(device, openTimeout, mtuTimeoutMs, false);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async close() {
    this.disposeSession();
    if (this.device.gatt.connected) this.device.gatt.disconnect();
  }
}
