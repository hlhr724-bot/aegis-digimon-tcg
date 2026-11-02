import { describe, expect, it } from "vitest";
import { parseProviderResponse } from "#api/deckProviders/providers/parseProviderResponse";
import type { ProviderDetail, ProviderPage, ProviderArchetype } from "@aegis/shared/deckProviders/ProviderTypes";

const row = {
  result_id: 12,
  archetype_name: "Blue Flare",
  format: "BT18",
  decklist_url: "https://example.com/deck",
  decklist: {
    eggs: [{ card_id: "BT1-003", count: 4 }],
    digimon: [{ card_id: "BT1-027", count: 4 }],
    tamers: [],
    options: [],
  },
};

describe("provider deck conversion", () => {
  it("expands quantities and checks match legality instead of assuming tournament legality", () => {
    const result = parseProviderResponse({ body: row, kind: "detail", format: "standard" }) as ProviderDetail;
    expect(result.mainDeck).toEqual(Array(4).fill("BT1-027"));
    expect(result.eggDeck).toEqual(Array(4).fill("BT1-003"));
    expect(result.legality?.legal).toBe(false);
    expect(result.sourceUrl).toBe("https://digimon.digilab.cards/decklist/12");
  });
  it("preserves unavailable lists without inventing cards", () => {
    const result = parseProviderResponse({ body: { ...row, decklist: null }, kind: "detail" }) as ProviderDetail;
    expect(result.mainDeck).toBeNull();
    expect(result.legality).toBeNull();
  });
  it("rejects malformed quantities and reports unknown cards", () => {
    expect(() =>
      parseProviderResponse({
        body: { ...row, decklist: { ...row.decklist, eggs: [{ card_id: "BT1-003", count: -1 }] } },
        kind: "detail",
      }),
    ).toThrow("digilab_unavailable");
    const result = parseProviderResponse({
      body: { ...row, decklist: { ...row.decklist, eggs: [{ card_id: "NO-CARD", count: 1 }] } },
      kind: "detail",
    }) as ProviderDetail;
    expect(result.legality?.unknownCards).toEqual(["NO-CARD"]);
  });
  it("accepts live and documented format metadata and ignores additive fields", () => {
    const result = parseProviderResponse({
      body: {
        data: [
          { archetype_id: 1, meta_pct: 4 },
          { archetype_id: 2, meta_pct: 15 },
        ],
        pagination: { page: 1, total_pages: 2 },
        formats: [
          { format: "EX13", display_name: "Chivalrous XIII" },
          { format_id: "BT26", set_name: "Timeless Bonds" },
        ],
        added_field: true,
      },
      kind: "meta",
    }) as ProviderPage<ProviderArchetype>;
    expect(result.formats.map((item) => item.id)).toEqual(["EX13", "BT26"]);
    expect(result.data.map((item) => item.id)).toEqual([2, 1]);
    expect(result.data[0]?.winRate).toBeNull();
  });
  it("does not expose unsafe external links", () => {
    const result = parseProviderResponse({
      body: { ...row, decklist_url: "javascript:alert(1)" },
      kind: "detail",
    }) as ProviderDetail;
    expect(result.externalUrl).toBeNull();
  });
});
