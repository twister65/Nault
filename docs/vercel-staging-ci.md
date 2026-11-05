# Automatic Vercel staging deployment on master

The **Nault staging PWA** is hosted at https://nault-wallet-staging.vercel.app/ using
Vercel project `nault-wallet-staging`, **Production** environment.
This is a testing site; it is **not** the Apache release at `twister32.changeip.org`.

## Trigger and guarantees

- `.github/workflows/vercel-staging-production.yml` runs after every push
  to GitHub `master`, including merged pull requests. It also supports
  `workflow_dispatch` from `master` for a manual retry.
- Uses the GitHub event SHA, not a mutable branch lookup, as the Vercel
  `gitSource.sha`; skips obsolete queued runs if `master` has moved.
- Creates a **Production** deployment only in Vercel project
  `prj_VfYJOUtUeNBmS4UsAFAlisipBQCN` on team `olaverre-1312`.
- Fails if the deployment does not become READY or the production domain
  fails to resolve to that deployment and commit.
- Does **not** publish a Nault release, create a Git tag or deploy Apache.
- Vercel native Git pushes must not simultaneously deploy the same project;
  choose one deployment path to avoid double builds.

## One-time GitHub secret

The workflow requires the Actions repository secret `VERCEL_TOKEN`:

1. In Vercel, create an access token with access to the team
   `olaverre-1312` and permissions sufficient to create and read
   deployments for `nault-wallet-staging`.
2. In `twister65/Nault` on GitHub, go to **Settings → Secrets and
   variables → Actions → New repository secret**.
3. Name the secret exactly `VERCEL_TOKEN`, and paste the token **into
   GitHub's secret editor** (never into code, pull requests or chats).
4. Run **Actions → Deploy master to Vercel staging production → Run
   workflow** using branch `master` to verify the setup.

The workflow deliberately fails with a clear missing-secret message if
`VERCEL_TOKEN` has not been configured.

## Diagnose

Read the GitHub workflow run's deployment ID and final commit SHA. Use
Vercel Deployments for build errors and verify **About Nault** in the PWA
after accepting the service-worker update.

Previously this project had no active Vercel Git linkage, despite the
`master` branch not being excluded by `vercel.json`. If you later
reconnect Vercel's native Git integration for this project, disable this
GitHub Actions workflow to prevent duplicate production deployments.
