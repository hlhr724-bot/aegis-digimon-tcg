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
  ])("explains %s without exposing a transport code", (error, message) => {
    expect(getConnectionErrorMessage({ error, t })).toBe(message);
  });

  it("preserves actionable validation errors from joining a match", () => {
    expect(getConnectionErrorMessage({ error: "Deck contains a restricted card", t })).toBe(
      "Deck contains a restricted card",
    );
  });
});
