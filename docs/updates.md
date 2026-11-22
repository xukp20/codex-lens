# Managed deployment and releases

The normal command is `codex-lens serve`. To opt into release management, stop that Lens process and run `codex-lens manage` on the same port and with the same state directory. Use one supervisor per state directory. The manager starts and restarts its own Lens child.

- **Notify** checks GitHub at most every six hours.
- **Automatic** verifies and stages a newer release. The manager applies it after the dashboard has been idle for ten minutes, at the next managed startup, or when requested.
- **Off** disables automatic checks. Manual checks remain available in the managed dashboard.

The version popover shows release notes and download/activation status. A release contains a wheel, source tarball and SHA256SUMS. The manager checks official GitHub HTTPS endpoints, bounds each download including the response body, compares the wheel to its release checksum, and installs the candidate into a separate directory. It starts the synthetic demo on a temporary loopback port and verifies the build version, sessions and dashboard before staging.

Activation verifies the new process on the configured service port and then records the active version. A failed start keeps the previous version active. A manual rollback records the rejected release so automatic updates skip it. The independent SQLite databases and preferences remain in the state directory throughout.
