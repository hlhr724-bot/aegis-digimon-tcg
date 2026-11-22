import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { serializeLog } from "./logger.js";

it("serializes circular debug data and bigint without interrupting the game", () => {
  const value: { self?: unknown; amount: bigint } = { amount: 4n };
  value.self = value;
  expect(JSON.parse(serializeLog(value))).toEqual({ amount: "4", self: "[Circular]" });
});

it.each([false, true])("controls INFO output and disk logging when silence is %s", (silence) => {
  const temp = mkdtempSync(join(tmpdir(), "aegis-logger-"));
  const logDirectory = join(temp, "logs");
  try {
    const child = spawnSync(
      process.execPath,
      [
        "--conditions=development",
        "--import=./test-support/ts-loader.mjs",
        "--input-type=module",
        "--eval",
        `import { flushLogs, log, logError } from "#api/logger";
         log("info event");
         logError("error event");
         await flushLogs();`,
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "development",
          VITEST: undefined,
          AEGIS_LOG_DIR: logDirectory,
          AEGIS_SILENCE_INFO_LOGS: silence ? "1" : "0",
          RESEND_API_KEY: "",
        },
        timeout: 5_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stderr)).toMatchObject({ level: "ERROR", data: ["error event"] });
    const info = child.stdout === "" ? undefined : JSON.parse(child.stdout);
    expect(info?.level).toBe(silence ? undefined : "INFO");
    expect(info?.data).toEqual(silence ? undefined : ["info event"]);

    const logsExist = existsSync(logDirectory);
    const files = logsExist ? readdirSync(logDirectory).filter((name) => name.endsWith(".jsonl")) : [];
    expect(logsExist).toBe(!silence);
    expect(files.map((file) => readFileSync(join(logDirectory, file), "utf8"))).toEqual(
      silence ? [] : [child.stdout + child.stderr],
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
