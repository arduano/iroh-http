import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configureProcessSignalHandling, createNode } from "../lib.js";

test("signal policy preserves unrelated listeners and guards node lifetimes", async () => {
  const unrelated = () => {};
  process.once("SIGTERM", unrelated);
  process.once("SIGINT", unrelated);
  const originalTerm = process.listeners("SIGTERM");
  const originalInt = process.listeners("SIGINT");
  try {
    assert.throws(() => configureProcessSignalHandling("invalid"), TypeError);
    configureProcessSignalHandling("application");
    assert.deepEqual(process.listeners("SIGTERM"), [unrelated]);
    assert.deepEqual(process.listeners("SIGINT"), [unrelated]);
    configureProcessSignalHandling("application");
    assert.deepEqual(process.listeners("SIGTERM"), [unrelated]);

    await assert.rejects(() => createNode({ bindAddr: "invalid-address" }));
    configureProcessSignalHandling("standalone");
    configureProcessSignalHandling("application");

    const pending = createNode({ disableNetworking: true });
    assert.throws(
      () => configureProcessSignalHandling("standalone"),
      /before creating nodes/,
    );
    const node = await pending;
    try {
      configureProcessSignalHandling("application");
      assert.throws(
        () => configureProcessSignalHandling("standalone"),
        /before creating nodes/,
      );
    } finally {
      const closing = node.close();
      assert.throws(
        () => configureProcessSignalHandling("standalone"),
        /before creating nodes/,
      );
      await closing;
    }
    configureProcessSignalHandling("standalone");
    assert.equal(process.listenerCount("SIGTERM"), originalTerm.length);
    assert.equal(process.listenerCount("SIGINT"), originalInt.length);
    assert.ok(process.listeners("SIGTERM").includes(unrelated));
    assert.ok(process.listeners("SIGINT").includes(unrelated));
    configureProcessSignalHandling("standalone");
    assert.equal(process.listenerCount("SIGTERM"), originalTerm.length);
  } finally {
    process.removeListener("SIGTERM", unrelated);
    process.removeListener("SIGINT", unrelated);
    configureProcessSignalHandling("standalone");
  }
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  for (const policy of ["application", "standalone"]) {
    test(`${policy} signal ownership handles ${signal}`, {
      timeout: 10_000,
      skip: process.platform === "win32" ? "POSIX signal delivery" : false,
    }, async (t) => {
      const fixture = fileURLToPath(
        new URL("./fixtures/process-signals.mjs", import.meta.url),
      );
      const child = spawn(process.execPath, [fixture, policy], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      let stdout = "";
      let stderr = "";
      let workerPid;
      child.stdout.on("data", (chunk) => stdout += chunk);
      child.stderr.on("data", (chunk) => stderr += chunk);
      const exited = once(child, "exit");
      t.after(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        if (workerPid) {
          try {
            process.kill(workerPid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
      });
      const [message] = await once(child, "message");
      assert.equal(message.ready, true);
      workerPid = message.workerPid;
      child.kill(signal);
      const [code, exitSignal] = await exited;
      assert.equal(exitSignal, null, stderr);
      if (policy === "application") {
        assert.equal(code, 23, stderr);
        assert.match(
          stdout,
          /endpoint-close-finished\nworker-exit-finished\napplication-cleanup-finished/,
        );
        assert.throws(() => process.kill(workerPid, 0), { code: "ESRCH" });
      } else {
        assert.equal(code, 0, stderr);
        assert.match(stdout, /application-cleanup-start/);
        assert.doesNotMatch(stdout, /application-cleanup-finished/);
      }
    });
  }
}
