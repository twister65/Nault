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

  static async open(device: Device | string, openTimeout = 30000): Promise<LedgerWebBle> {
    if (typeof device === 'string') throw new Error('Select a Ledger Bluetooth device first');
    const frames = new Subject<Buffer>();
    let transport: LedgerWebBle;
    let characteristic: Characteristic;
    let disposed = false;
    let timer;
    let rejectDisconnected: (error: Error) => void;
    const disconnected = new Promise<never>((_resolve, reject) => { rejectDisconnected = reject; });
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      device.removeEventListener('gattserverdisconnected', dispose);
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', onValue);
        // Every exit also closes GATT (or follows GATT loss), which stops
        // notifications. Do not queue stopNotifications against a closed or
        // subsequently reconnected server.
      }
      if (transport) transport.notYetDisconnected = false;
      const error = new Error('Ledger Bluetooth disconnected. Click Reconnect.');
      error.name = 'DisconnectedDevice';
      frames.error(error);
      rejectDisconnected(error);
      if (transport) transport.emit('disconnect');
    };
    const onValue = () => {
      const value: DataView = characteristic.value;
      if (!disposed && value) frames.next(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    };
    const checkActive = () => {
      if (disposed || !device.gatt.connected) throw new Error('Ledger Bluetooth connection closed');
    };
    const connect = async () => {
      console.info('[Ledger BLE GATT] opening connection', { alreadyConnected: device.gatt.connected });
      if (!device.gatt.connected) await device.gatt.connect();
      console.info('[Ledger BLE GATT] connected');
      checkActive();
      console.info('[Ledger BLE GATT] discovering services');
      const services = await device.gatt.getPrimaryServices();
      checkActive();
      const service = services.find(item => getBluetoothServiceUuids().includes(item.uuid));
      const infos = service && getInfosForServiceUuid(service.uuid);
      if (!infos) throw new Error('Ledger Bluetooth service not found');
      console.info('[Ledger BLE GATT] Ledger service found; discovering characteristics');
      const write = await service.getCharacteristic(infos.writeUuid);
      checkActive();
      characteristic = await service.getCharacteristic(infos.notifyUuid);
      checkActive();
      characteristic.addEventListener('characteristicvaluechanged', onValue);
      console.info('[Ledger BLE GATT] starting notifications');
      await characteristic.startNotifications();
      console.info('[Ledger BLE GATT] notifications started');
      checkActive();
      transport = new LedgerWebBle(device, write, frames, infos.deviceModel);
      transport.disposeSession = dispose;
      console.info('[Ledger BLE GATT] negotiating MTU');
      await transport.inferMTU();
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
      console.error('[Ledger BLE GATT] session opening failed', error);
      dispose();
      if (device.gatt.connected) device.gatt.disconnect();
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
