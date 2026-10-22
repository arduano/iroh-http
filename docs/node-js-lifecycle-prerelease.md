# Node.js lifecycle prerelease

`0.6.2-leo.20261022.1` adds application-owned process signal handling only in
the Node.js TypeScript wrapper. The Rust transport, ABI, shared package and
native source remain at `d799fa3f200b8ab862bad91ecd13a4389588111c`.

The owner-fork archive is built with the exact Linux x64 GNU and Windows x64
MSVC addons, generated native loader and declarations from the previously
published `leo-v6-iroh-0.6.2-d799fa3` archive. The packaging script verifies the
baseline archive SHA-256, both native addon SHA-256 values, unchanged native
source, a clean committed checkout, and an eight-file package allowlist.
It compiles shared TypeScript and the new Node.js wrapper, replaces the wrapper,
declarations, README and package manifest, and packs with scripts disabled.
Optional registry-native dependencies are omitted because the two supported
addons are included in the bundle. Other native targets require a source build.
No native binary is rebuilt or regenerated for this JavaScript-only release.

```sh
npm ci --ignore-scripts
node scripts/package-node-js-overlay.mjs \
  /path/to/iroh-http-node-0.6.2-fork-linux-win-x64.tgz /path/to/output
```

The output contains the package, `BUILD-RECEIPT.json` (source commit, baseline
identity, archive SHA-256/SHA-512 integrity and every member's SHA-256), and
`SHA256SUMS`. Publish these as a new owner-fork prerelease under a signed tag;
never replace an existing tag or asset. Do not publish to the upstream npm scope.
Consumers pin the exact release asset URL and lock integrity. Keep the existing
shared fork asset unchanged.

Focused qualification is `npm run test:signals --workspace=packages/iroh-http-node`,
`npm run test:node`, and `npm run typecheck`, plus a fresh consumer install of
the packed artifact. The signal tests deliver real POSIX SIGTERM/SIGINT in
disposable subprocesses using local endpoints with networking disabled. They
prove application-owned endpoint closure, delayed cleanup, owned child-process
exit and application-selected exit status, and preserve default standalone
auto-close/exit. They also cover listener preservation, invalid policies,
idempotence, pending creation, failed creation, open nodes and in-flight closure.
Signal-delivery cases are skipped on Windows; its binary is reused byte-for-byte.
Run `npm run ci` for the wider repository gates and report environment failures
without presenting them as passing. No production service or model call is needed.
