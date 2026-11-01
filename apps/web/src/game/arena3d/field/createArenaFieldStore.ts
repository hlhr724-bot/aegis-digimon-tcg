import type { ArenaZone } from "@/game/arena3d/ArenaZone";
import type { ArenaCameraFrame } from "@/game/arena3d/field/ArenaCameraFrame";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import { Side } from "@/game/side";

export type ArenaZoneSlot = {
  key: string;
  side: Side;
  zone: ArenaZone;
  x: number;
  z: number;
  width: number;
};

export type ArenaFieldSnapshot = {
  frame: ArenaCameraFrame | undefined;
  rows: Readonly<Record<Side, readonly ArenaRowSlot[]>>;
  zones: ReadonlyMap<string, ArenaZoneSlot>;
};

export type ArenaOverlayShift = {
  x: number;
  y: number;
};

export type ArenaFieldStore = {
  get: () => ArenaFieldSnapshot;
  subscribe: (listener: () => void) => () => void;
  setFrame: (frame: ArenaCameraFrame, zones: ReadonlyMap<string, ArenaZoneSlot>) => void;
  setRow: (side: Side, slots: readonly ArenaRowSlot[]) => void;
  attachOverlay: (element: HTMLElement | null) => void;
  shiftOverlay: (x: number, y: number) => void;
  getOverlayShift: () => Readonly<ArenaOverlayShift>;
};

const SHIFT_EPSILON = 0.05;

function describeRow(slots: readonly ArenaRowSlot[]): string {
  return slots
    .map((slot) =>
      [
        slot.fieldKey,
        slot.permanent.permanentId,
        slot.x.toFixed(3),
        slot.z.toFixed(3),
        slot.width.toFixed(3),
        slot.suspended,
        slot.sourceCount,
        slot.linkCount,
      ].join(":"),
    )
    .join("|");
}

export function createArenaFieldStore(): ArenaFieldStore {
  const listeners = new Set<() => void>();
  const rowSignatures: Record<Side, string> = { [Side.Viewer]: "", [Side.Opponent]: "" };
  const shift: ArenaOverlayShift = { x: 0, y: 0 };
  let overlay: HTMLElement | null = null;
  let snapshot: ArenaFieldSnapshot = {
    frame: undefined,
    rows: { [Side.Viewer]: [], [Side.Opponent]: [] },
    zones: new Map(),
  };

  function applyShift() {
    if (overlay) {
      overlay.style.translate = shift.x === 0 && shift.y === 0 ? "" : `${shift.x.toFixed(2)}px ${shift.y.toFixed(2)}px`;
    }
  }

  function publish(next: ArenaFieldSnapshot) {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setFrame(frame, zones) {
      publish({ ...snapshot, frame, zones });
    },
    setRow(side, slots) {
      const signature = describeRow(slots);
      if (signature === rowSignatures[side]) {
        return;
      }
      rowSignatures[side] = signature;
      publish({ ...snapshot, rows: { ...snapshot.rows, [side]: slots } });
    },
    attachOverlay(element) {
      if (overlay && overlay !== element) {
        overlay.style.translate = "";
      }
      overlay = element;
      applyShift();
    },
    shiftOverlay(x, y) {
      if (Math.abs(x - shift.x) < SHIFT_EPSILON && Math.abs(y - shift.y) < SHIFT_EPSILON) {
        return;
      }
      shift.x = Math.abs(x) < SHIFT_EPSILON ? 0 : x;
      shift.y = Math.abs(y) < SHIFT_EPSILON ? 0 : y;
      applyShift();
    },
    getOverlayShift: () => shift,
  };
}
