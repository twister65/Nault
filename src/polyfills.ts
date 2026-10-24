import { Buffer } from 'buffer';
/***************************************************************************************************
 * Load `$localize` onto the global scope - used if i18n tags appear in Angular templates.
 */
import '@angular/localize/init';
// https://stackoverflow.com/a/51232137
(window as any).process = {
    env: { DEBUG: undefined },
    version: [],
    browser: true
};

// Preserve the Node-style globals used by Ledger dependencies in a browser context.
// Babel 6 previously masked the absence of `global` in the test/browser bundle.
(window as any).global = window;
(window as any).Buffer = (window as any).Buffer || Buffer;



/***************************************************************************************************
 * Zone JS is required by default for Angular itself.
 */
import 'zone.js';  // Included with Angular CLI.



/***************************************************************************************************
 * APPLICATION IMPORTS
 */
import 'core-js/stable';
