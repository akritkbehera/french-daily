# Owner access

Manual token entry has been removed. French Daily now supports **Continue with
GitHub**, with repository writes restricted server-side to `akritkbehera`.
See [GitHub sync setup](github-sync.md) for the one-time App registration and
authentication Worker deployment.

Local practice remains usable when signed out or offline. The public progress
JSON lives on the `progress-data` branch of the same repository. The browser
never receives the GitHub access/refresh tokens; it receives an opaque revocable
app session. GitHub credentials are encrypted in the broker's credential store.
No credentials or app sessions are included in progress exports or sync files.

This does not make the public app or progress private. Owner authorization
protects writes. Readers can access the source and progress JSON on GitHub, as
requested. Your device's IndexedDB remains the offline working copy.
