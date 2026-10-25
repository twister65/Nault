// Translate known legacy runtime toasts without changing raw transport errors,
// Ledger readiness detection or the notifications' deduplication identifiers.
// Unexpected diagnostic strings are preserved verbatim.
export type NotificationTranslator = (key: string, params?: Record<string, string>) => string;

export function localizeNotificationMessage(message: string, translate: NotificationTranslator): string {
  switch (message) {
    case 'Bluetooth unavailable. Check Bluetooth on your computer and Ledger, or choose Reconnect via USB.':
      return translate('ui-notifications.bluetooth-unavailable');
    case 'Waiting for confirmation on Ledger Device...':
      return translate('ui-notifications.ledger-confirmation-waiting');
  }

  // A declined Ledger transaction (APDU 0x6985) is a user action, not
  // a malfunction. The native transport remains connected after a refusal.
  if (message === 'Transaction denied on Ledger device' ||
      /^(?:Error (?:signing|caching) block: |Ledger device: ).*\b0x6985\b/i.test(message)) {
    return translate('ui-notifications.ledger-user-rejected');
  }

  const signingFailure = /^Error signing block: (.+)$/.exec(message);
  if (signingFailure) {
    const detail = signingFailure[1] === 'Ledger HID read timed out'
      ? translate('ui-notifications.ledger-hid-read-timeout')
      : signingFailure[1];
    return translate('ui-notifications.ledger-signing-error', { error: detail });
  }

  const received = /^Successfully received (.*?) XNO!$/.exec(message);
  if (received) {
    return received[1]
      ? translate('ui-notifications.received-amount', { amount: received[1] })
      : translate('ui-notifications.received');
  }

  return message;
}
