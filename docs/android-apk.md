# Android test APK — Nault (Chrome Trusted Web Activity)

This is a **test-only APK launcher**, not a standalone/offline Angular Android application.
Android Chrome renders a deployed HTTPS instance of Nault. The launcher has a separate
package ID (`cc.nault.android.testing`) and no wallet storage or secret signing keys.
The build neither deploys nor publishes a website.

## Why a TWA instead of Capacitor WebView?

The Ledger Nano X tests require **Web Bluetooth**, which Chrome supports on Android.
Android WebView does not provide Nault's current Web Bluetooth transport automatically.
A TWA uses the installed Android browser engine and preserves the website's origin,
permission prompts, and browser storage. USB/WebHID on Android is **not supported by
this launcher**; validate Ledger Nano X BLE only, before considering transactions.

The TWA is full-screen only when the web origin serves an Android Digital Asset
Links file (`/.well-known/assetlinks.json`) matching the package and signing
certificate. **Without it, Chrome displays a Custom Tab with an address bar**.
That fallback is intentional and suitable for the initial BLE tests. Do not claim
full-screen trust or production readiness with an unverified origin.

## GitHub Actions: produce an APK

1. Deploy the exact Nault source revision you want to test to an **HTTPS** site
   under your control (for example, a protected Vercel deployment). Confirm the
   site works directly in Chrome on Android. Never point a test APK at an
   untrusted site or assume `nault.cc` runs the fork.
2. In **Actions → Android APK (Chrome TWA test) → Run workflow**, choose the
   branch and supply `pwa_url` (for example, `https://your-preview.example/`).
   `workflow_dispatch` becomes available in the UI when the workflow exists on
   the repository default branch. Before merge, pushes to
   `feature/android-apk-twa` also run a build.
3. Download `nault-android-twa-debug-<run>` under the workflow's **Artifacts**.
   It contains `app-debug.apk` and its SHA-256 checksum. Check the URL recorded
   in the job summary: **that is the running application**.
4. Install with `adb install -r app-debug.apk` or transfer the APK to the
   Android device and approve installing it. On each CI run Android generates
   a new ephemeral debug signing key, so if an update fails with
   `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the **test-only** app
   (`adb uninstall cc.nault.android.testing`) first. That does not delete
   the Nault website's Chrome profile data.

**CI smoke-test warning:** on pushes/PRs with no `NAULT_ANDROID_TEST_URL`
repository variable set, CI uses `https://nault.cc/` merely to validate
the Android build chain. Such artifacts do **not** contain or test your fork.
Set repository variable `NAULT_ANDROID_TEST_URL` to the test deployment to
make automatic builds target your fork, or use the explicit `pwa_url` input.

## Local build (Ubuntu with Android SDK)

Requires JDK 17, Gradle 8.13, Android SDK platform 36 and build-tools 36.0.0.
No `npm install`, Angular rebuild, or keystore is needed to build this wrapper.

```bash
python3 scripts/validate-android-url.py 'https://your-preview.example/'
gradle -p android :app:assembleDebug --no-daemon -PnaultUrl='https://your-preview.example/'
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Minimum safe validation

1. Launch **Nault Android Test** and verify the exact HTTPS origin. Authenticate
   in Chrome if the preview is protected. In fallback mode, the address bar
   makes the origin visible.
2. Start with a watch-only wallet or existing hardware-backed account. **Never
   type a Ledger recovery phrase into Nault or an Android browser.**
3. Enable Bluetooth on the Nano X, unlock it, open the Nano app. In Nault, choose
   Ledger via Bluetooth. Verify the Nano address directly on the Ledger screen.
4. Check RPC/WebSocket connectivity and reconnect behavior. Do not send funds
   until the complete transaction flow is independently validated on a test account.
5. Record Android version, Chrome version, website commit/URL and relevant errors,
   **never secrets, raw APDUs, private keys or seed words**.

## Production and scope

A production APK needs a stable release-signing key, managed release process,
verified Digital Asset Links, a controlled HTTPS origin and mobile security review.
Do **not** ship this debug APK to Google Play or represent it as an offline vault.
Angular 21/22 and Electron are unaffected; this workflow packages whichever
already-deployed web version is supplied, not the working-tree Angular bundle.
