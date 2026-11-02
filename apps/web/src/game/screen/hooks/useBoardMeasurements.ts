import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { PlayerState } from "@aegis/shared";
import { permanentVisualElement } from "../dropZones";
import type { SpotlightSubject } from "../../spotlight";
import { measureFieldShatterFace, type FieldShatterFace } from "../../fieldShatter";

/** What the board's geometry gives the layers drawn over it. */
export type BoardMeasurements = {
  /** The prompt's candidate list, written during render and read by the mask's effect. */
  spotlightRequestRef: MutableRefObject<{ ids: readonly string[]; attacker?: string; security: boolean }>;
  spotlightSubjects: readonly SpotlightSubject[];
  boardSize: { width: number; height: number };
};

/**
 * Where every permanent sits, and the holes the targeting mask cuts over them.
 *
 * The positions are re-measured whenever the board's population changes, which is also the
 * commit that drops a deleted permanent: the survivors are re-measured and the deleted
 * permanent's last position stays behind for its burst.
 *
 * The mask is measured on every commit instead, because the prompt's candidate list is
 * written to `spotlightRequestRef` during render — it is derived far below, after the
 * connection gates. The state is replaced only when the geometry actually moved, so an
 * effect that runs on every commit still settles in one pass.
 */
export function useBoardMeasurements({
  viewer,
  opponent,
  boardRef,
  fieldRef,
  permRefs,
  permCentersRef,
  permFacesRef,
  permCardIdsRef,
  opponentSecurityRef,
}: {
  viewer: PlayerState | undefined;
  opponent: PlayerState | undefined;
  boardRef: RefObject<HTMLDivElement | null>;
  fieldRef: RefObject<HTMLDivElement | null>;
  permRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  /** Mutated: every permanent's centre, keyed by permanent id and by top instance id. */
  permCentersRef: MutableRefObject<Record<string, { x: number; y: number }>>;
  permFacesRef: MutableRefObject<Record<string, FieldShatterFace>>;
  /** Mutated: the card each of those two ids was showing. */
  permCardIdsRef: MutableRefObject<Record<string, string>>;
  opponentSecurityRef: RefObject<HTMLDivElement | null>;
}): BoardMeasurements {
  const [spotlightSubjects, setSpotlightSubjects] = useState<readonly SpotlightSubject[]>([]);
  const [boardSize, setBoardSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const battleAreaSignature = `${viewer?.battleArea.map((p) => p.permanentId).join(",") ?? ""}|${
    opponent?.battleArea.map((p) => p.permanentId).join(",") ?? ""
  }`;
  const permInstanceIds = new Map(
    [...(viewer?.battleArea ?? []), ...(opponent?.battleArea ?? [])].flatMap((perm) =>
      perm.topCard?.instanceId ? [[perm.permanentId, perm.topCard.instanceId] as const] : [],
    ),
  );
  const permCardIds = new Map(
    [...(viewer?.battleArea ?? []), ...(opponent?.battleArea ?? [])].flatMap((perm) =>
      perm.topCard?.cardId ? [[perm.permanentId, perm.topCard.cardId] as const] : [],
    ),
  );
  function measurePermanents() {
    const board = boardRef.current;
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    for (const [permanentId, element] of Object.entries(permRefs.current)) {
      if (!element?.isConnected) continue;
      const rect = permanentVisualElement(element).getBoundingClientRect();
      if (!rect.width) continue;
      const center = {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: rect.top + rect.height / 2 - boardRect.top,
      };
      permCentersRef.current[permanentId] = center;
      const face = measureFieldShatterFace(element, board);
      if (face) permFacesRef.current[permanentId] = face;
      // A deletion by an effect names the card instance rather than the permanent, so the top
      // card is remembered as a second way in to the same position.
      const topInstanceId = permInstanceIds.get(permanentId);
      if (topInstanceId) permCentersRef.current[topInstanceId] = center;
      if (topInstanceId && face) permFacesRef.current[topInstanceId] = face;
      const topCardId = permCardIds.get(permanentId);
      if (topCardId) {
        permCardIdsRef.current[permanentId] = topCardId;
        if (topInstanceId) permCardIdsRef.current[topInstanceId] = topCardId;
      }
    }
  }

  const spotlightRequestRef = useRef<{ ids: readonly string[]; attacker?: string; security: boolean }>({
    ids: [],
    security: false,
  });
  const spotlightAppliedRef = useRef("");
  function measureSpotlight() {
    const board = fieldRef.current;
    const { ids, attacker, security } = spotlightRequestRef.current;
    if (!board || (ids.length === 0 && !attacker && !security)) {
      if (spotlightAppliedRef.current !== "") {
        spotlightAppliedRef.current = "";
        setSpotlightSubjects([]);
      }
      return;
    }
    const boardRect = board.getBoundingClientRect();
    const next: SpotlightSubject[] = [];
    const subjects = [...ids.map((id) => ({ id, element: permRefs.current[id], ring: true }))];
    if (attacker) subjects.push({ id: attacker, element: permRefs.current[attacker], ring: false });
    if (security && opponentSecurityRef.current)
      subjects.push({ id: "security-opp", element: opponentSecurityRef.current, ring: true });
    for (const { id, element, ring } of subjects) {
      if (!element?.isConnected) continue;
      const rect = permanentVisualElement(element).getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      next.push({
        id,
        x: rect.left - boardRect.left,
        y: rect.top - boardRect.top,
        width: rect.width,
        height: rect.height,
        ring,
      });
    }
    const signature = `${Math.round(boardRect.width)}x${Math.round(boardRect.height)}|${next
      .map(
        (subject) =>
          `${subject.id}:${Math.round(subject.x)}:${Math.round(subject.y)}:${Math.round(subject.width)}:${Math.round(subject.height)}:${subject.ring === false ? 0 : 1}`,
      )
      .join(",")}`;
    if (signature === spotlightAppliedRef.current) return;
    spotlightAppliedRef.current = signature;
    setSpotlightSubjects(next);
    setBoardSize({ width: boardRect.width, height: boardRect.height });
  }
  const measureLatestRef = useRef<() => void>(() => undefined);
  measureLatestRef.current = () => {
    measurePermanents();
    measureSpotlight();
  };
  useEffect(() => {
    measureLatestRef.current();
  });
  useEffect(() => {
    let frame: number | undefined;
    function scheduleMeasurement() {
      if (frame !== undefined) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        measureLatestRef.current();
      });
    }
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(scheduleMeasurement);
    for (const element of [boardRef.current, fieldRef.current, ...Object.values(permRefs.current)]) {
      if (element) {
        observer?.observe(element);
      }
    }
    window.addEventListener("resize", scheduleMeasurement);
    document.addEventListener("scroll", scheduleMeasurement, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      document.removeEventListener("scroll", scheduleMeasurement, true);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [battleAreaSignature]);
  return { spotlightRequestRef, spotlightSubjects, boardSize };
}
