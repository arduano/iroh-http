# @momics/iroh-http-node

[![npm](https://img.shields.io/npm/v/@momics/iroh-http-node)](https://www.npmjs.com/package/@momics/iroh-http-node)

> Pre-v1.0. APIs may change between minor releases.

Node.js adapter for [iroh-http](https://github.com/momics/iroh-http). Native
addon via napi-rs. No child processes, no WASM.

## Install

```sh
npm install @momics/iroh-http-node
```

Pre-built binaries are published for macOS (x64, ARM), Linux glibc (x64, ARM),
and Windows (x64). Other platforms need a source build:

```sh
npx napi build --platform --release
```

## Quick start

```ts
import { createNode } from "@momics/iroh-http-node";

const node = await createNode();
console.log("Node ID:", node.publicKey.toString());

node.serve({}, (req) => {
  if (req.headers.get("Peer-Id") !== ALLOWED_PEER) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response("hello");
});

const res = await node.fetch("httpi://<peer-public-key>/");
console.log(await res.text());
await node.close();
```

## Full API

The API is identical across Node.js, Deno, and Tauri: HTTP fetch/serve, QUIC
sessions, mDNS discovery, and Ed25519 crypto. See the
[API overview](../../docs/api-overview.md) for the complete reference.

## Node.js specifics

- Standalone crypto functions (`generateSecretKey`, `secretKeySign`,
  `publicKeyVerify`) are **synchronous**. They run in Rust on the calling thread
  without a Tokio round-trip.
- The class API on a live node (`node.secretKey.sign()`,
  `node.publicKey.verify()`) is async.
- Serve callbacks run on the Node.js event loop via napi-rs
  `ThreadsafeFunction`.

### Process signals in an embedded application

By default the Node adapter handles `SIGTERM` and `SIGINT`, closes its
endpoints, and exits the process with status zero. A two-second deadline forces
termination with the signal's conventional exit status if closing stalls. This
standalone policy can interrupt asynchronous shutdown in an embedding
application.

Applications that own shutdown must configure signal ownership before the first
`createNode()` call:

```ts
import {
  configureProcessSignalHandling,
  createNode,
} from "@momics/iroh-http-node";

configureProcessSignalHandling("application");
const node = await createNode();
process.once("SIGTERM", async () => {
  await node.close();
  await finishApplicationCleanup(); // For example, await owned child processes.
  process.exitCode = 0;
});
```

`configureProcessSignalHandling(policy: "standalone" | "application"): void`
affects only this module instance. Application mode removes only the adapter's
own signal handlers and never calls `process.exit()` on signals. The application
must handle its signals, close all nodes, drain other work, and terminate. Other
listeners are preserved. Repeating the selected policy is idempotent; changing
it while a native endpoint is being created, is open, or its native close is
pending throws. It can be changed after every native endpoint has closed;
application cleanup can still be outstanding. Invalid policies throw
`TypeError`. The exported `ProcessSignalHandling` type describes both supported
policies.

## Other runtimes

| Runtime  | Package                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| Deno     | [`@momics/iroh-http-deno`](https://jsr.io/@momics/iroh-http-deno)                  |
| Tauri v2 | [`@momics/iroh-http-tauri`](https://www.npmjs.com/package/@momics/iroh-http-tauri) |

## License

MIT OR Apache-2.0
