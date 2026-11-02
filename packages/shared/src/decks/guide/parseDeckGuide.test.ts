import { describe, expect, it } from "vitest";
import { normalizeDeckGuide } from "#shared/decks/guide/normalizeDeckGuide";
import { parseDeckGuide } from "#shared/decks/guide/parseDeckGuide";
import { parseDeckGuideInline } from "#shared/decks/guide/parseDeckGuideInline";

describe("deck guide text", () => {
  it("normalizes Unicode and whitespace without truncation", () => {
    expect(normalizeDeckGuide({ raw: "  ## ＢＴ１-００９  \r\n\r\n\rnext \r\n " })).toBe("## BT1-009\n\nnext");
    expect(normalizeDeckGuide({ raw: " \r\n " })).toBeNull();
    expect(normalizeDeckGuide({ raw: null })).toBeNull();
    expect(normalizeDeckGuide({ raw: "a".repeat(5001) })).toHaveLength(5001);
  });

  it("parses headings, lists, bold and soft-wrapped paragraphs", () => {
    expect(parseDeckGuide({ guide: "## Start\n\nFirst\nturn **play**\n- One\n* Two" })).toEqual([
      { kind: "heading", children: [{ kind: "text", text: "Start" }] },
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "First turn " },
          { kind: "bold", children: [{ kind: "text", text: "play" }] },
        ],
      },
      { kind: "list", items: [[{ kind: "text", text: "One" }], [{ kind: "text", text: "Two" }]] },
    ]);
  });

  it.each(["BT1-009", "ST1-02", "P-001", "EX4-012"])("recognizes catalog card %s", (cardId) => {
    expect(parseDeckGuideInline({ text: cardId })).toEqual([{ kind: "card", cardId }]);
  });

  it("keeps unknown IDs, lowercase codes and unmatched bold as text", () => {
    const text = "BT99-999 bt1-009 **unfinished <script>alert(1)</script>";
    expect(parseDeckGuideInline({ text })).toEqual([{ kind: "text", text }]);
    expect(parseDeckGuideInline({ text: "BT1-009_P1" })).toEqual([
      { kind: "card", cardId: "BT1-009" },
      { kind: "text", text: "_P1" },
    ]);
  });
});
