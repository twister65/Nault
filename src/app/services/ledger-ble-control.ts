import { filter } from 'rxjs/operators';
import TransportBLE from '@ledgerhq/hw-transport-web-ble';

// Ledger BLE uses 0x08 for MTU replies and 0x05 for APDU data.
// A repeated, unchanged MTU reply is not part of a pending APDU response.
// Keep every other frame so the Ledger decoder still rejects protocol errors.
export function handleLedgerBleControl(transport: TransportBLE) {
  transport.notifyObservable = transport.notifyObservable.pipe(filter(frame => !(
    frame.length === 6 && frame[0] === 0x08 &&
    frame[1] === 0 && frame[2] === 0 && frame[4] === 1 &&
    // Newer Ledger protocol replies also encode MTU in bytes 2..3;
    // older replies leave those bytes zero. Byte 5 is used by inferMTU().
    (frame[3] === 0 || frame[3] === transport.mtuSize) &&
    frame[5] === transport.mtuSize
  )));
}
