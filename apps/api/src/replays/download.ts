import type { ReplayViewerSeat } from "@aegis/shared/replays/ReplayViewerSeat";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { ReplayDownloadMessage } from "@aegis/shared";
import type { ParticipantReplayFile } from "./recording.js";

const compress = promisify(gzip);

export async function replayDownload(
  file: ParticipantReplayFile,
  seat: ReplayViewerSeat,
): Promise<ReplayDownloadMessage> {
  return {
    kind: "ready",
    summary: file.summary,
    viewerSeat: seat,
    data: (await compress(file.json)).toString("base64"),
  };
}
