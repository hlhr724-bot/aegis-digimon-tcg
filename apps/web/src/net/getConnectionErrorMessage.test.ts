import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/translator";
import { getConnectionErrorMessage } from "@/net/getConnectionErrorMessage";

describe("connection error messages", () => {
  const t = translator("en");

  it.each([
    ["AEGIS_MESSAGE_TOO_LARGE", "Your selection was too large to send. Try resolving fewer effects at a time."],
    ["AEGIS_CONNECTION_LOST", "The connection to your match was interrupted. Please try reconnecting."],
    ["AEGIS_RECONNECT_FAILED", "We could not resume this match. Return to the lobby and try again."],
    ["AEGIS_SESSION_EXPIRED", "This match can no longer be resumed. Return to the lobby."],
    ["AEGIS_ROOM_FULL", "This match is already full or has started. Return to the lobby and search again."],
    [
      "AEGIS_NAME_TAKEN",
      "A player with your name is already in this match. Close other Aegis tabs or change your name, then try again.",
    ],
    ["AEGIS_ROOM_SETTINGS_MISMATCH", "This room uses different match settings. Return to the lobby and search again."],
    ["AEGIS_ROOM_CODE_INVALID", "This room code is wrong or has expired. Check the code and try again."],
    ["AEGIS_ACCOUNT_REQUIRED", "Sign in to join this match."],
    [
      "AEGIS_ALREADY_IN_MATCH",
      "Your account is already in another match. Resume it here, or finish it first. A match that lost its connection frees your account within a minute.",
    ],
    ["AEGIS_RANKED_SEARCH_ACTIVE", "Your account is searching for a ranked match. Cancel that search, then try again."],
    ["AEGIS_JOIN_REFUSED", "The server did not accept this join. Return to the lobby and try again."],
  ])("explains %s without exposing a transport code", (error, message) => {
    expect(getConnectionErrorMessage({ error, t })).toBe(message);
  });

  it("preserves actionable validation errors from joining a match", () => {
    expect(getConnectionErrorMessage({ error: "Deck contains a restricted card", t })).toBe(
      "Deck contains a restricted card",
    );
  });
});
