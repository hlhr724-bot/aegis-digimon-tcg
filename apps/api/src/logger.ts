import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createErrorAlerts, resendDelivery } from "./errorAlerts.js";
import { LocalLogWriter } from "./localLogWriter.js";
import { MatchReplayLogWriter } from "#api/replays/inputs/MatchReplayLogWriter";
import { REPLAY_LINE_NAMES } from "#api/replays/inputs/replayLineNames";

const UNDER_TEST = process.env.VITEST !== undefined || process.env.NODE_ENV === "test";
const INFO_TO_STDOUT = process.env.NODE_ENV !== "production";
export const logDirectory = process.env.AEGIS_LOG_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "logs");
const configuredMaxBytes = Number(process.env.AEGIS_LOG_MAX_BYTES);
export const logMaxBytes =
  Number.isSafeInteger(configuredMaxBytes) && configuredMaxBytes > 0 ? configuredMaxBytes : 64 * 1024 * 1024;
const context = new AsyncLocalStorage<{ matchId: string; roomId: string }>();
const writer = UNDER_TEST ? undefined : new LocalLogWriter(logDirectory, logMaxBytes);
const matchReplayWriter = UNDER_TEST ? undefined : new MatchReplayLogWriter(logDirectory);

function configureErrorAlerts() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AEGIS_EMAIL_FROM;
  const to = process.env.AEGIS_ALERT_EMAIL;
  if (UNDER_TEST || !apiKey || !from || !to) return undefined;
  return createErrorAlerts({ deliver: resendDelivery(apiKey, from, to) });
}
const errorAlerts = configureErrorAlerts();

export function withMatchLog<T>(matchId: string, roomId: string, action: () => T): T {
  return context.run({ matchId, roomId }, action);
}

export function serializeLog(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return String(item);
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
  } catch (error) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      ...context.getStore(),
      level: "ERROR",
      data: ["Log serialization failed", String(error)],
    });
  }
}

/** In-process observers of every log line, e.g. a test reading what a room recorded. */
const sinks = new Set<(line: string) => void>();

/**
 * Observe every log line this process writes, as the exact JSON text the log files receive
 * (without the trailing newline). Under test, INFO lines are still produced for sinks even
 * though nothing is written to stdout or disk. Returns the function that stops observing.
 */
export function addLogSink(sink: (line: string) => void): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

const matchReplaySinks = new Set<(matchId: string, line: string) => void>();
if (matchReplayWriter) matchReplaySinks.add(matchReplayWriter.write);

export function addMatchReplayLogSink(sink: (matchId: string, line: string) => void): () => void {
  matchReplaySinks.add(sink);
  return () => matchReplaySinks.delete(sink);
}

function write(level: "INFO" | "ERROR", ...args: unknown[]): void {
  const store = context.getStore();
  const replayMatchId =
    store && matchReplaySinks.size > 0 && typeof args[0] === "string" && REPLAY_LINE_NAMES.has(args[0])
      ? store.matchId
      : undefined;
  const silenced = UNDER_TEST && level !== "ERROR";
  if (silenced && sinks.size === 0 && replayMatchId === undefined) return;
  const record = serializeLog({
    timestamp: new Date().toISOString(),
    level,
    ...store,
    data: args.map((value) => (value instanceof Error ? { message: value.message, stack: value.stack } : value)),
  });
  for (const sink of sinks) sink(record);
  const line = record + "\n";
  if (replayMatchId !== undefined) for (const sink of matchReplaySinks) sink(replayMatchId, line);
  if (silenced) return;
  if (level === "ERROR") process.stderr.write(line);
  else if (INFO_TO_STDOUT) process.stdout.write(line);
  writer?.write(line);
  if (level === "ERROR") errorAlerts?.report(args, line);
}

export const log = (...args: unknown[]) => write("INFO", ...args);
export const logError = (...args: unknown[]) => write("ERROR", ...args);
export const flushLogs = async (): Promise<void> => {
  await errorAlerts?.flush();
  await writer?.close();
  await matchReplayWriter?.close();
};
