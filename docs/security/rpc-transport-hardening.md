# RPC transport hardening (S-02 / S-06)

## Policy and compatibility

RPC and custom PoW endpoints must use HTTPS; WebSocket endpoints must use WSS.
Plaintext is allowed only when the parsed hostname is `localhost`, `127.0.0.1`,
or `[::1]`. Private LAN addresses have no implicit exemption. URL credentials,
fragments and other protocols are rejected. Existing saved settings are checked
at the network boundary, not just when saving the form.

Users with HTTP/WS nodes on another LAN machine must configure a TLS reverse
proxy (trusted certificate), or a loopback tunnel. TLS certificate checks and
Electron sandbox/webSecurity remain enabled. Configure the final RPC URL:
redirects are rejected, including redirects to another HTTPS endpoint.

RPC uses a small Fetch transport because XHR automatically follows redirects.
It omits ambient cookies, HTTP authentication and referrers and disables caching.
The explicit Authorization header is sent only to the configured custom RPC,
never to public random endpoints or to an explicit custom PoW server (even on
the same origin). Switching away from Custom clears the saved header. Settings
and credentials are snapshotted for each request to prevent cross-request races.
This does not protect against a compromised custom server intentionally given
the credential.

## Finite request budgets

- Reads: at most three HTTP calls total, 15 seconds per call, 45 seconds overall.
- Random mode: each eligible endpoint is tried at most once, except the precise
  legacy receivable-action fallback on that same endpoint; it consumes the same
  three-call budget. Failover is request-local and does not mutate global settings.
- Authentication, malformed-response and other non-transient errors stop retries.
- `process`: one call only. A lost reply can mean the block was accepted. Check
  chain/account state before manually retrying; a timeout is not proof of rejection.
- `work_generate`: one call, up to two minutes; a timeout aborts the underlying
  Fetch request. This may require tuning for unusually slow work servers.
- WebSocket: initial connection plus at most five automatic reconnects per explicit
  connection cycle, with a 15-second handshake timeout and increasing delays.
  Successful short-lived opens do not reset the budget. Saving server settings
  explicitly resets it. Timers and stale sockets are cancelled on that reset.
  After exhaustion, live notifications stop; manual balance refresh remains
  available. No wallet keys or signed blocks are modified by this change.

## Validation

Focused Jasmine regression coverage includes endpoint policy, credential scope,
redirect refusal configuration, transport cancellation, proxy compatibility,
finite failover, read/PoW deadlines, no transaction replay, socket retry exhaustion
and stale timer cancellation. The existing Nano/RsNano block and wallet tests
remain part of `src/test-rpc.ts`. Run:

```
npm test -- --main=src/test-rpc.ts --watch=false --browsers=ChromeHeadlessCI --progress=false
npm run wallet:build-desktop
npm run desktop:compile
npm run lint
```

Hardware Ledger and real-node tests are still required before merging: check
balances, send/receive/change representative, public legacy proxy fallback,
HTTPS/WSS custom node with authorization, localhost node, LAN plaintext rejection,
server switching, disconnected network recovery and restoration of live updates
by saving settings after the retry budget is exhausted. Use test accounts.
The unrelated full legacy component suite is not covered by this focused entrypoint.
