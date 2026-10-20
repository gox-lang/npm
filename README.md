# GOX CLI for npm

One JavaScript package installs the official GOX executable from **GitHub Releases**.
No native binaries are committed to this repository or included in the npm package.
No Python, Go compiler, curl, tar or unzip command is needed by this installer.

## Installation

Node.js 20 or newer is required.

```sh
npm install -g @gox-lang/cli --ignore-scripts=false --foreground-scripts
gox version
```

Installation scripts must be enabled. On npm versions that require explicit script
approval, also allow this package (for global installs, supported npm versions offer
`--allow-scripts=@gox-lang/cli`). Do not disable organization security policies globally.
See [npm configuration](https://docs.npmjs.com/cli/using-npm/config/) for your version.

npm places `gox` in its global command directory, which must be on PATH. The installer
does not modify shell profiles or create a second installation outside this package.

Linux/glibc, macOS and Windows releases support x64 and arm64. Native Windows can run
the CLI/LSP; use WSL for application development because Go plugins require it.
Alpine/musl is not supported by the official Linux binaries.

## How it works

`postinstall` detects the platform, downloads the exact release matching this package's
version from `gox-lang/server`, verifies the archive against that release's SHA-256
checksums, extracts only the executable, and checks `gox version` before installing.
The downloaded executable and receipt live in `.vendor/`, excluded from Git and npm.
The launcher checks the receipt and binary digest, then forwards arguments and stdio.
It never downloads during ordinary command execution.

Internet access to GitHub and its release-asset CDN is required during installation.
A failed download or verification fails installation; it never falls back to another
binary source. HTTPS and release checksums are used, not an independent signing system.

## Scripts disabled or incomplete installation

The command prints instructions and exits without downloading. To complete a global
installation explicitly:

```sh
npm rebuild -g @gox-lang/cli --ignore-scripts=false --foreground-scripts
```

For a local project dependency, omit `-g`. If your npm version requires package-specific
approval, approve this package before rebuilding.

## Updates

```sh
npm install -g @gox-lang/cli@latest --ignore-scripts=false --foreground-scripts
```

Use npm to manage this installation. `gox update` prints npm update instructions; LSP
auto-update is disabled in the child environment so it cannot replace npm's executable.
GOX v0.1.3 native update notices may still recommend `gox update`; the launcher redirects
that command. Future server releases can improve the wording. Invoking the nested
binary directly bypasses these launcher rules.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run test:install
npm pack --dry-run
```

The smoke test installs a tarball in a temporary global prefix, checks the missing-script
message, explicitly rebuilds from GitHub, runs GOX, and checks corruption detection.
No developer installation or shell configuration is changed.

- `bin/gox.cjs`: command launcher.
- `lib/install.cjs`: installation, verification and archive handling in JavaScript.
- `tests/`: JavaScript unit and isolated installation tests.
- `package-lock.json`: locked development dependency tree.

The package version pins the corresponding GOX release, not a moving latest download.
Before each publication, run the cross-platform CI checks and inspect the tarball.
Publication requires maintainer access to the npm organization and is not automated here.

## Contributing

Bug reports and proposals are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
for the current GOX contribution policy.

## Security

Report potential vulnerabilities privately through GitHub Private Vulnerability Reporting.
See [SECURITY.md](SECURITY.md) for the reporting process.

## License

MIT — see [LICENSE](LICENSE).
