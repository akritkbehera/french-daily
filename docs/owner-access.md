# Personal owner access

The deployed interface is for the GitHub repository owner. GitHub Actions sets
`VITE_REPOSITORY_OWNER` from `github.repository_owner`; the fallback is
`akritkbehera`. A fork should set this at build time to its own owner.

To unlock, create a short-lived fine-grained GitHub personal access token with
no repository or account permissions, and enter it into the app's password field.
The browser sends the token only to `https://api.github.com/user`, verifies the
returned login, then discards it. It is never put in storage, logs, URLs, backups
or the repository. Owner verification requires internet access. A non-secret
verification marker lasts in this tab's session storage for seven days so offline
reloads work. Lock clears that marker without deleting learning progress.

This is an interface lock, not a server-enforced access boundary. GitHub Pages
serves the code and datasets publicly. Someone can download the source or alter
the client to bypass the lock. No other visitor can thereby read this device's
IndexedDB. Do not store confidential shared assets in this public deployment.
True private hosting requires server/edge authentication or an eligible private
Pages setup. No OAuth app/client secret or backend has been provisioned here.
