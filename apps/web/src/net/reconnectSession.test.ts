// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearReconnectSession,
  isReconnectSessionFresh,
  loadReconnectSession,
  RECONNECT_SESSION_MAX_AGE_MS,
  saveReconnectSession,
  type ReconnectSession,
} from "./reconnectSession";

const session: ReconnectSession = {
  reconnectionToken: "room-1:token",
  roomId: "room-1",
  slot: "legacy",
  savedAt: 1_000,
};

describe("reconnect session storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("keeps a reload token whose heartbeat froze while the tab sat in the background", () => {
    saveReconnectSession(session);
    expect(loadReconnectSession(session.savedAt + 10 * 60_000)).toEqual(session);
  });

  it("expires a reload token only once no match could still hold its seat", () => {
    saveReconnectSession(session);
    expect(loadReconnectSession(session.savedAt + RECONNECT_SESSION_MAX_AGE_MS - 1)).toEqual(session);
    expect(loadReconnectSession(session.savedAt + RECONNECT_SESSION_MAX_AGE_MS)).toBeUndefined();
  });

  it("round-trips a saved session within the server grace window", () => {
    saveReconnectSession(session);
    expect(loadReconnectSession(session.savedAt + 1_000)).toEqual(session);
  });

  it("strips obsolete handoff identity and credentials while preserving the persisted seat", () => {
    sessionStorage.setItem(
      "aegis:matchSession",
      JSON.stringify({
        ...session,
        logicalSession: { gameId: "logical-game-1", ownerEpoch: 3 },
        resumeCredential: "obsolete-resume-credential",
        resumeCredentialExpiresAt: 2_000,
      }),
    );

    expect(loadReconnectSession(1_500)).toEqual(session);
    expect(JSON.parse(sessionStorage.getItem("aegis:matchSession") ?? "{}")).toEqual(session);
  });

  it("keeps the match out of localStorage so other tabs never resume it", () => {
    saveReconnectSession(session);
    expect(localStorage.getItem("aegis:matchSession")).toBeNull();
  });

  it("drops a session older than the maximum age", () => {
    saveReconnectSession(session);
    expect(loadReconnectSession(session.savedAt + RECONNECT_SESSION_MAX_AGE_MS)).toBeUndefined();
    expect(sessionStorage.getItem("aegis:matchSession")).toBeNull();
  });

  it("drops malformed storage instead of resuming from it", () => {
    sessionStorage.setItem("aegis:matchSession", "{not json");
    expect(loadReconnectSession()).toBeUndefined();

    sessionStorage.setItem("aegis:matchSession", JSON.stringify({ roomId: "room-1" }));
    expect(loadReconnectSession()).toBeUndefined();
  });

  it("clears on request", () => {
    saveReconnectSession(session);
    clearReconnectSession();
    expect(loadReconnectSession(session.savedAt)).toBeUndefined();
  });

  it("treats a clock that moved backwards as stale", () => {
    expect(isReconnectSessionFresh(session, session.savedAt - 1)).toBe(false);
  });
});

it("preserves the spectator role across a page reload", () => {
  saveReconnectSession({ ...session, spectator: true });
  expect(loadReconnectSession(session.savedAt + 1000)).toEqual({ ...session, spectator: true });
});
