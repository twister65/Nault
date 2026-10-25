import { localizeNotificationMessage } from './notification-message';

describe('localizeNotificationMessage', () => {
  const messages: Record<string, string> = {
    'ui-notifications.node-offline': 'Impossible de se connecter au nœud Nano. Les soldes affichés peuvent être inexacts !',
    'ui-notifications.bluetooth-unavailable': 'Bluetooth indisponible. Vérifiez le Bluetooth de votre ordinateur et de votre Ledger, ou reconnectez-vous en USB.',
    'ui-notifications.ledger-confirmation-waiting': 'En attente de confirmation sur la Ledger…',
    'ui-notifications.ledger-hid-read-timeout': 'délai de lecture HID de la Ledger dépassé',
    'ui-notifications.ledger-signing-error': 'Erreur lors de la signature du bloc : {{error}}',
    'ui-notifications.ledger-user-rejected': 'Transaction refusée sur la Ledger (0x6985).',
    'ui-notifications.received-amount': 'Réception de {{amount}} XNO réussie !',
    'ui-notifications.received': 'Réception de XNO réussie !',
  };
  const translate = (key: string, params?: Record<string, string>) =>
    (messages[key] || key).replace(/{{(\w+)}}/g, (_, name: string) => params?.[name] || '');

  it('localizes the persistent node-offline warning', () => {
    expect(localizeNotificationMessage(
      'Unable to connect to the nano node, your balances may be inaccurate!', translate
    )).toBe('Impossible de se connecter au nœud Nano. Les soldes affichés peuvent être inexacts !');
  });

  it('localizes the Bluetooth adapter-unavailable instructions', () => {
    expect(localizeNotificationMessage(
      'Bluetooth unavailable. Check Bluetooth on your computer and Ledger, or choose Reconnect via USB.', translate
    )).toContain('Bluetooth indisponible');
  });

  it('localizes the Ledger confirmation prompt without changing its identifier', () => {
    expect(localizeNotificationMessage('Waiting for confirmation on Ledger Device...', translate))
      .toBe('En attente de confirmation sur la Ledger…');
  });

  it('localizes a HID timeout while retaining the signing failure semantics', () => {
    expect(localizeNotificationMessage('Error signing block: Ledger HID read timed out', translate))
      .toBe('Erreur lors de la signature du bloc : délai de lecture HID de la Ledger dépassé');
  });

  it('localizes a Ledger user refusal rather than reporting a failed signing operation', () => {
    for (const raw of [
      'Error signing block: Ledger device: Condition of use not satisfied (denied by the user?) (0x6985)',
      'Error caching block: Ledger device: Condition of use not satisfied (0x6985)',
      'Ledger device: Condition of use not satisfied (0x6985)',
      'Transaction denied on Ledger device'
    ]) {
      expect(localizeNotificationMessage(raw, translate))
        .toBe('Transaction refusée sur la Ledger (0x6985).');
    }
  });

  it('preserves unknown device errors verbatim within the localized signing prefix', () => {
    expect(localizeNotificationMessage('Error signing block: 0x6e01', translate))
      .toBe('Erreur lors de la signature du bloc : 0x6e01');
  });

  it('interpolates the exact received amount without changing its numeric representation', () => {
    expect(localizeNotificationMessage('Successfully received 1 XNO!', translate))
      .toBe('Réception de 1 XNO réussie !');
    expect(localizeNotificationMessage('Successfully received 0.123456 XNO!', translate))
      .toBe('Réception de 0.123456 XNO réussie !');
    expect(localizeNotificationMessage('Successfully received  XNO!', translate))
      .toBe('Réception de XNO réussie !');
  });

  it('leaves other notifications including HTML links untouched', () => {
    const message = '<a href="/account">Tracked address</a> received funds';
    expect(localizeNotificationMessage(message, translate)).toBe(message);
  });
});
