import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { runBoundedTsc } from "./runBoundedTsc.mjs";

const runner = fileURLToPath(new URL("./tsc.mjs", import.meta.url));

test("preserves compiler arguments, bounded environment and successful exit", async () => {
  const messages = [];
  const code = await runBoundedTsc({
    command: process.execPath,
    args: [
      "-e",
      "if (process.argv[1] !== 'compiler-argument' || process.env.GOMEMLIMIT !== '32MiB' || process.env.GOMAXPROCS !== '2') process.exit(8)",
      "compiler-argument",
    ],
    maxRssMiB: 256,
    heapMiB: 32,
    log: (message) => messages.push(message),
  });
  assert.equal(code, 0);
  assert.match(messages.at(-1), /Peak sampled RSS/);
});

test("preserves compiler failure status", async () => {
  assert.equal(
    await runBoundedTsc({
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      maxRssMiB: 256,
      heapMiB: 32,
      log: () => {},
    }),
    7,
  );
});

test("stops its compiler when RSS exceeds the configured ceiling", async () => {
  const messages = [];
  const code = await runBoundedTsc({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    maxRssMiB: 2,
    heapMiB: 1,
    log: (message) => messages.push(message),
  });
  assert.equal(code, 137);
  assert.ok(messages.some((message) => message.includes("exceeded 2 MiB")));
});

test("rejects invalid or unsafe memory limits before starting a compiler", async () => {
  for (const maxRssMiB of [0, -1, NaN, 1.5, 2049]) {
    await assert.rejects(runBoundedTsc({ command: "never-start", args: [], maxRssMiB, heapMiB: 1 }), /RSS limit/);
  }
});

test(
  "forwards interruption and leaves no watch compiler running",
  { skip: process.platform === "win32", timeout: 5000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "aegis-tsc-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const compiler = join(directory, "node_modules", "typescript");
    await mkdir(join(compiler, "bin"), { recursive: true });
    await writeFile(join(compiler, "package.json"), JSON.stringify({ name: "typescript", type: "module" }));
    await writeFile(join(compiler, "bin", "tsc"), "console.log('READY ' + process.pid); setInterval(() => {}, 1000);");
    const child = spawn(process.execPath, [runner, "small", "--watch"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => child.kill("SIGKILL"));
    const exited = once(child, "exit");
    const compilerPid = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(/READY (\d+)/);
        if (match) {
          resolve(Number(match[1]));
        }
      });
    });
    child.kill("SIGTERM");
    const [code] = await exited;
    assert.equal(code, 143);
    assert.throws(() => process.kill(compilerPid, 0), { code: "ESRCH" });
  },
);

test(
  "kills a surviving descendant when the interrupted compiler parent exits",
  { skip: process.platform === "win32", timeout: 5000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "aegis-tsc-tree-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const compiler = join(directory, "node_modules", "typescript");
    await mkdir(join(compiler, "bin"), { recursive: true });
    await writeFile(join(compiler, "package.json"), JSON.stringify({ name: "typescript", type: "module" }));
    const descendant =
      "process.on('SIGTERM', () => {}); console.log('DESCENDANT ' + process.pid); setInterval(() => {}, 1000)";
    await writeFile(
      join(compiler, "bin", "tsc"),
      `import {spawn} from 'node:child_process'; spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'inherit'}); setInterval(() => {}, 1000);`,
    );
    const child = spawn(process.execPath, [runner, "small", "--watch"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => child.kill("SIGKILL"));
    const exited = once(child, "exit");
    const descendantPid = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(/DESCENDANT (\d+)/);
        if (match) {
          resolve(Number(match[1]));
        }
      });
    });
    t.after(() => {
      try {
        process.kill(descendantPid, "SIGKILL");
      } catch (error) {
        assert.equal(error.code, "ESRCH");
      }
    });
    child.kill("SIGTERM");
    assert.equal((await exited)[0], 143);
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      try {
        process.kill(descendantPid, 0);
      } catch (error) {
        assert.equal(error.code, "ESRCH");
        return;
      }
      await wait(10);
    }
    assert.fail("Interrupted compiler left a descendant running");
  },
);
