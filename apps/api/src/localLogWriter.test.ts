import { mkdtempSync, utimesSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { LocalLogWriter, pruneLogs } from "./localLogWriter.js";

describe("local application logs", () => {
  it("removes segments last written more than 12 hours ago while preserving unrelated files", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-logs-"));
    const now = Date.parse("2026-09-12T12:00:00Z");
    const lastWritten = {
      "api-2026-09-11-stale.jsonl": "2026-09-11T23:59:00Z",
      "api-2026-09-12-stale.jsonl": "2026-09-11T23:59:00Z",
      "api-2026-09-11-kept.jsonl": "2026-09-12T00:01:00Z",
      "api-2026-09-12-current.jsonl": "2026-09-12T11:59:00Z",
      "api.log.1": "2026-09-11T20:00:00Z",
      "notes.txt": "2026-09-01T00:00:00Z",
    };
    try {
      for (const [name, at] of Object.entries(lastWritten)) {
        writeFileSync(join(dir, name), "data");
        utimesSync(join(dir, name), new Date(at), new Date(at));
      }
      pruneLogs(dir, now);
      expect(readdirSync(dir).sort()).toEqual([
        "api-2026-09-11-kept.jsonl",
        "api-2026-09-12-current.jsonl",
        "notes.txt",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flushes every queued line across size rotations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-logs-"));
    try {
      const writer = new LocalLogWriter(dir, 20);
      const lines = Array.from({ length: 100 }, (_, i) => JSON.stringify({ index: i }) + "\n");
      for (const line of lines) writer.write(line);
      await writer.close();
      const actual = readdirSync(dir)
        .flatMap((name) =>
          readFileSync(join(dir, name), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line).index),
        )
        .sort((a, b) => a - b);
      expect(actual).toEqual(Array.from({ length: 100 }, (_, i) => i));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops lines instead of buffering them without bound while the disk is behind", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-logs-"));
    try {
      const writer = new LocalLogWriter(dir, 64 * 1024 * 1024, 1024);
      const lines = Array.from({ length: 1000 }, (_, i) => JSON.stringify({ index: i }) + "\n");
      for (const line of lines) writer.write(line);
      await writer.close();
      const written = readdirSync(dir).flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n"));
      expect(written.length).toBeGreaterThan(0);
      expect(written.length).toBeLessThan(lines.length);
      expect(written.map((line) => JSON.parse(line).index)).toEqual(
        Array.from({ length: written.length }, (_, i) => i),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
