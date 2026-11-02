import { describe, expect, it } from "vitest";
import { getConnectionErrorCode } from "#shared/protocol/getConnectionErrorCode";

describe("connection error codes", () => {
  it.each([
    [1009, "AEGIS_MESSAGE_TOO_LARGE"],
    [413, "AEGIS_MESSAGE_TOO_LARGE"],
    [1006, "AEGIS_CONNECTION_LOST"],
    [4408, "AEGIS_SESSION_EXPIRED"],
    [524, "AEGIS_SESSION_EXPIRED"],
    [4429, "AEGIS_TOO_MANY_MESSAGES"],
    [4004, "AEGIS_SEAT_TRANSFERRED"],
    [503, "AEGIS_SERVER_UNAVAILABLE"],
    ["AEGIS_MESSAGE_TOO_LARGE", "AEGIS_MESSAGE_TOO_LARGE"],
  ])("classifies %s as %s", (code, expected) => {
    expect(getConnectionErrorCode({ code })).toBe(expected);
  });

  it.each([undefined, null, "constructor", "1009", {}, 1234])("does not classify unknown code %s", (code) => {
    expect(getConnectionErrorCode({ code })).toBeUndefined();
  });
});
