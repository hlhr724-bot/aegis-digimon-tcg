import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { runWithMemoryLimit } from "./typescript/runWithMemoryLimit.mjs";

test("preserves compiler success and diagnostic exit codes", async () => {
  for (const code of [0, 2]) {
    assert.equal(
      await runWithMemoryLimit({
        command: process.execPath,
        args: ["-e", `process.exit(${code})`],
        memoryLimitMiB: 128,
      }),
      code,
    );
  }
});

test(
  "stops an over-budget compiler and its child process with an explicit memory error",
  { timeout: 10000 },
  async () => {
    let message = "";
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        message += chunk.toString();
        callback();
      },
    });
    const allocation = "globalThis.memory = Buffer.alloc(96 * 1024 * 1024, 1); setInterval(() => {}, 1000)";
    const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(allocation)}], { stdio: 'ignore' }); setInterval(() => {}, 1000)`;
    const code = await runWithMemoryLimit({
      command: process.execPath,
      args: ["-e", parent],
      memoryLimitMiB: 64,
      stderr,
    });
    assert.equal(code, 137);
    assert.match(message, /RSS .* exceeded 64 MiB/);
  },
);
