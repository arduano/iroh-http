import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { configureProcessSignalHandling, createNode } from "../../lib.js";

const policy = process.argv[2];
if (policy === "application") configureProcessSignalHandling("application");
const node = await createNode({ disableNetworking: true });
const keepAlive = setInterval(() => {}, 1_000);
let worker;
if (policy === "application") {
  worker = spawn(process.execPath, [
    "-e",
    `
    process.once('SIGTERM', () => setTimeout(() => process.exit(0), 150));
    setInterval(() => {}, 1000);
    process.stdout.write('ready\\n');
  `,
  ], { stdio: ["ignore", "pipe", "inherit"] });
  await once(worker.stdout, "data");
}

async function cleanup() {
  process.stdout.write("application-cleanup-start\n");
  await node.close();
  process.stdout.write("endpoint-close-finished\n");
  await delay(250);
  if (worker) {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    const [code, signal] = await exited;
    if (code !== 0 || signal !== null) throw new Error("worker cleanup failed");
    process.stdout.write("worker-exit-finished\n");
  }
  process.stdout.write("application-cleanup-finished\n");
  clearInterval(keepAlive);
  process.disconnect();
  process.exitCode = 23;
}
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
process.send({ ready: true, workerPid: worker?.pid });
