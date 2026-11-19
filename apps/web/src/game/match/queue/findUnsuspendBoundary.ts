import type { ServerEvent } from "@aegis/shared";

export type UnsuspendBoundary = ServerEvent | "pending" | "skipped";

function isUnsuspendMove(event: ServerEvent): boolean {
  return event.kind === "cardsMoved" && event.from === "suspended" && event.to === "unsuspended";
}

export function findUnsuspendBoundary({
  activePhase,
  eventTimeline,
}: {
  activePhase: ServerEvent;
  eventTimeline: readonly ServerEvent[];
}): UnsuspendBoundary {
  const afterActive = eventTimeline.slice(eventTimeline.indexOf(activePhase) + 1);
  const boundary = afterActive.find(
    (event) => isUnsuspendMove(event) || event.kind === "phaseChanged" || event.kind === "turnEnded",
  );
  if (!boundary) return "pending";
  return boundary.kind === "turnEnded" ? "skipped" : boundary;
}
