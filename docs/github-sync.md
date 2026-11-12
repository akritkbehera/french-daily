# GitHub sign-in and progress sync

The browser saves every review immediately in IndexedDB. A Sync button merges
progress with `akritkbehera/french-daily`, branch `progress-data`, file
`progress.json`. A completed focused session or swipe deck requests sync
automatically. Signing in and reconnecting after going offline also request sync.
Failed uploads leave local progress untouched and can be retried with Sync.

The JSON is public, as requested. Tokens, auth sessions and safety snapshots are
not included. `progress-data` writes do not trigger the main-branch Pages workflow.
Progress is not considered uploaded until GitHub confirms the SHA-checked write.

## One-time connection setup

GitHub Pages cannot host the OAuth exchange and securely keep GitHub credentials.
The included small Cloudflare Worker does that. D1 stores only expiring sign-in
state and encrypted GitHub tokens; review data is stored in your GitHub repo.
You need GitHub CLI (`gh`), Node 22+, and a Cloudflare account. This setup may
open your browser to sign in to Cloudflare and register/install a GitHub App.
Choose only `akritkbehera/french-daily` when installing the app.

From your existing checkout on your own computer:

```sh
git pull --ff-only
npm ci
npm run setup:sync
```

The helper:

1. Checks that `gh` is authenticated as `akritkbehera`.
2. Deploys the Worker and its D1 credential store through Wrangler.
3. Opens GitHub's manifest flow to register a private personal GitHub App with
   Contents read/write and the correct callback URL.
4. Pipes the generated credentials directly into Worker secrets. It never writes
   them to the checkout or prints them. The generated PEM is unused and discarded.
5. Opens the app installation page; you select only `french-daily`.
6. Sets the non-secret repository variable `FRENCH_DAILY_AUTH_URL` and starts the
   GitHub Pages deployment.

After that deployment completes, choose **Continue with GitHub** on phone or
laptop. GitHub can use your existing GitHub passkey/session. There is no separate
French Daily password or token entry. Each device receives a revocable app
session, not the GitHub token. Learning can continue offline; syncing needs internet.

The helper is meant to run in a local terminal with a browser on that same
computer. It uses a temporary `127.0.0.1` callback for GitHub registration. If you
use SSH, forward that port or use the manual setup below.

This setup cannot be activated by the code deployment alone: the GitHub App must
actually be registered/installed and the Worker must be deployed under an account
you control. Until `FRENCH_DAILY_AUTH_URL` is configured, the deployed UI says sync
is not connected and offers **Continue on this device**. It never claims to have
synced. Existing local history is preserved.

## Manual setup / resuming a partially completed setup

Do not re-register duplicate GitHub Apps after a partial setup. The ignored
`packages/auth-broker/.setup-state.json` records non-secret resource IDs and the
registered app URL. It contains no tokens or client secret.

1. Run `npx wrangler login` in `packages/auth-broker`.
2. Create a D1 database with `npx wrangler d1 create french-daily-auth`.
3. Copy `wrangler.jsonc` to ignored `wrangler.local.json` and fill in the D1 ID.
4. Build with `npm run build:packages` from the repository root, then deploy with
   `npx wrangler deploy --config wrangler.local.json` from the broker directory.
5. Register a GitHub App in your GitHub developer settings:
   - Homepage: `https://akritkbehera.github.io/french-daily/`
   - User authorization callback: `<Worker URL>/auth/callback`
   - Webhooks: disabled
   - Repository permission: Contents read/write
   - Install only on `akritkbehera/french-daily`
6. Configure Worker secrets using `npx wrangler secret put <NAME> --config
   wrangler.local.json`: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and
   `TOKEN_ENCRYPTION_KEY` (base64 encoding of 32 random bytes). Never put these
   in GitHub source, progress JSON or Vite variables.
7. Set `FRENCH_DAILY_AUTH_URL` to the Worker origin in GitHub Actions repository
   variables and rerun the Pages deployment.

Normal owner scope is configured through Worker variables `GITHUB_OWNER`,
`GITHUB_REPO`, `APP_URL`, and frontend `VITE_REPOSITORY_OWNER`. The frontend reads
`VITE_GITHUB_AUTH_URL`; the workflow maps `FRENCH_DAILY_AUTH_URL` to it.

## Merge and undo rules

- New attempts have stable UUIDs. Legacy event identities are derived from their
  immutable recorded fields, not device-local numeric database keys.
- Sync unions review events, orders them by timestamp then event ID, and replays
  the day-based FSRS scheduler. It does not choose one device's schedule and drop
  the other device's reviews.
- Undo creates a persistent deletion marker. Deleted events do not reappear when
  another device uploads an older copy. Completed-session revisions have their
  own IDs so undoing and completing a session again works.
- Writes include the last GitHub file SHA. A concurrent update is reread, merged
  and retried up to four times. Uploads are serialized within each tab.
- Reviews answered while a network upload is running are retained and queued for
  another upload. Database writes apply atomically after a successful upload.
- Local safety snapshots remain local. Public JSON is review history plus
  settings, sessions, milestones, challenges and deletion markers.
- Git history retains previous JSON commits. This is sync and versioned backup,
  not a mechanism for permanently erasing data already published to GitHub.

## Verification

The suite tests divergent device histories, duplicate events, SHA conflicts,
concurrent local writes, failed/malformed downloads, deletion propagation and
undo after local IDs change. Broker tests exercise PKCE state, owner rejection,
one-time handoffs, browser-verifier binding, origin restrictions, authenticated
progress access, conflict responses, encrypted credentials and logout.

Actual GitHub OAuth/Cloudflare end-to-end sign-in requires the one-time connection
setup above. Mock tests do not establish that an unregistered app can sign in.
