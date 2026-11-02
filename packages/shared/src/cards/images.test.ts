import { describe, expect, it } from "vitest";
import { cardImageUrls } from "./images.js";
import { mirroredCardImageUrl } from "./mirroredCardImageUrl.js";
import { tokenDefinitions } from "./tokens.js";

const fileName = (url: string) => url.split("/").at(-1)?.replace(/\?.*$/, "");

describe("preview card art", () => {
  it("uses published art for EX13 and the P-245 through P-250 wave", () => {
    const ids = [
      ...Array.from({ length: 77 }, (_, index) => `EX13-${String(index + 1).padStart(3, "0")}`),
      ...Array.from({ length: 6 }, (_, index) => `P-${245 + index}`),
    ];
    for (const id of ids) {
      expect(cardImageUrls(id)[0]).toBe(mirroredCardImageUrl(id));
    }
  });

  it("serves every card image from the mirror", () => {
    expect(cardImageUrls("EX12-001")[0]).toBe(mirroredCardImageUrl("EX12-001"));
    expect(cardImageUrls("EX13-072")[0]).toBe(mirroredCardImageUrl("EX13-072"));
  });
});

describe("image cache version", () => {
  it("adds one cache version to every mirrored image url", () => {
    const mirrored = cardImageUrls("BT16-077").filter((url) => url.startsWith("/assets/card-images/"));
    expect(mirrored).toHaveLength(4);
    expect(new Set(mirrored.map((url) => url.split("?v=")[1])).size).toBe(1);
    expect(mirrored.every((url) => /\.webp\?v=[\w-]+$/.test(url))).toBe(true);
  });
});

describe("alternate art provider fallback", () => {
  it("tries selected art providers before the original printing providers", () => {
    const urls = cardImageUrls("BT1-010", "BT1-010_P1");
    expect(urls.map(fileName)).toEqual([
      "BT1-010_P1.webp",
      "BT1-010_P1-Sample.webp",
      "BT1-010.webp",
      "BT1-010-Sample.webp",
      "BT1-010.png",
    ]);
  });
  it("does not duplicate the original fallback for default or invalid choices", () => {
    expect(cardImageUrls("BT1-010", "BT1-010_P999")).toEqual(cardImageUrls("BT1-010"));
  });
});

describe("errata printings", () => {
  it("tries the errata art before the pre-errata art", () => {
    const urls = cardImageUrls("BT16-077");
    expect(urls.map(fileName)).toEqual([
      "BT16-077-Errata.webp",
      "BT16-077-Errata-Sample.webp",
      "BT16-077.webp",
      "BT16-077-Sample.webp",
      "BT16-077.png",
    ]);
  });
});

describe("token art", () => {
  it("serves the bundled official art instead of the upstream card set", () => {
    expect(cardImageUrls("TOKEN-Fujitsumon-Token")).toEqual(["/cards/tokens/TOKEN-Fujitsumon-Token.webp"]);
  });

  it("folds accents and ampersands out of the file name", () => {
    expect(cardImageUrls("TOKEN-Volée-&-Zerdrücken")).toEqual(["/cards/tokens/TOKEN-Volee-Zerdrucken.webp"]);
  });

  it("points every token at the bundled token folder", () => {
    for (const token of tokenDefinitions) {
      expect(cardImageUrls(token.cardId)).toEqual([expect.stringMatching(/^\/cards\/tokens\/TOKEN-[\w-]+\.webp$/)]);
    }
  });
});

it("#4958/#4928 retains an independent official PNG fallback when the image mirror is unavailable", () => {
  expect(cardImageUrls("BT1-010").at(-1)).toBe("https://world.digimoncard.com/images/cardlist/card/BT1-010.png");
});
