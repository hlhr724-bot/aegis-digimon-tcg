import { createWriteStream, mkdirSync, readdirSync, statSync, rmSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LOG_RETENTION_MS } from "#api/logRetentionMs";

const SEGMENT = /^api-\d{4}-\d{2}-\d{2}-.*\.jsonl$|^api\.log(?:\.\d+)?$/;

/**
 * Keeps 12 hours of logs, so they cannot fill the server's disk. A segment goes once its last
 * write is older than that; the segment being written is always newer, so it is never removed.
 */
export function pruneLogs(directory: string, now = Date.now()): void {
  for (const name of readdirSync(directory)) {
    if (!SEGMENT.test(name)) continue;
    const path = join(directory, name);
    if (statSync(path).mtimeMs <= now - LOG_RETENTION_MS) rmSync(path, { force: true });
  }
}

export class LocalLogWriter {
  private stream?: WriteStream;
  private date = "";
  private bytes = 0;
  private dropped = 0;
  private readonly pending = new Set<Promise<void>>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly directory: string,
    private readonly maxBytes = 64 * 1024 * 1024,
    private readonly maxBufferedBytes = 32 * 1024 * 1024,
  ) {
    mkdirSync(directory, { recursive: true });
    this.prune();
    this.timer = setInterval(() => this.prune(), 60_000);
    this.timer.unref();
  }

  private prune(): void {
    try {
      pruneLogs(this.directory);
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    process.stderr.write(`[logger] local log failure: ${String(error)}\n`);
  }

  private finish(): void {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream) return;
    const done = new Promise<void>((resolve) => {
      stream.once("close", resolve);
      stream.end();
    });
    this.pending.add(done);
    void done.then(() => this.pending.delete(done));
  }

  write(line: string): void {
    const date = new Date().toISOString().slice(0, 10);
    if (this.date !== date || this.bytes >= this.maxBytes) {
      this.finish();
      this.date = date;
      this.bytes = 0;
      this.prune();
    }
    if (!this.stream) {
      this.stream = createWriteStream(join(this.directory, `api-${date}-${randomUUID()}.jsonl`), { flags: "a" });
      this.stream.on("error", (error) => {
        this.report(error);
        if (this.stream?.destroyed) this.stream = undefined;
      });
    }
    if (this.stream.writableLength >= this.maxBufferedBytes) {
      this.dropped++;
      return;
    }
    if (this.dropped > 0) {
      this.report(`dropped ${this.dropped} lines while the disk was behind`);
      this.dropped = 0;
    }
    this.bytes += Buffer.byteLength(line);
    this.stream.write(line);
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    this.finish();
    await Promise.all(this.pending);
  }
}
