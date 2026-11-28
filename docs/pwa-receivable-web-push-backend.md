# PWA incoming, outgoing and release-update Web Push backend (design and deployment plan)

Status: **frontend-only draft**. Do not enable production subscriptions before the backend has been implemented, secured, and reviewed. This document describes an API contract and deployment checklist; it is not a deployed service.

## Scope and privacy

Nault should notify Android about **three independent, explicitly enabled events** even when the PWA is closed:
- **Receivable XNO:** a *confirmed send* makes XNO receivable by a configured wallet account. This is NOT a receive block and does not require unlocking, signing, or PoW.
- **Outgoing XNO:** a confirmed send block from a monitored public account, including a send initiated on another device. A receive, change, epoch or unconfirmed send is not an outgoing payment. No minimum receive threshold applies to outgoing sends.
- **PWA releases:** a new PWA build has been **successfully deployed and verified** on the user's origin, not merely committed, tagged, or built.

The frontend uses Angular's existing service worker and SwPush. Unlike Natrium's native Flutter app, the PWA uses standard Web Push with VAPID, not the Firebase SDK. While the PWA is open, the **existing** Angular SwUpdate VERSION_READY toast remains responsible for notifying about an installed update and offering safe activation. The backend is for system notifications when the PWA is closed; a push does not itself install or activate a release.

All three event categories are separate opt-ins per browser installation. Notification permission alone must not enroll users. **Release alerts must work with no configured wallet.** For XNO alerts subscribe only the wallet's public nano_ addresses, never its seed, private keys, Ledger data, PoW API keys, or wallet ciphertext. For release-only subscriptions the account list MUST be empty. The backend necessarily learns which public accounts are associated with a browser push subscription when incoming or outgoing monitoring is enabled. This association, along with push endpoint and Web Push encryption keys, is sensitive metadata. Do not log or expose it. Offer a privacy notice before enrollment.

The frontend must display "not available" when GET /api/push/config is absent (404, 503, timeout) and must make no enrollment requests on an unused fresh installation; an installed Android PWA may read /config for its first-launch permission guide. Electron is out of scope.

## Frontend/backend API contract (same HTTPS origin)

All JSON requests/responses must use application/json, except successful DELETE (204). No cross-origin CORS. Require strict Content-Type and Origin checks for write endpoints. Limit request size, account count, and rate. Never accept user-supplied callback or delivery URLs other than a validated browser PushSubscription endpoint. The backend must not fetch arbitrary URLs supplied by clients.

- GET /api/push/config -> 200 { "enabled": true, "vapidPublicKey": "<base64url P-256 public key>" }. Return enabled=false during maintenance. Never expose the VAPID private key.
- POST /api/push/subscriptions -> 201 { "id": "<opaque random id>", "managementToken": "<high-entropy bearer secret>" }. Body: { "subscription": { "endpoint": "...", "expirationTime": null, "keys": { "p256dh": "...", "auth": "..." } }, "notifyReceivable": true, "notifyOutgoing": false, "notifyUpdates": false, "accounts": ["nano_..."], "minimumReceiveRaw": "1000000" }. **At least one** preference must be true. When notifyReceivable=false AND notifyOutgoing=false the accounts array MUST be empty; an update-only subscription needs no wallet. Register atomically; hash the management token at rest. Treat the endpoint as a secret, verify push-service origin against a maintained allowlist, validate account checksums, require a confirmed same-origin browser request, and rate limit registration.
- PUT /api/push/subscriptions/{id} with Authorization: Bearer <managementToken>, body { "notifyReceivable": false, "notifyOutgoing": false, "notifyUpdates": true, "accounts": [], "minimumReceiveRaw": "..." } -> 204. Replace **all three preferences and the entire account set atomically**, never append to a stale wallet. Require the management capability. Keep the existing browser PushSubscription while any preference remains enabled.
- DELETE /api/push/subscriptions/{id} with Authorization: Bearer <managementToken> -> 204. Revoke the record and all mappings atomically, when all preferences are disabled or the user clears **all** application data. This must work even when push delivery is unavailable.

**Internal, privileged deployment endpoint (not routed publicly through Apache):** `POST http://127.0.0.1:<push-port>/internal/releases`, authenticated with a separate high-entropy deploy token held by the server-side deployment script. Request body (example): `{ "version": "1.19.1", "revision": "<verified deployed Git SHA>", "deploymentId": "<stable deployed build fingerprint>" }`. The backend determines its own configured application origin; it MUST NOT accept arbitrary origin, recipient, URL, or push payload from a caller. Accept events only after the exact build was successfully deployed and verified. Make the endpoint idempotent by deploymentId and keep an audit log free from subscriber identifiers. Do not expose the internal endpoint with the public `/api/push/` reverse proxy.

Only the push service should accept this API. Do not proxy it to the Nano RPC. Requests must not include browser cookies or open-ended arbitrary origins. Review CSRF and browser request provenance. The management token is a bearer capability stored locally by Nault; protect against XSS and enforce strict CSP.

**Important**: Public Nano addresses are not proof of ownership. This opt-in service does not authorize spending and supports watch-only wallets. An adversary could subscribe their own device to any public account; limit abuse via registration throttles, quotas, verification of browser push capabilities, and monitoring. Do not present "account ownership verified" in the UI. If strong ownership proof becomes a requirement, design a separate challenge scheme compatible with Ledger and watch-only first.

## Debian-salon / Apache / RsNano layout

Suggested structure:

- Existing Apache 2.4 HTTPS virtual host for `twister32.changeip.org`: proxy **only /api/push/** to a small service bound to 127.0.0.1:<dedicated port>, with body limits, throttling, secure headers, and ModSecurity rules. Do not alter the existing /proxy Nano RPC, /ws WebSocket, or /pow routing.
- Service run under a dedicated, unprivileged systemd account with an isolated working directory. Use systemd hardening, restart policy, journal redaction, and a health check. Do not run it as www-data or root.
- SQLite file outside DocumentRoot, e.g. /var/lib/nault-push/subscriptions.sqlite, mode 0600 under the service account. Enable WAL mode, busy timeout, foreign keys, periodic backups and retention. Never serve the file through Apache.
- VAPID P-256 keypair and any token-hashing secrets stored outside the web root (systemd credentials or root-managed secret files with restricted access). Public VAPID key goes into /config. Rotation invalidates browser subscriptions unless explicitly migrated.
- A single process subscribes to confirmations from the local RsNano WebSocket (`[::1]:7078`) and verifies receivable status over local RPC (`[::1]:7076`), independently of the frontend's chosen RPC node. Keep these listeners on loopback; do not expose the native ports.
- The **same** process accepts a trusted local deployment event from the existing `deploy-nault-master.sh` script and sends release alerts to `notify_updates=1` subscribers. No second backend or database is required. An actual integration with the local script is **not** included in this frontend PR.
- No PostgreSQL, Redis, Firebase SDK or wallet seed is required for a first installation. A backend implementation and actual encrypted Web Push delivery library **are** required.

## Suggested SQLite schema

Implement migrations, constraints, TTL and transactions rather than using the sketch directly in production:

    subscriptions(
      id TEXT PRIMARY KEY,
      endpoint_ciphertext BLOB NOT NULL,
      p256dh_ciphertext BLOB NOT NULL,
      auth_ciphertext BLOB NOT NULL,
      management_token_hash BLOB NOT NULL,
      min_receive_raw TEXT NOT NULL,
      notify_receivable INTEGER NOT NULL DEFAULT 0 CHECK(notify_receivable IN (0, 1)),
      notify_outgoing INTEGER NOT NULL DEFAULT 0 CHECK(notify_outgoing IN (0, 1)),
      notify_updates INTEGER NOT NULL DEFAULT 0 CHECK(notify_updates IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )

    subscription_accounts(
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      account TEXT NOT NULL,
      PRIMARY KEY(subscription_id, account)
    )
    CREATE INDEX idx_push_account ON subscription_accounts(account);

    delivered_blocks(
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      account TEXT NOT NULL,
      send_hash TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
      notified_at INTEGER NOT NULL,
      PRIMARY KEY(subscription_id, account, send_hash, direction)
    )

    deployments(
      deployment_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      revision TEXT NOT NULL,
      deployed_at INTEGER NOT NULL
    )

    delivered_releases(
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      deployment_id TEXT NOT NULL REFERENCES deployments(deployment_id) ON DELETE CASCADE,
      notified_at INTEGER NOT NULL,
      PRIMARY KEY(subscription_id, deployment_id)
    )

For a future upgrade from the receivable-only draft, migrate existing opt-in records to `notify_receivable=1, notify_updates=0`. Never enable release or outgoing alerts implicitly; migrate notify_outgoing to 0. Apply transactional, restart-safe SQLite migrations with schema versioning; enforce `accounts=[]` whenever `notify_receivable=0 AND notify_outgoing=0`.

Encrypted endpoint/key fields are a recommended hardening option; do not store them in plaintext logs. Enforce retention and purge delivered_blocks and dead endpoints. Keep token hashes one-way. Use a unique endpoint constraint or idempotent registration to avoid duplicates across resubscriptions.

## Detection and delivery

1. Subscribe to Nano *confirmation* messages, filter state sends by block.link_as_account and the subscribed public accounts. Do not equate "send confirmed" with "receive completed".
2. Verify account and send hash via RsNano RPC; confirm the block is still receivable (accounts_receivable/accounts_pending with include_only_confirmed as supported). Handle zero-balance unopened accounts. Do not trust WebSocket data alone.
3. Compare the amount in raw units to each subscriber's minimum threshold; default to a non-zero minimum based on Nault's current setting to prevent dust spam.
4. Deduplicate by (subscription, destination account, send hash), atomically recording a delivery attempt. Retry failures with bounded backoff, suppress duplicates on reconnect and process restart. Unavailable RPC or WS must trigger reconnection and reconciliation, never an invented confirmation.
5. When listeners resume, reconcile active subscriptions against RPC; define a baseline for already-pending blocks at opt-in to avoid alert floods. Persist sufficient event state to avoid missing new confirmed sends.
6. Send an RFC-compliant encrypted Web Push request with VAPID authorization to the PushSubscription endpoint. Angular expects JSON such as:

       {
         "notification": {
           "title": "Nault — Incoming XNO",
           "body": "XNO is waiting to be received. Open Nault to review.",
           "tag": "xno-<send-hash>",
           "icon": "/assets/icons/icon-192x192.png",
           "data": {
             "onActionClick": {
               "default": { "operation": "openWindow", "url": "/accounts" }
             }
           }
         }
       }

7. Never include seed, API credentials or confidential wallet metadata in the push payload. Make amount display optional only after explicit consent; OS lock screens can expose notification text.
8. Delete stale subscriptions on Web Push HTTP 404/410; handle 429/5xx and network failures with exponential backoff and a circuit breaker. Validate endpoints to prevent SSRF and use outbound HTTPS only.

## Outgoing XNO notifications (closed PWA)

Subscribe to confirmed send blocks from monitored source accounts, not only destination accounts. Verify the block hash, confirmed status, source account and send subtype with local RsNano RPC; do not alert from an unverified WebSocket message, an unconfirmed broadcast, a failed payment, a change, a receive, or an epoch block. Use a durable per-account confirmation frontier and bounded account-history reconciliation on reconnect, with a registration baseline so old outgoing transfers are never announced. Do not apply the incoming minimum threshold to outgoing sends. A self-transfer may generate one outgoing and one incoming alert when both categories are enabled; deduplicate per subscription, account, hash and direction. Use a transactional outbox with bounded retries and stable notification tags; Web Push cannot guarantee exactly-once delivery. The generic payload title/body should state that an outgoing XNO transaction was confirmed, without revealing the amount, recipient or account by default. Open the accounts or verified transaction route on tap. This is an informational alert, not authorization or proof of ownership.

## Release-update notifications (closed PWA)

The *same* push-subscription record contains `notify_updates` independent of `notify_receivable` and `notify_outgoing`. No wallet is required. The backend must not infer consent from a browser's generic Android notification permission. Do not send update alerts to recipients who only opted into XNO notifications.

**Trigger:** only after the Apache PWA deployment has completed successfully and the served build/service-worker assets have been verified. Existing local `deploy-nault-master.sh` can eventually call the private loopback endpoint using a separate credential, once its deploy-and-verify step has succeeded. A release tag, GitHub commit, CI success, Vercel test deployment, failed Apache deployment, or rollback alone is **not** evidence of a new production update. Never modify the deployment script until requested and tested on staging. Avoid announcing a version to users before Angular's update assets are reachable.

**Delivery and idempotency:** securely identify the deployed build by `deploymentId` (release build fingerprint / commit SHA), plus a verified version for display. For each enabled subscriber, insert a unique (subscription_id, deployment_id) delivery record and use a bounded retry worker for temporary Web Push failures. A script retry or service restart cannot send a second alert for the same deployment. Do not broadcast old deployment events to devices that subscribed afterward. Separate staging and production by service configuration / origin; never mix subscriptions across origins.

**Example encrypted Web Push payload** (Angular service worker handles the notification click while the PWA is closed):

    {
      "notification": {
        "title": "Nault — Update available",
        "body": "Nault 1.19.1 is ready. Open Nault to update.",
        "tag": "nault-release-<deployment-id>",
        "icon": "/assets/icons/icon-192x192.png",
        "data": {
          "onActionClick": {
            "default": { "operation": "openWindow", "url": "/" }
          }
        }
      }
    }

Use the version **actually deployed**, never a hard-coded version. Clicking opens the PWA; Angular `SwUpdate` handles readiness and offers activation, subject to existing Ledger signing safety checks. Never force an application reload or update activation in the push handler. A notification does not guarantee the browser has already installed the service-worker update.

**Operational acceptance tests:** release-only subscription with no wallet, three independently configurable alert types on one device, suppression after opting out, initial-install baseline (do not push the current version as "new"), repeat deployment event, same-version redeploy, rollback, delayed/failed deploy, staging vs production isolation, PWA closed/locked, Angular offline cache, and signing-in-progress safety.

## Wallet lifecycle and tests

- Fresh installed Android PWA: check Notification.permission and /config without enrolling. When a backend is configured and permission or enrollment is inactive, show a dismissible guide to Settings. Request permission only on a subsequent explicit enable click. Explain Android Settings > Apps > Nault (or Chrome) > Notifications and site permissions when blocked; the web app cannot grant or inspect every OS-level notification toggle. On other platforms retain the existing behavior.
- Opt-in from Settings: request permission *on a user click*. For incoming or outgoing XNO alerts, register only configured wallet accounts; for release-only alerts, register **zero** wallet addresses. Preserve the management capability locally and use the same browser subscription for both preferences.
- Add/remove account: replace the registered account set; switching wallets must not retain the previous account list.
- Change minimum receive threshold: update the registered raw-unit threshold.
- Delete the wallet: atomically remove its account list and both `notifyReceivable` and `notifyOutgoing` permissions on the server **before** deleting wallet data. Preserve an independently enabled release subscription. Clearing **all** app data or disabling all event categories must revoke the entire subscription before erasing its management credential. If the service is offline, fail closed and warn; do not falsely promise revocation. Provide a tested offline recovery procedure.
- Verify hot wallet locked/unlocked, manual and automatic receive, disconnected Ledger, multiple accounts, duplicate confirmations, empty wallet, Android PWA closed and phone locked, offline/reconnect, push subscription rotation, expired endpoints, database restart, and service unavailable.
- Verify existing RPC/PoW failover and Angular service worker update workflow remain intact, with no duplicate Android/Angular prompts and no automatic activation during Ledger signing.
- On staging, first exercise /config disabled and a simulated backend; only after review enable production on a controlled test phone. Run CI, Playwright and real Android tests before merging.

References:
- https://angular.dev/ecosystem/service-workers/push-notifications
- https://angular.dev/api/service-worker/SwPush
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://github.com/appditto/natrium-wallet-server

This design does not claim the backend is installed or that push delivery has been verified.

## Debian-salon implementation and acceptance gate

The API contract must be implemented before activating any subscription: dedicated unprivileged systemd service, loopback HTTP listener, persistent SQLite state, durable outbox, VAPID secrets outside the web root, verified local RsNano RPC/WS, endpoint allowlisting and strict request validation. Expose only /api/push/ under the existing HTTPS PWA origin; leave /proxy, /ws and /pow unchanged. Keep the private deployment hook off Apache. Stage with isolated database, keys and deployment token; verify Apache and ModSecurity configuration before reloading. Verify Android notification permissions, first-run guide, independent incoming/outgoing/update opt-ins, locked screen, closed PWA, external device sends, confirmed-vs-unconfirmed behavior, reconnect deduplication, service restart, wallet deletion and rollback. Do not claim delivery until real Android tests pass. No backend implementation, server changes or deployment is included in this draft.
