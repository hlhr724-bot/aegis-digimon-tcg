import { describe, expect, it } from "vitest";
import { CHAT_TEXT_MAX_LENGTH, normalizeChatText, parseChatMessage } from "./chat.js";

describe("parseChatMessage", () => {
  it("accepts a known emote", () => {
    expect(parseChatMessage({ kind: "emote", emote: "stayAway" })).toEqual({ kind: "emote", emote: "stayAway" });
  });

  it("rejects an unknown emote and malformed payloads", () => {
    expect(parseChatMessage({ kind: "emote", emote: "digivolve" })).toBeUndefined();
    expect(parseChatMessage({ kind: "text", text: 42 })).toBeUndefined();
    expect(parseChatMessage(["text"])).toBeUndefined();
    expect(parseChatMessage(null)).toBeUndefined();
  });

  it("normalizes text and rejects text that is empty after normalizing", () => {
    expect(parseChatMessage({ kind: "text", text: "  good\n\tgame  " })).toEqual({ kind: "text", text: "good game" });
    expect(parseChatMessage({ kind: "text", text: ` ${String.fromCodePoint(0, 0x202e)} ` })).toBeUndefined();
  });

  it("refuses bot lines from clients, since only the server speaks for a bot", () => {
    expect(parseChatMessage({ kind: "botLine", line: "victory", text: "Good game!" })).toBeUndefined();
  });

  it("rejects oversized raw text before normalizing it", () => {
    expect(parseChatMessage({ kind: "text", text: "a".repeat(CHAT_TEXT_MAX_LENGTH * 4 + 1) })).toBeUndefined();
  });
});

describe("normalizeChatText", () => {
  it("caps length by code point without splitting emoji", () => {
    const text = normalizeChatText("😀".repeat(CHAT_TEXT_MAX_LENGTH + 5));
    expect(Array.from(text)).toHaveLength(CHAT_TEXT_MAX_LENGTH);
    expect(text.endsWith("😀")).toBe(true);
  });

  it("keeps zero-width joiners inside composed emoji", () => {
    expect(normalizeChatText("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });
});
