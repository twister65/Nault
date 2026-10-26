// Translate known legacy runtime toasts without changing raw transport errors,
// Ledger readiness detection or the notifications' deduplication identifiers.
// Unexpected diagnostic strings are preserved verbatim.
export type NotificationTranslator = (key: string, params?: Record<string, string>) => string;

export function localizeNotificationMessage(message: string, translate: NotificationTranslator): string {
  switch (message) {
    case 'Unable to connect to the nano node, your balances may be inaccurate!':
      return translate('ui-notifications.node-offline');
    case 'Unable to refresh balances. Check your connection.':
      return translate('ui-notifications.refresh-balance-failed');
    case 'There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.':
      return translate('ui-notifications.nano-price-unavailable');
    case 'Incoming XNO is waiting. Unlock your Ledger, open the Nano app, then click Reconnect to receive it.':
      return translate('ui-notifications.ledger-pending-reconnect');
    case 'Bluetooth unavailable. Check Bluetooth on your computer and Ledger, or choose Reconnect via USB.':
      return translate('ui-notifications.bluetooth-unavailable');
    case 'Waiting for confirmation on Ledger Device...':
      return translate('ui-notifications.ledger-confirmation-waiting');
    case 'Nano app is not open on your Ledger. Open the Nano app, then click Reconnect.':
      return translate('ui-notifications.ledger-nano-app-not-open');
    case 'Ledger locked. Unlock your Ledger, open the Nano app, then click Reconnect.':
      return translate('ui-notifications.ledger-locked-reconnect');
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

  // Keep address-book links intact while localizing tracked-account WebSocket toasts.
  // Account identifiers must be path-safe and labels are plain text within the link.
  const trackedTransfer = /^Tracked address (<a href="\/account\/[a-zA-Z0-9_]+">[^<>]*<\/a>) (can now receive|sent|received incoming) ((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:e[+-]?[0-9]+)?) XNO$/.exec(message);
  if (trackedTransfer) {
    const keys: Record<string, string> = {
      'can now receive': 'ui-notifications.tracked-receivable',
      'sent': 'ui-notifications.tracked-sent',
      'received incoming': 'ui-notifications.tracked-received',
    };
    return translate(keys[trackedTransfer[2]], { account: trackedTransfer[1], amount: trackedTransfer[3] });
  }

  const trackedRepresentative = /^Tracked address (<a href="\/account\/[a-zA-Z0-9_]+">[^<>]*<\/a>) changed its representative to ([a-zA-Z0-9_]+)$/.exec(message);
  if (trackedRepresentative) {
    return translate('ui-notifications.tracked-representative', {
      account: trackedRepresentative[1],
      representative: trackedRepresentative[2],
    });
  }

  return message;
}
