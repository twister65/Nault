// This file is required by karma.conf.js and loads recursively all the .spec and framework files

// Angular 21 / zone.js 0.15: test patches use the public package export.
// The Angular test target loads zone.js via polyfills before this entrypoint.
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// Unfortunately there's no typing for the `__karma__` variable. Just declare it as any.
declare const __karma__: any;
declare const require: any;

// Prevent Karma from running prematurely.
__karma__.loaded = function () {};

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: false }
}
);
// Then we find all the tests.
// Isolate compatibility regression tests from unrelated, legacy Angular component smoke tests.
const context = require.context('./app/services', false, /(?:api|wallet|websocket|rpc-transport|endpoint-policy)\.service\.spec\.ts$/);
// And load the modules.
context.keys().map(context);
// Finally, start Karma to run the tests.
__karma__.start();
