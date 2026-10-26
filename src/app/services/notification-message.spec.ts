import { localizeNotificationMessage } from './notification-message';

describe('localizeNotificationMessage', () => {
  const messages: Record<string, string> = {
    'ui-notifications.node-offline': 'Impossible de se connecter au nœud Nano. Les soldes affichés peuvent être inexacts !',
    'ui-notifications.refresh-balance-failed': 'Impossible d’actualiser les soldes. Vérifiez votre connexion.',
    'ui-notifications.nano-price-unavailable': 'Impossible de récupérer le dernier cours du Nano. Vérifiez votre connexion Internet ou les paramètres de votre bloqueur de publicités, puis actualisez la page pour afficher des montants en monnaie fiduciaire à jour.',
    'ui-notifications.ledger-pending-reconnect': 'Des XNO sont en attente de réception. Déverrouillez votre Ledger, ouvrez l’application Nano, puis cliquez sur « Reconnecter » pour les recevoir.',
    'ui-notifications.tracked-receivable': 'L’adresse suivie {{account}} peut maintenant recevoir {{amount}} XNO.',
    'ui-notifications.tracked-sent': 'L’adresse suivie {{account}} a envoyé {{amount}} XNO.',
    'ui-notifications.tracked-received': 'L’adresse suivie {{account}} a reçu {{amount}} XNO.',
    'ui-notifications.tracked-representative': 'L’adresse suivie {{account}} a changé de représentant : {{representative}}.',
    'ui-notifications.bluetooth-unavailable': 'Bluetooth indisponible. Vérifiez le Bluetooth de votre ordinateur et de votre Ledger, ou reconnectez-vous en USB.',
    'ui-notifications.ledger-confirmation-waiting': 'En attente de confirmation sur la Ledger…',
    'ui-notifications.ledger-wallet-mismatch': 'La Ledger connectée ne correspond pas au portefeuille configuré. Pour utiliser cette clé, sélectionnez « Configurer un nouveau portefeuille » → « Utiliser Ledger ».',
    'ui-notifications.ledger-nano-app-not-open': 'L’application Nano n’est pas ouverte sur votre Ledger. Ouvrez-la, puis cliquez sur « Reconnecter ».',
    'ui-notifications.ledger-locked-reconnect': 'Ledger verrouillée. Déverrouillez-la, ouvrez l’application Nano, puis cliquez sur « Reconnecter ».','
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

  it('localizes the balance refresh error emitted at offline startup', () => {
    expect(localizeNotificationMessage(
      'Unable to refresh balances. Check your connection.', translate
    )).toBe('Impossible d’actualiser les soldes. Vérifiez votre connexion.');
  });

  it('localizes the persistent Nano price error emitted during offline startup', () => {
    expect(localizeNotificationMessage(
      'There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.', translate
    )).toBe('Impossible de récupérer le dernier cours du Nano. Vérifiez votre connexion Internet ou les paramètres de votre bloqueur de publicités, puis actualisez la page pour afficher des montants en monnaie fiduciaire à jour.');
  });

  it('localizes Ledger Nano app and locked reconnect warnings', () => {
    expect(localizeNotificationMessage(
      'Nano app is not open on your Ledger. Open the Nano app, then click Reconnect.', translate
    )).toBe('L’application Nano n’est pas ouverte sur votre Ledger. Ouvrez-la, puis cliquez sur « Reconnecter ».');
    expect(localizeNotificationMessage(
      'Ledger locked. Unlock your Ledger, open the Nano app, then click Reconnect.', translate
    )).toBe('Ledger verrouillée. Déverrouillez-la, ouvrez l’application Nano, puis cliquez sur « Reconnecter ».');
  });

  it('localizes the mismatched Ledger error during reconnect', () => {
    expect(localizeNotificationMessage('Ledger does not match the configured wallet.', translate))
      .toContain('ne correspond pas au portefeuille configuré');
  });

  it('localizes the Ledger incoming-XNO reconnection guidance', () => {
    expect(localizeNotificationMessage(
      'Incoming XNO is waiting. Unlock your Ledger, open the Nano app, then click Reconnect to receive it.', translate
    )).toContain('Des XNO sont en attente de réception');
  });

  it('translates tracked-address WebSocket messages and keeps the account link and amount', () => {
    const addressLink = '<a href="/account/nano_123456">Natrium</a>';
    const cases: Array<[string, string]> = [
      [`Tracked address ${addressLink} can now receive 1 XNO`,
        `L’adresse suivie ${addressLink} peut maintenant recevoir 1 XNO.`],
      [`Tracked address ${addressLink} sent 0.25 XNO`,
        `L’adresse suivie ${addressLink} a envoyé 0.25 XNO.`],
      [`Tracked address ${addressLink} received incoming 1e-7 XNO`,
        `L’adresse suivie ${addressLink} a reçu 1e-7 XNO.`],
      [`Tracked address ${addressLink} changed its representative to nano_rep123`,
        `L’adresse suivie ${addressLink} a changé de représentant : nano_rep123.`],
    ];
    for (const [original, localized] of cases) {
      expect(localizeNotificationMessage(original, translate)).toBe(localized);
    }
  });

  it('does not alter unrelated or unsafe-looking tracked-account messages', () => {
    const input = 'Tracked address <a href="javascript:alert(1)">Natrium</a> can now receive 1 XNO';
    expect(localizeNotificationMessage(input, translate)).toBe(input);
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
