import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/translator";
import { pendingMatchNotice } from "@/game/screen/model/pendingMatchNotice";

type Params = Partial<Parameters<typeof pendingMatchNotice>[0]>;

function getNotice(params: Params) {
  return pendingMatchNotice({
    status: "error",
    botError: undefined,
    error: undefined,
    vsBot: false,
    startMode: "casual",
    hostRoomCode: undefined,
    joinOptions: { displayName: "Tamer" },
    t: translator("en"),
    ...params,
  });
}

describe("connection notices", () => {
  it("explains an oversized selection while preserving automatic recovery", () => {
    expect(getNotice({ status: "reconnecting", error: "AEGIS_MESSAGE_TOO_LARGE" })).toMatchObject({
      title: "Reconnecting…",
      detail: "Your selection was too large to send. Reconnecting to restore the pending choice.",
      spinner: true,
    });
  });

  it("offers leaving after reconnection fails instead of showing the matchmaking spinner", () => {
    expect(getNotice({ status: "closed", error: "AEGIS_RECONNECT_FAILED" })).toMatchObject({
      detail: "We could not resume this match. Return to the lobby and try again.",
      spinner: false,
      exitTo: "lobby",
    });
  });

  it("does not infer a server outage from an abnormal closure", () => {
    expect(getNotice({ error: "AEGIS_CONNECTION_LOST" }).detail).toBe(
      "The connection to your match was interrupted. Please try reconnecting.",
    );
  });
});

describe("matchmaking cancellation", () => {
  it.each(["casual", "ranked", "unlimited", "beta"] as const)(
    "offers cancelling the %s queue without a loss",
    (startMode) => {
      expect(getNotice({ status: "connected", startMode })).toMatchObject({
        spinner: true,
        actionLabel: "Cancel search",
        exitTo: "lobby",
      });
    },
  );

  it("explains cancellation before an opponent joins", () => {
    expect(getNotice({ status: "connecting" }).detail).toContain(
      "Cancelling before an opponent joins does not count as a loss.",
    );
  });

  it("does not offer queue cancellation while reconnecting to a match", () => {
    expect(getNotice({ status: "reconnecting" }).actionLabel).toBeUndefined();
  });

  it.each(["bot", "private_host", "private_guest", "spectator"] as const)(
    "does not label %s as public matchmaking",
    (startMode) => {
      expect(getNotice({ status: "connected", startMode, vsBot: startMode === "bot" }).actionLabel).toBeUndefined();
    },
  );
});

it("does not offer cancelling a search once both players are seated", () => {
  expect(getNotice({ status: "connected", hasOpponent: true }).actionLabel).toBeUndefined();
});

describe("spectator notice", () => {
  it("tells a spectator they are watching instead of queued", () => {
    const notice = getNotice({ status: "connecting", startMode: "spectator", spectating: true });
    expect(notice).toMatchObject({ title: "Joining as a spectator…", spinner: true });
    expect(notice.detail).toContain("You are not in the queue");
    expect(notice.actionLabel).toBeUndefined();
  });
});

describe("private room guest approval notice", () => {
  it("asks the host to review the guest by name", () => {
    const guest = { sessionId: "guest", displayName: "Challenger", avatarId: "", connected: true };
    const notice = getNotice({
      status: "connected",
      startMode: "private_host",
      guestApproval: { kind: "hostReview", guest },
    });
    expect(notice).toMatchObject({ title: "Join request", spinner: false });
    expect(notice.roomCode).toBeUndefined();
  });

  it("tells a pending guest that the host must accept them", () => {
    expect(
      getNotice({ status: "connected", startMode: "private_guest", guestApproval: { kind: "guestWaiting" } }),
    ).toMatchObject({
      title: "Waiting for the host",
      detail: "The host must accept you before the match starts.",
      spinner: true,
    });
  });

  it("keeps sharing the code while the host waits for the next guest", () => {
    expect(
      getNotice({
        status: "connected",
        startMode: "casual",
        hostRoomCode: "ABC234",
        guestApproval: { kind: "hostWaiting" },
      }),
    ).toMatchObject({ title: "Waiting for opponent…", roomCode: "ABC234" });
  });

  it("explains a declined request", () => {
    expect(getNotice({ status: "closed", error: "AEGIS_GUEST_DECLINED" })).toMatchObject({
      title: "Request declined",
      detail: "The host declined your request to join this room.",
      exitTo: "lobby",
    });
  });

  it("explains a room the host closed before the match started", () => {
    expect(getNotice({ status: "closed", error: "AEGIS_HOST_LEFT" })).toMatchObject({
      title: "Room closed",
      detail: "The host left the room before the match started.",
    });
  });
});

describe("queue activity on the waiting screen", () => {
  it.each(["casual", "ranked", "unlimited", "beta"] as const)("marks the %s wait as a queue search", (startMode) => {
    expect(getNotice({ status: "connected", startMode }).searchingQueue).toBe(true);
  });

  it("does not mark private, bot, tournament, seated or failed waits as queue searches", () => {
    expect(getNotice({ status: "connected", startMode: "private_host" }).searchingQueue).toBeFalsy();
    expect(getNotice({ status: "connected", startMode: "bot", vsBot: true }).searchingQueue).toBeFalsy();
    expect(
      getNotice({ status: "connected", joinOptions: { displayName: "Tamer", tournamentGameId: "game" } })
        .searchingQueue,
    ).toBeFalsy();
    expect(getNotice({ status: "connected", hasOpponent: true }).searchingQueue).toBeFalsy();
    expect(getNotice({ status: "error" }).searchingQueue).toBeFalsy();
  });
});
