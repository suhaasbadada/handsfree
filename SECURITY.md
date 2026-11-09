# Security

Development builds add explicit, signed in-app updates; see [updater trust and
key custody](docs/UPDATES.md). Checks and downloads are user-initiated. The
dedicated updater key is separate from the existing macOS signing identity;
signature verification and signed-version binding cannot be disabled. This is
not Apple notarization or proof that a new release passed hardware acceptance.

HandsFree is pre-release software. The current product and development scope is Mac-only: Apple Silicon, macOS 14+. There is no formal support window or response-time guarantee. Windows work is paused and Linux is not supported; historical Windows artifacts are not a current support or security-maintenance commitment. No port or release date is promised. Updates are manual. Mac builds are locally self-signed and not Apple-notarized. Automated build checks do not establish hardware compatibility or security certification.

Please do not post sensitive vulnerabilities, recordings, transcripts, credentials, or personal diagnostics in public issues. On GitHub, use **Security → Report a vulnerability** if private vulnerability reporting is enabled. If it is unavailable, open a minimal issue asking the maintainer to establish a private reporting channel, **without exploit details or private data**. No dedicated security email is advertised.

For ordinary bugs, use the bug template with invented sample text and redacted logs. See [privacy and diagnostics](docs/DEVELOPMENT.md). [Historical Windows records](docs/WINDOWS.md) retain prior implementation details, not current support guidance. Please still report vulnerabilities in historical releases privately. Do not disable Gatekeeper, Windows Defender, or organization security policies to work around an issue.
