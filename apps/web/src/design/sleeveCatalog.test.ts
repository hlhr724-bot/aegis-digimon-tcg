import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARD_SLEEVES, cardSleeveById, DEFAULT_EGG_SLEEVE } from "./sleeve";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public");

describe("card sleeve catalog", () => {
  it("ships an image for every sleeve", () => {
    const missing = [DEFAULT_EGG_SLEEVE, ...CARD_SLEEVES].filter(
      ({ src }) => src !== undefined && !existsSync(join(publicDir, src)),
    );

    expect(missing.map(({ id }) => id)).toEqual([]);
  });

  it("names Official Card Sleeves 03 after their series while keeping saved ids", () => {
    expect(
      ["official-03-adventure", "official-03-chronicle", "official-03-generations", "official-03-ghost-game"].map(
        (id) => [cardSleeveById(id).label, cardSleeveById(id).src],
      ),
    ).toEqual([
      ["Time Stranger: Protagonists", "/sleeves/official-03-time-stranger-protagonists.webp"],
      ["Time Stranger: Inori and Aegiomon", "/sleeves/official-03-time-stranger-inori-aegiomon.webp"],
      ["Data Squad", "/sleeves/official-03-data-squad.webp"],
      ["Beatbreak", "/sleeves/official-03-beatbreak.webp"],
    ]);
  });
});
