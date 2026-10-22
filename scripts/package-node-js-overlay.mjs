// Build the Node-only JS lifecycle prerelease using the reviewed native addons.
// No Rust build, native-loader regeneration, or network access occurs here.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [baselinePath, outputPath] = process.argv.slice(2);
assert.ok(
  baselinePath && outputPath,
  "usage: node scripts/package-node-js-overlay.mjs BASELINE.tgz OUTPUT_DIR",
);
const baseline = path.resolve(baselinePath);
const output = path.resolve(outputPath);
execFileSync("git", ["diff", "--quiet", "HEAD", "--"], { cwd: root });
execFileSync("git", [
  "diff",
  "--quiet",
  "d799fa3f200b8ab862bad91ecd13a4389588111c",
  "HEAD",
  "--",
  "crates",
  "Cargo.toml",
  "Cargo.lock",
  "packages/iroh-http-node/src",
  "packages/iroh-http-node/Cargo.toml",
], { cwd: root });
execFileSync("npm", ["run", "build:shared"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [
  path.join(root, "node_modules/typescript/bin/tsc"),
  "-p",
  path.join(root, "packages/iroh-http-node/tsconfig.json"),
], { cwd: root, stdio: "inherit" });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const baselineSha256 =
  "9cf8d5f1a13a7c28e4103f06921badb00b11b76d9287a3b6ecc5f9523d9d2608";
assert.equal(
  sha256(fs.readFileSync(baseline)),
  baselineSha256,
  "reviewed baseline archive",
);
const nativeHashes = {
  "iroh-http-node.linux-x64-gnu.node":
    "3d6739abfd441834d4b58b07738280653c7f70eed3649f842d27a2cfce12c550",
  "iroh-http-node.win32-x64-msvc.node":
    "22c0dc33aae34fb06af65cd67de3e1f7342543178fb1150512874ec7b6500273",
};
const expectedFiles = [
  "README.md",
  "index.d.ts",
  "index.js",
  "lib.d.ts",
  "lib.js",
  "package.json",
  ...Object.keys(nativeHashes),
].sort();
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "iroh-node-js-overlay-"),
);
fs.mkdirSync(output, { recursive: true });
try {
  execFileSync("tar", ["-xzf", baseline, "-C", temporary]);
  const staged = path.join(temporary, "package");
  assert.deepEqual(
    fs.readdirSync(staged).sort(),
    expectedFiles,
    "baseline file allowlist",
  );
  for (const [name, hash] of Object.entries(nativeHashes)) {
    assert.equal(sha256(fs.readFileSync(path.join(staged, name))), hash, name);
  }
  const sourcePackage = path.join(root, "packages/iroh-http-node");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(sourcePackage, "package.json")),
  );
  // The bundle includes exactly the two qualified native targets; platform
  // registry packages cannot replace these source-bound binaries.
  delete manifest.optionalDependencies;
  manifest.files = ["*.js", "*.d.ts", "*.node"];
  fs.writeFileSync(
    path.join(staged, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  for (const name of ["lib.js", "lib.d.ts", "README.md"]) {
    fs.copyFileSync(path.join(sourcePackage, name), path.join(staged, name));
  }
  // Preserve the previously generated NAPI loader/declarations byte-for-byte.
  // Their Rust ABI and generated binding package version remain 0.6.2.
  const packed = JSON.parse(
    execFileSync("npm", [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      output,
    ], { cwd: staged, encoding: "utf8" }),
  )[0];
  const archivePath = path.join(output, packed.filename);
  const archive = fs.readFileSync(archivePath);
  const members = Object.fromEntries(
    expectedFiles.map((
      name,
    ) => [name, sha256(fs.readFileSync(path.join(staged, name)))]),
  );
  const packedMembers = execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
  }).trim().split("\n").sort();
  assert.deepEqual(
    packedMembers,
    expectedFiles.map((name) => `package/${name}`),
    "packed file allowlist",
  );
  for (const [name, hash] of Object.entries(members)) {
    const packedContent = execFileSync("tar", [
      "-xOzf",
      archivePath,
      `package/${name}`,
    ], { maxBuffer: 16 * 1024 * 1024 });
    assert.equal(sha256(packedContent), hash, `packed ${name}`);
  }
  const receipt = {
    schema: 1,
    package: manifest.name,
    version: manifest.version,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    nativeSourceCommit: "d799fa3f200b8ab862bad91ecd13a4389588111c",
    nativeSourceTreeUnchanged: true,
    baselineUrl:
      "https://github.com/arduano/iroh-http/releases/download/leo-v6-iroh-0.6.2-d799fa3/iroh-http-node-0.6.2-fork-linux-win-x64.tgz",
    baselineSha256,
    filename: packed.filename,
    archiveSha256: sha256(archive),
    integrity: "sha512-" +
      createHash("sha512").update(archive).digest("base64"),
    nativeBinaryReuse: "byte-for-byte; no Rust changes or rebuild",
    packedMembersVerified: true,
    members,
  };
  fs.writeFileSync(
    path.join(output, "BUILD-RECEIPT.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(output, "SHA256SUMS"),
    `${receipt.archiveSha256}  ${packed.filename}\n`,
  );
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
