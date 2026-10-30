import 'core-js/stable';

import { app, BrowserWindow, shell, Menu, screen, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as url from 'url';
import * as path from 'path';
import { initialize } from './lib/ledger';
import { configureWebBluetooth } from './lib/web-bluetooth';
import { desktopLabels } from './lib/desktop-locale';
import * as settings from 'electron-settings';
const log = require('electron-log');

// Chromium's BlueZ-backed Web Bluetooth on Linux; no raw-socket capability.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'WebBluetooth');

// Diagnostic-only listener: record native main-process exceptions without
// swallowing them or changing Electron's normal uncaught-error behavior.
// This must not log wallet secrets, APDUs, or account addresses.
process.on('uncaughtExceptionMonitor', (error, origin) => {
  console.error('[Nault main uncaught exception]', origin,
    error instanceof Error ? error.stack : error);
});
// Don't want errors to display when checking for update
// Too annoying if there would be long-term problems with the source
// Error would pop up on every launch
let showUpdateErrors = false;
let manualUpdateCheck = false;
let updatePromptOpen = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let isDownloading = false;
const nano_schemes = ['nano', 'nanorep', 'nanoseed', 'nanokey', 'nanosign', 'nanoprocess'];

/**
 * By default, the logger writes logs to the following locations:
  on Linux: ~/.config/nault/logs/{process type}.log
  on macOS: ~/Library/Logs/nault/{process type}.log
  on Windows: %USERPROFILE%\AppData\Roaming\nault\logs\{process type}.log

  error, warn, info, verbose, debug, silly
 * */

 // determine log location
let logLocation = 'Unknown';
switch (process.platform) {
  case 'win32':
    logLocation = '%USERPROFILE%\\AppData\\Roaming\\nault\\logs\\main.log';
    break;
  case 'linux':
    logLocation = '~/.config/nault/logs/main.log';
    break;
  case 'darwin':
    logLocation = '~/Library/Logs/nault/main.log';
    break;
}

// Keep track of window size and position
function windowStateKeeper() {
  type WindowState = {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
  };
  let trackedWindow: BrowserWindow | null = null;
  let windowState: WindowState = { width: 1000, height: 600 };
  let newWidth = 1000;
  let newHeight = 600;
  try {
    const dimensions = screen.getPrimaryDisplay().size;
    newWidth = Math.max(newWidth, Math.round(dimensions.width * 0.8));
    newHeight = Math.max(newHeight, Math.round(dimensions.height * 0.85));
  } catch {
    log.warn('Could not calculate default screen size');
  }

  function setBounds(): void {
    const key = 'windowState.main';
    if (settings.hasSync(key)) {
      const candidate = settings.getSync(key);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const saved = candidate as Partial<WindowState>;
        if (typeof saved.width === 'number' && typeof saved.height === 'number') {
          windowState = { ...saved, width: saved.width, height: saved.height };
          return;
        }
      }
    }
    windowState = { width: newWidth, height: newHeight };
  }

  function saveState(): void {
    if (saveTimeout !== null) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!trackedWindow || trackedWindow.isDestroyed()) return;
      if (!trackedWindow.isMaximized()) {
        windowState = { ...windowState, ...trackedWindow.getBounds() };
      }
      windowState.isMaximized = trackedWindow.isMaximized();
      settings.setSync('windowState.main', windowState);
    }, 100);
  }

  function track(win: BrowserWindow): void {
    trackedWindow = win;
    win.on('resize', saveState);
    win.on('move', saveState);
  }
  setBounds();
  return { ...windowState, track };
}

class AppUpdater {
  constructor() {
    // Require explicit confirmation before downloading an update.
    autoUpdater.autoDownload = false;
    autoUpdater.logger = log;

    autoUpdater.on('update-available', (info) => {
      manualUpdateCheck = false;
      if (isDownloading || updatePromptOpen) return;
      showUpdateErrors = false;
      updatePromptOpen = true;
      const t = desktopLabels(app.getLocale());
      void dialog.showMessageBox({
        type: 'info',
        buttons: [t.update, t.askLater],
        defaultId: 0,
        cancelId: 1,
        title: t.newVersion,
        message: t.updateAvailable,
        detail: `${t.downloadPrompt} ${info.version} ?`
      }).then(({ response }) => {
        updatePromptOpen = false;
        if (response !== 0) return;
        isDownloading = true;
        showUpdateErrors = true;
        // The updater emits its own error event; consume the rejected promise.
        void autoUpdater.downloadUpdate().catch(error => {
          log.warn('Update download failed:', error);
        });
      }).catch(error => {
        updatePromptOpen = false;
        log.warn('Could not display update dialog:', error);
      });
    });

    autoUpdater.on('update-not-available', () => {
      const requestedManually = manualUpdateCheck;
      manualUpdateCheck = false;
      showUpdateErrors = false;
      if (!requestedManually) return;
      const t = desktopLabels(app.getLocale());
      void dialog.showMessageBox({
        type: 'info', buttons: [t.ok], title: t.upToDate, message: t.noUpdate
      });
    });

    autoUpdater.on('update-downloaded', () => {
      isDownloading = false;
      showUpdateErrors = false;
      autoUpdater.quitAndInstall(true, true);
    });

    autoUpdater.on('download-progress', progressObj => {
      sendStatusToWindow(progressObj);
    });

    autoUpdater.on('error', error => {
      log.error('There was a problem updating Nault:', error);
      const shouldNotify = showUpdateErrors || manualUpdateCheck;
      isDownloading = false;
      manualUpdateCheck = false;
      showUpdateErrors = false;
      updatePromptOpen = false;
      mainWindow?.setTitle(`Nault - ${autoUpdater.currentVersion}`);
      if (!shouldNotify) return; // Keep automatic checks silent on network errors.
      const t = desktopLabels(app.getLocale());
      void dialog.showMessageBox({
        type: 'error',
        buttons: [t.ok],
        title: t.updateError,
        message: t.updateFailed,
        detail: `${t.errorLog} ${logLocation}`
      });
    });
  }
}
new AppUpdater();

// Register handler for nano: links
if (process.platform === 'darwin') {
  nano_schemes.forEach((scheme) => app.setAsDefaultProtocolClient(scheme));
} else {
  const args = process.argv[1] ? [path.resolve(process.argv[1])] : [];
  nano_schemes.forEach((scheme) => app.setAsDefaultProtocolClient(scheme, process.execPath, args));
}

let mainWindow: BrowserWindow | null = null;

// The desktop UI is bundled locally. Reject navigation and privileged IPC
// from any page other than this exact file (fragment routes are allowed).
const trustedIndexPath = path.resolve(__dirname, '../../dist/index.html');

function isTrustedWalletURL(candidate: string): boolean {
  try {
    const parsed = new url.URL(candidate);
    return parsed.protocol === 'file:' &&
      !parsed.hostname &&
      !parsed.search &&
      url.fileURLToPath(parsed) === trustedIndexPath;
  } catch (_error) {
    return false;
  }
}

function isTrustedLedgerSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    !!event.senderFrame &&
    event.senderFrame === event.sender.mainFrame &&
    isTrustedWalletURL(event.senderFrame.url);
}

// Validate the sender before handling any Ledger IPC, including account reads
// and signing requests. This does not replace transaction confirmation on
// the physical Ledger display.
initialize(isTrustedLedgerSender);

function createWindow () {
  // Get window state
  const mainWindowStateKeeper = windowStateKeeper();

  // Create the browser window.
  const currentWindow = new BrowserWindow({
    x: mainWindowStateKeeper.x,
    y: mainWindowStateKeeper.y,
    width: mainWindowStateKeeper.width,
    height: mainWindowStateKeeper.height,
    webPreferences:
    {
      // Renderer code must not have direct access to Node.js or Electron.
      // Only the narrow IPC bridge from preload.ts is exposed to Angular.
      webSecurity: true,
      sandbox: true,
      devTools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow = currentWindow;

  // Block navigation in every frame, not just the top-level document.
  // Electron 44 documents will-frame-navigate, but some generated Electron
  // typings omit its WebContents.on() overload. Define only this event's
  // documented shape instead of widening the entire WebContents to any.
  // Unlike will-navigate, the navigation details are ON the event object.
  type FrameNavigationEvent = {
    url: string;
    isMainFrame: boolean;
    preventDefault(): void;
  };
  const frameNavigationEvents = currentWindow.webContents as unknown as {
    on(event: 'will-frame-navigate', listener: (event: FrameNavigationEvent) => void): void;
  };
  frameNavigationEvents.on('will-frame-navigate', event => {
    if (!event.isMainFrame || !isTrustedWalletURL(event.url)) {
      event.preventDefault();
      log.warn('Blocked navigation outside the trusted wallet document');
    }
  });

  // WebHID is deliberately NOT enabled in this PR. The existing Ledger
  // connection uses a native HID worker; Chromium has no reason to receive
  // permission to open a hardware device. Future WebHID support must
  // explicitly authorize trusted main-frame requests and Ledger vendor IDs.
  const walletSession = currentWindow.webContents.session;
  const permittedWebFeatures = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write']);
  const isTrustedWebContents = (contents: Electron.WebContents | null): boolean =>
    !!contents && contents === currentWindow.webContents &&
    isTrustedWalletURL(contents.getURL());

  walletSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(isTrustedWebContents(contents) && permittedWebFeatures.has(permission));
  });
  walletSession.setPermissionCheckHandler((contents, permission) =>
    isTrustedWebContents(contents) && permittedWebFeatures.has(permission)
  );
  walletSession.setDevicePermissionHandler(() => false);
  walletSession.on('select-hid-device', (event, _details, callback) => {
    event.preventDefault();
    callback();
  });

  configureWebBluetooth(currentWindow, isTrustedWalletURL);

  // Track window state
  mainWindowStateKeeper.track(currentWindow);

  // Use only the local bundled index.html, never a remote wallet site.
  currentWindow.loadURL(url.pathToFileURL(trustedIndexPath).toString());

  // Emitted when the window is closed.
  currentWindow.on('closed', function () {
    mainWindow = null;
  });

  // The legacy 'new-window' event was removed in Electron 22.
  // Never create a second Electron window for external web links; use the OS browser.
  currentWindow.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
    try {
      // Do not pass arbitrary protocols (e.g. file:, javascript:) to the OS.
      const parsed = new URL(externalUrl);
      if (parsed.protocol === 'https:') {
        shell.openExternal(externalUrl).catch(error => {
          log.warn('Could not open external URL:', error);
        });
      } else {
        log.warn('Blocked non-HTTPS external URL');
      }
    } catch (error) {
      log.warn('Blocked invalid external URL:', error);
    }
    return { action: 'deny' };
  });

  currentWindow.webContents.on('did-finish-load', function () {
    currentWindow.setTitle(`Nault - ${autoUpdater.currentVersion}`);
  });

  const menuTemplate = getApplicationMenu();

  // Create our menu entries so that we can use MAC shortcuts
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function sendStatusToWindow(progressObj: { bytesPerSecond: number; percent: number; transferred: number; total: number }) {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + Math.round(progressObj.percent) + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';

  log.info(log_message);
  // sending message to ipcRenderer can be done as well but not sure where and how to display it
  // using the title bar instead
  // mainWindow.webContents.send('downloading', Math.round(progressObj.percent));
  mainWindow?.setTitle(`Nault - ${autoUpdater.currentVersion} - Downloading Update: ${Math.round(progressObj.percent)} %`);
}

// run only one app
const appLock = app.requestSingleInstanceLock();

if (!appLock) {
  app.quit();
} else {
  app.on('ready', () => {
    // Once the app is ready, launch the wallet window
    createWindow();

    // on windows, handle deep links on launch
    if (process.platform === 'win32') {
      const deeplink = findDeeplink(process.argv);
      if (deeplink) handleDeeplink(deeplink);
    }

    // Check for any updates on GitHub
    checkForUpdates();
  });

  // Refocus the window if the user attempts to open Nault while it is already open
  app.on('second-instance', (event, argv, workingDirectory) => {
    if (mainWindow) {

      // Detect on windows when the application has been loaded using a nano: link, send it to the wallet to load
      if (process.platform === 'win32') {
        const deeplink = findDeeplink(argv);
        if (deeplink) handleDeeplink(deeplink);
      }

      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // Detect on macos when the application has been loaded using a nano: link, send it to the wallet to load
  app.on('will-finish-launching', () => {
    app.on('open-url', (event, eventpath) => {
      if (!mainWindow) {
        createWindow();
      }
      handleDeeplink(eventpath);
      event.preventDefault();
    });
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow();
    }
  });
}

async function checkForUpdates(manual = false) {
  // Source checkouts have no packaged updater configuration. Never contact the
  // release feed while testing a development branch.
  if (!app.isPackaged) return;
  if (manual) {
    manualUpdateCheck = true;
    showUpdateErrors = true;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // The updater error event does not consume the rejected check promise.
    log.warn('Update check failed:', error);
  }
}

// Build up the menu bar options based on platform
function getApplicationMenu() {
  const t = desktopLabels(app.getLocale());
  const template: any = [
    {
      label: t.edit,
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'pasteandmatchstyle'},
        {role: 'delete'},
        {role: 'selectall'}
      ]
    },
    {
      label: t.view,
      submenu: [
        {role: 'reload'},
        {role: 'forcereload'},
        {role: 'toggledevtools'},
        {type: 'separator'},
        {role: 'resetzoom'},
        {role: 'zoomin'},
        {role: 'zoomout'},
        {type: 'separator'},
        {role: 'togglefullscreen'}
      ]
    },
    {
      role: 'window',
      label: t.window,
      submenu: [
        {role: 'minimize'},
        {role: 'close'}
      ]
    },
    {
      role: 'help',
      label: t.help,
      submenu: [
        {
          label: t.docs,
          click () { loadExternal('https://docs.nault.cc/'); }
        },
        {
          label: 'Reddit (r/nanocurrency)',
          click () { loadExternal('https://www.reddit.com/r/nanocurrency'); }
        },
        {type: 'separator'},
        {
          label: t.github,
          click () { loadExternal('https://github.com/twister65/Nault'); }
        },
        {
          label: t.bug,
          click () { loadExternal('https://github.com/twister65/Nault/issues/new'); }
        },
        {
          label: t.releaseNotes,
          click () { loadExternal('https://github.com/twister65/Nault/releases'); }
        },
        {type: 'separator'},
        {
          label: t.checkUpdates,
          enabled: app.isPackaged,
          click () {
            void checkForUpdates(true);
          }
        },
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Nault',
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {
          label: t.checkUpdates,
          enabled: app.isPackaged,
          click () {
            void checkForUpdates(true);
          }
        },
        {type: 'separator'},
        // {role: 'services', submenu: []},
        // {type: 'separator'},
        {role: 'hide'},
        {role: 'hideothers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'}
      ]
    });

    // Edit menu
    template[1].submenu.push(
      {type: 'separator'},
      {
        label: t.speech,
        submenu: [
          {role: 'startspeaking'},
          {role: 'stopspeaking'}
        ]
      }
    );

    // Window menu
    template[3].submenu = [
      {role: 'close'},
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'}
    ];
  }

  return template;
}

function loadExternal(externalurl: string) {
  shell.openExternal(externalurl);
}

let deeplinkReady = false;
ipcMain.once('deeplink-ready', () => deeplinkReady = true);
function handleDeeplink(deeplink: string) {
  if (!deeplinkReady) {
    ipcMain.once('deeplink-ready', (e) => {
      mainWindow?.webContents.send('deeplink', deeplink);
    });
  } else {
    mainWindow?.webContents.send('deeplink', deeplink);
  }
}

function findDeeplink(argv: string[]) {
  const nano_scheme = new RegExp(`^(${nano_schemes.join('|')}):.+$`, 'g');
  return argv.find((s) => nano_scheme.test(s));
}
