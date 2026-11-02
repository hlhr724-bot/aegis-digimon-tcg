import type { ReplayAnnotationStore } from "#api/replays/annotations/ReplayAnnotationStore";
import type { LiveReplayAnnotationResult } from "@aegis/shared/replays/annotations/LiveReplayAnnotation";
import { LiveReplayAnnotationRejection } from "@aegis/shared/replays/annotations/LiveReplayAnnotationRejection";
import { parseLiveReplayAnnotationRequest } from "@aegis/shared/replays/annotations/parseLiveReplayAnnotationRequest";
import { LIVE_REPLAY_ANNOTATION_COOLDOWN_MS } from "@aegis/shared/replays/annotations/replayAnnotationLimits";

type LiveRecording = { id: string; frameCount: number; exceededLimit: boolean };

type Port = {
  store: Pick<ReplayAnnotationStore, "addMarker">;
  recording: () => LiveRecording | undefined;
  turn: () => number;
  now?: () => number;
};

type HandleParams = { authorId: string | undefined; payload: unknown };

function reject(reason: LiveReplayAnnotationRejection): LiveReplayAnnotationResult {
  return { kind: "rejected", reason };
}

export class LiveReplayAnnotator {
  private readonly lastAcceptedAt = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly port: Port) {
    this.now = port.now ?? Date.now;
  }

  async handle({ authorId, payload }: HandleParams): Promise<LiveReplayAnnotationResult> {
    const request = parseLiveReplayAnnotationRequest(payload);
    if (!request) {
      return reject(LiveReplayAnnotationRejection.INVALID.value);
    }
    if (!authorId) {
      return reject(LiveReplayAnnotationRejection.SIGN_IN_REQUIRED.value);
    }
    const recording = this.port.recording();
    if (!recording || recording.exceededLimit || recording.frameCount === 0) {
      return reject(LiveReplayAnnotationRejection.UNAVAILABLE.value);
    }
    const now = this.now();
    const last = this.lastAcceptedAt.get(authorId);
    if (last !== undefined && now - last < LIVE_REPLAY_ANNOTATION_COOLDOWN_MS) {
      return reject(LiveReplayAnnotationRejection.TOO_FAST.value);
    }
    this.lastAcceptedAt.set(authorId, now);
    const result = await this.port.store.addMarker({
      authorId,
      matchId: recording.id,
      frameIndex: recording.frameCount - 1,
      turn: this.port.turn(),
      emoji: request.emoji,
      now,
    });
    if (result.kind === "limit_reached") {
      return reject(LiveReplayAnnotationRejection.LIMIT_REACHED.value);
    }
    return { kind: "marker", marker: result.marker };
  }
}
