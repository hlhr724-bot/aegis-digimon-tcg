import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import { MAX_REPLAY_BYTES, REPLAY_FORMAT_VERSION, type MatchReplay, type ReplayDownloadMessage } from "@aegis/shared";
import { validateReplay } from "./validation";

export type ReadyReplay = Extract<ReplayDownloadMessage, { kind: "ready" }>;
export type ReplayFileErrorCode = "invalid" | "version" | "size";
export class ReplayFileError extends Error {
  readonly code: ReplayFileErrorCode;
  constructor(code: ReplayFileErrorCode) {
    super(code);
    this.code = code;
  }
}

export function replayBlob(message: ReadyReplay): Blob {
  const binary = atob(message.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "application/gzip" });
}

export function replayFileName(message: ReadyReplay): string {
  if (message.viewerSeat === SPECTATOR_REPLAY_SEAT) {
    return `aegis-${message.summary.id}-spectator.aegis-replay`;
  }
  return `aegis-${message.summary.id}-player-${message.viewerSeat + 1}.aegis-replay`;
}

export function downloadReplay(message: ReadyReplay): void {
  const url = URL.createObjectURL(replayBlob(message));
  const link = document.createElement("a");
  link.href = url;
  link.download = replayFileName(message);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads JSON or gzip JSON locally, with a limit on expanded bytes as well as file size. */
export async function readReplay(file: Blob): Promise<MatchReplay> {
  if (file.size === 0 || file.size > MAX_REPLAY_BYTES) throw new ReplayFileError("size");
  let text: string;
  try {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const stream =
      head[0] === 0x1f && head[1] === 0x8b ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let length = 0;
    const parts: string[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_REPLAY_BYTES) throw new ReplayFileError("size");
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    text = parts.join("");
  } catch (error) {
    if (error instanceof ReplayFileError) throw error;
    throw new ReplayFileError("invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ReplayFileError("invalid");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === "aegis-replay" &&
    "version" in value &&
    value.version !== REPLAY_FORMAT_VERSION
  )
    throw new ReplayFileError("version");
  if (!validateReplay(value)) throw new ReplayFileError("invalid");
  return value;
}
