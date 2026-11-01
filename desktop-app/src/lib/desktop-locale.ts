// Electron's native menu lives outside Angular/Transloco. Select labels using
// Electron's OS locale without crossing the trusted renderer IPC boundary.
export function desktopLabels(locale: string) {
  const language = (locale || 'en').split(/[-_]/)[0].toLowerCase();
  const en = {
    edit: 'Edit', view: 'View', window: 'Window', help: 'Help',
    docs: 'Nault Help Docs', github: 'View GitHub', bug: 'Submit a bug report',
    releaseNotes: 'Release notes', checkUpdates: 'Check for Updates', speech: 'Speech',
    newVersion: 'New Version', updateAvailable: 'An update for Nault is available!',
    downloadPrompt: 'Download and install version', update: 'Update', askLater: 'Ask Later',
    upToDate: 'Up to date', noUpdate: 'Nault is already up to date.',
    updateError: 'Update Error', updateFailed: 'Unable to update Nault.',
    errorLog: 'More details in the log at:', ok: 'OK',
    ledgerBluetoothTitle: 'Connect Ledger via Bluetooth', selectLedger: 'Select your Ledger',
    searchLedger: 'Searching for a Ledger…', ledgerBluetoothAdvice: 'Unlock your Ledger, enable Bluetooth and open the Nano app. Use Refresh if your device is not listed. Verify any pairing code on the Ledger.',
    cancel: 'Cancel', refresh: 'Refresh', unnamedDevice: 'Unnamed device',
    pairLedger: 'Pair Ledger', confirmPinPrompt: 'Does your Ledger display', pairPrompt: 'Pair with the Ledger you selected?',
    pairAdvice: 'Confirm only if you are pairing your own Ledger. Also confirm on the device when asked.', confirm: 'Confirm',
  };
  const fr: typeof en = {
    edit: 'Édition', view: 'Affichage', window: 'Fenêtre', help: 'Aide',
    docs: 'Documentation Nault', github: 'Voir sur GitHub', bug: 'Signaler un problème',
    releaseNotes: 'Notes de version', checkUpdates: 'Rechercher des mises à jour', speech: 'Lecture vocale',
    newVersion: 'Nouvelle version', updateAvailable: 'Une mise à jour de Nault est disponible !',
    downloadPrompt: 'Télécharger et installer la version', update: 'Mettre à jour', askLater: 'Plus tard',
    upToDate: 'À jour', noUpdate: 'Nault est déjà à jour.',
    updateError: 'Erreur de mise à jour', updateFailed: 'La mise à jour de Nault a échoué.',
    errorLog: 'Consultez le journal :', ok: 'OK',
    ledgerBluetoothTitle: 'Connecter la Ledger en Bluetooth', selectLedger: 'Sélectionnez votre Ledger',
    searchLedger: 'Recherche d’une Ledger…', ledgerBluetoothAdvice: 'Déverrouillez la Ledger, activez le Bluetooth et ouvrez l’application Nano. Utilisez Actualiser si elle n’apparaît pas. Vérifiez tout code d’appairage sur la Ledger.',
    cancel: 'Annuler', refresh: 'Actualiser', unnamedDevice: 'Appareil sans nom',
    pairLedger: 'Appairer la Ledger', confirmPinPrompt: 'Votre Ledger affiche-t-elle', pairPrompt: 'Appairer la Ledger sélectionnée ?',
    pairAdvice: 'Confirmez uniquement l’appairage de votre propre Ledger. Confirmez aussi sur l’appareil si nécessaire.', confirm: 'Confirmer',
  };
  const es: typeof en = {
    edit: 'Editar', view: 'Ver', window: 'Ventana', help: 'Ayuda',
    docs: 'Documentación de Nault', github: 'Ver en GitHub', bug: 'Informar de un problema',
    releaseNotes: 'Notas de la versión', checkUpdates: 'Buscar actualizaciones', speech: 'Voz',
    newVersion: 'Nueva versión', updateAvailable: '¡Hay una actualización de Nault disponible!',
    downloadPrompt: 'Descargar e instalar la versión', update: 'Actualizar', askLater: 'Más tarde',
    upToDate: 'Actualizado', noUpdate: 'Nault ya está actualizado.',
    updateError: 'Error de actualización', updateFailed: 'No se pudo actualizar Nault.',
    errorLog: 'Más detalles en el registro:', ok: 'Aceptar',
    ledgerBluetoothTitle: 'Conectar Ledger por Bluetooth', selectLedger: 'Selecciona tu Ledger',
    searchLedger: 'Buscando una Ledger…', ledgerBluetoothAdvice: 'Desbloquea Ledger, activa Bluetooth y abre la aplicación Nano. Pulsa Actualizar si no aparece el dispositivo. Comprueba el código de emparejamiento en Ledger.',
    cancel: 'Cancelar', refresh: 'Actualizar', unnamedDevice: 'Dispositivo sin nombre',
    pairLedger: 'Emparejar Ledger', confirmPinPrompt: '¿Tu Ledger muestra', pairPrompt: '¿Emparejar la Ledger seleccionada?',
    pairAdvice: 'Confirma solo si estás emparejando tu propia Ledger. Confirma también en el dispositivo cuando se solicite.', confirm: 'Confirmar',
  };
  return language === 'fr' ? fr : language === 'es' ? es : en;
}
