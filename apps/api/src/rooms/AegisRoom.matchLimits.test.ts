import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { MATCH_EXPIRED_CLOSE_CODE } from "@aegis/shared";
import { canCreateRoom, setRoomCreationAdmission } from "../deployment/admission.js";
import { AegisRoom, DRAINING_MATCH_LIMIT_MS, FINISHED_MATCH_LIMIT_MS, MATCH_INACTIVITY_LIMIT_MS } from "./AegisRoom.js";

const START = 1_000_000;

type RoomInternals = {
  matchStartRequested: boolean;
  lastPlayerActionAt: number | undefined;
  seatByClient: Map<string, number>;
  enforceMatchLimits: () => void;
  concede: (seat: number) => void;
};

function makeRoom() {
  const room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.onCreate({ seed: 1 });
  const internals = room as unknown as RoomInternals;
  internals.matchStartRequested = true;
  const concede = vi.spyOn(internals, "concede").mockImplementation(() => {});
  const disconnect = vi.spyOn(room, "disconnect").mockResolvedValue(undefined);
  return { room, internals, concede, disconnect };
}

function seatPlayer(room: AegisRoom, internals: RoomInternals, seat: number): void {
  const client = { sessionId: `session-${seat}`, send: vi.fn<() => void>() } as unknown as Client;
  room.clients.push(client);
  internals.seatByClient.set(client.sessionId, seat);
}

describe("AegisRoom match limits", () => {
  afterEach(() => {
    setRoomCreationAdmission(() => true);
    vi.restoreAllMocks();
  });

  it("keeps a match whose players acted within the inactivity limit", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      internals.enforceMatchLimits();
      now.mockReturnValue(START + MATCH_INACTIVITY_LIMIT_MS - 1);
      internals.enforceMatchLimits();
      expect(concede).not.toHaveBeenCalled();
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      room.onDispose();
    }
  });

  it("concedes for the player the game is waiting on once the inactivity limit passes", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      seatPlayer(room, internals, 1);
      room.state.turnSeat = 1;
      internals.lastPlayerActionAt = START;
      vi.spyOn(Date, "now").mockReturnValue(START + MATCH_INACTIVITY_LIMIT_MS);
      internals.enforceMatchLimits();
      expect(concede).toHaveBeenCalledWith(1);
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      room.onDispose();
    }
  });

  it("closes an inactive match without a result when no player is connected", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      internals.lastPlayerActionAt = START;
      vi.spyOn(Date, "now").mockReturnValue(START + MATCH_INACTIVITY_LIMIT_MS);
      internals.enforceMatchLimits();
      expect(concede).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(MATCH_EXPIRED_CLOSE_CODE);
    } finally {
      room.onDispose();
    }
  });

  it("closes an active match without a result once the deployment has drained for the limit", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      setRoomCreationAdmission(() => false);
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      internals.enforceMatchLimits();
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS - 1);
      internals.lastPlayerActionAt = START + DRAINING_MATCH_LIMIT_MS - 1;
      internals.enforceMatchLimits();
      expect(disconnect).not.toHaveBeenCalled();
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS);
      internals.lastPlayerActionAt = START + DRAINING_MATCH_LIMIT_MS;
      internals.enforceMatchLimits();
      expect(concede).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(MATCH_EXPIRED_CLOSE_CODE);
    } finally {
      room.onDispose();
    }
  });

  it("restarts the drain deadline when the deployment accepts rooms again", () => {
    const { room, internals, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      setRoomCreationAdmission(() => false);
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      internals.enforceMatchLimits();
      setRoomCreationAdmission(() => true);
      now.mockReturnValue(START + 1);
      internals.lastPlayerActionAt = START + 1;
      internals.enforceMatchLimits();
      setRoomCreationAdmission(() => false);
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS);
      internals.lastPlayerActionAt = START + DRAINING_MATCH_LIMIT_MS;
      internals.enforceMatchLimits();
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      room.onDispose();
    }
  });

  it("closes a room opened during the drain at the slot's deadline, not one of its own", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      setRoomCreationAdmission(() => false);
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      canCreateRoom();
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS - 1);
      internals.lastPlayerActionAt = START + DRAINING_MATCH_LIMIT_MS - 1;
      internals.enforceMatchLimits();
      expect(disconnect).not.toHaveBeenCalled();
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS);
      internals.lastPlayerActionAt = START + DRAINING_MATCH_LIMIT_MS;
      internals.enforceMatchLimits();
      expect(concede).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(MATCH_EXPIRED_CLOSE_CODE);
    } finally {
      room.onDispose();
    }
  });

  it("keeps a finished match open for the results screen, then closes it", () => {
    const { room, internals, concede, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      room.state.gameOver = true;
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      internals.enforceMatchLimits();
      now.mockReturnValue(START + FINISHED_MATCH_LIMIT_MS - 1);
      internals.enforceMatchLimits();
      expect(disconnect).not.toHaveBeenCalled();
      now.mockReturnValue(START + FINISHED_MATCH_LIMIT_MS);
      internals.enforceMatchLimits();
      expect(concede).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(MATCH_EXPIRED_CLOSE_CODE);
    } finally {
      room.onDispose();
    }
  });

  it("closes a finished match once the deployment has drained for the limit", () => {
    const { room, internals, disconnect } = makeRoom();
    try {
      seatPlayer(room, internals, 0);
      setRoomCreationAdmission(() => false);
      const now = vi.spyOn(Date, "now").mockReturnValue(START);
      internals.enforceMatchLimits();
      room.state.gameOver = true;
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS - FINISHED_MATCH_LIMIT_MS / 2);
      internals.enforceMatchLimits();
      expect(disconnect).not.toHaveBeenCalled();
      now.mockReturnValue(START + DRAINING_MATCH_LIMIT_MS);
      internals.enforceMatchLimits();
      expect(disconnect).toHaveBeenCalledWith(MATCH_EXPIRED_CLOSE_CODE);
    } finally {
      room.onDispose();
    }
  });
});
