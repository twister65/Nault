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
    errorLog: 'More details in the log at:', ok: 'OK'
  };
  const fr: typeof en = {
    edit: 'Édition', view: 'Affichage', window: 'Fenêtre', help: 'Aide',
    docs: 'Documentation Nault', github: 'Voir sur GitHub', bug: 'Signaler un problème',
    releaseNotes: 'Notes de version', checkUpdates: 'Rechercher des mises à jour', speech: 'Lecture vocale',
    newVersion: 'Nouvelle version', updateAvailable: 'Une mise à jour de Nault est disponible !',
    downloadPrompt: 'Télécharger et installer la version', update: 'Mettre à jour', askLater: 'Plus tard',
    upToDate: 'À jour', noUpdate: 'Nault est déjà à jour.',
    updateError: 'Erreur de mise à jour', updateFailed: 'La mise à jour de Nault a échoué.',
    errorLog: 'Consultez le journal :', ok: 'OK'
  };
  const es: typeof en = {
    edit: 'Editar', view: 'Ver', window: 'Ventana', help: 'Ayuda',
    docs: 'Documentación de Nault', github: 'Ver en GitHub', bug: 'Informar de un problema',
    releaseNotes: 'Notas de la versión', checkUpdates: 'Buscar actualizaciones', speech: 'Voz',
    newVersion: 'Nueva versión', updateAvailable: '¡Hay una actualización de Nault disponible!',
    downloadPrompt: 'Descargar e instalar la versión', update: 'Actualizar', askLater: 'Más tarde',
    upToDate: 'Actualizado', noUpdate: 'Nault ya está actualizado.',
    updateError: 'Error de actualización', updateFailed: 'No se pudo actualizar Nault.',
    errorLog: 'Más detalles en el registro:', ok: 'Aceptar'
  };
  return language === 'fr' ? fr : language === 'es' ? es : en;
}
