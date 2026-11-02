const PRINTING_IMAGE_IDS = new Map([["EX12-033_P1", "EX12-033_P1-Official"]]);

/**
 * English printings which the source's English arts (`AAs`) omit: some sit only among its
 * Japanese arts (`JAAs`), others are not listed at all. The source hosts most of their
 * images; the rest are local scans in `data/card-images`. Mapped to
 * their English product label. Before adding one, view the upstream image and confirm the
 * English product (the wiki the source scrapes, digimoncard.io, or a matching stamp on a
 * listed printing): Japanese labels often name Japan-only products, and the source also
 * keeps stale files that duplicate a listed printing under an old number.
 */
const UNLISTED_ENGLISH_PRINTINGS = new Map([
  ["AD1-005_P2", "Ultimate Cup 26-27 Season 2"],
  ["AD1-010_P1", "Regionals 26-27 Season 1 Promotion Card"],
  ["AD1-011_P1", "Regionals 26-27 Season 2 Participation Set"],
  ["AD1-011_P2", "Regionals 26-27 Season 2 Finalist Set"],
  ["AD1-011_P3", "Regionals 26-27 Season 2 Champion Set"],
  ["BT1-057_P2", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT11-027_P3", "Championship Finals 2024 Trophy Cards"],
  ["BT12-057_P3", "Special Event Pack 2025"],
  ["BT12-072_P2", "Special Limited Set"],
  ["BT13-030_P2", "Championship Finals 2024 Trophy Cards"],
  ["BT14-031_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT16-003_P1", "Box Promotion Pack: Beginning Observer"],
  ["BT16-028_P3", "Regionals 2024 Finalist Set 3"],
  ["BT16-040_P0", "Pre-Release Pack Beginning Observer"],
  ["BT17-036_P0", "Pre-Release Pack Secret Crisis"],
  ["BT17-087_P1", "BT-17: Booster Secret Crisis"],
  ["BT17-099_P0", "Pre-Release Pack Secret Crisis"],
  ["BT18-003_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT18-040_P2", "BT18-19: Special Booster Ver.2.0"],
  ["BT18-083_P2", "BT18-19: Special Booster Ver.2.0"],
  ["BT19-014_P1", "BT-19: Booster Xros Evolution"],
  ["BT19-070_P3", "Event Pack 10"],
  ["BT20-014_P1", "LM-07: LIMITED CARD PACK ANOTHER KNIGHT"],
  ["BT20-034_P1", "Championship 25-26 Finals Season 1"],
  ["BT20-055_P1", "BT-20: Booster Over the X"],
  ["BT20-064_P1", "Regionals 26-27 Season 1 Promotion Card"],
  ["BT20-070_P1", "Regionals 26-27 Season 1 Promotion Card"],
  ["BT20-071_P1", "Championship 25-26 Finals Season 2"],
  ["BT21-005_P1", "LM-07: LIMITED CARD PACK ANOTHER KNIGHT"],
  ["BT21-009_P2", "Ultimate Cup 26-27 Season 2"],
  ["BT21-018_P2", "Ultimate Cup 26-27 Season 2"],
  ["BT21-023_P2", "Ultimate Cup 26-27 Season 2"],
  ["BT21-078_P1", "Regionals 26-27 Season 2 Promotion Card"],
  ["BT23-024_P1", "BT-23: BOOSTER HACKERS' SLUMBER"],
  ["BT24-007_P1", "Evolution Cup 2026 Vol. 3"],
  ["BT24-011_P2", "Event Pack 10"],
  ["BT24-041_P2", "Evolution Cup 2026 Vol. 3"],
  ["BT24-051_P2", "Evolution Cup 2026 Vol. 3"],
  ["BT24-059_P2", "Event Pack 10"],
  ["BT24-086_P1", "BT-24: BOOSTER TIME STRANGER"],
  ["BT25-039_P1", "Regionals 26-27 Season 2 Participation Set"],
  ["BT25-039_P2", "Regionals 26-27 Season 2 Finalist Set"],
  ["BT25-039_P3", "Regionals 26-27 Season 2 Champion Set"],
  ["BT25-041_P2", "Event Pack 10"],
  ["BT25-053_P2", "Event Pack 10"],
  ["BT25-082_P1", "Regionals 26-27 Season 2 Participation Set"],
  ["BT25-082_P2", "Regionals 26-27 Season 2 Finalist Set"],
  ["BT25-082_P3", "Regionals 26-27 Season 2 Champion Set"],
  ["BT25-094_P1", "Judge Pack 10"],
  ["BT25-095_P1", "Judge Pack 10"],
  ["BT25-097_P1", "Judge Pack 10"],
  ["BT25-099_P1", "Judge Pack 10"],
  ["BT25-102_P1", "Judge Pack 10"],
  ["BT26-029_P1", "Box Promotion Pack: TIMELESS BONDS"],
  ["BT26-073_P1", "Box Promotion Pack: TIMELESS BONDS"],
  ["BT26-100_P1", "Judge Pack 10"],
  ["BT3-024_P1", "BT-03: Booster Union Impact"],
  ["BT3-037_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT3-039_P4", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT6-065_P0", "Double Diamond Pre-Release Pack"],
  ["BT7-109_P0", "Next Adventure Pre-Release Pack"],
  ["BT8-077_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["BT8-094_P2", "Championship 2024 Gold Stamp Card Set"],
  ["BT8-097_P0", "New Awakening Pre-Release Pack"],
  ["BT8-108_P0", "Double Typhoon Pre-Release Pack"],
  ["BT9-028_P1", "2024 Evolution Cup August 2024 Wave 2 (Participation)"],
  ["BT9-028_P2", "2024 Evolution Cup August 2024 Wave 2 (Top 4)"],
  ["BT9-112_P4", "Special Limited Set"],
  ["EX1-023_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["EX1-026_P2", "Digimon Story: Time Stranger Tutorial Deck"],
  ["EX1-066_P6", "BT-21: Limited Card Pack"],
  ["EX10-023_P2", "EX-10: EXTRA BOOSTER SINISTER ORDER"],
  ["EX10-059_P2", "EX-10: EXTRA BOOSTER SINISTER ORDER"],
  ["EX10-060_P2", "EX-10: EXTRA BOOSTER SINISTER ORDER"],
  ["EX10-061_P2", "EX-10: EXTRA BOOSTER SINISTER ORDER"],
  ["EX11-027_P2", "Regionals 26-27 Season 2 Participation Set"],
  ["EX11-027_P3", "Regionals 26-27 Season 2 Finalist Set"],
  ["EX11-027_P4", "Regionals 26-27 Season 2 Champion Set"],
  ["EX11-072_P1", "EX-11: EXTRA BOOSTER DAWN OF LIBERATOR"],
  ["EX12-006_P1", "Box Promotion Pack: DIGITAL WORLD SHAMBALA"],
  ["EX12-013_P2", "Regionals 26-27 Season 2 Participation Set"],
  ["EX12-013_P3", "Regionals 26-27 Season 2 Finalist Set"],
  ["EX12-013_P4", "Regionals 26-27 Season 2 Champion Set"],
  ["EX12-070_P2", "Judge Pack 10"],
  ["EX12-071_P2", "Judge Pack 10"],
  ["EX2-011_P0", "DC-1 2022 Grand Prix Stamp"],
  ["EX3-010_P2", "2024 Evolution Cup August 2024 Wave 2 (Participation)"],
  ["EX3-010_P3", "2024 Evolution Cup August 2024 Wave 2 (Top 4)"],
  ["EX4-019_P2", "Event Pack 10"],
  ["EX4-034_P0", "Double Typhoon Pre-Release Pack"],
  ["EX4-068_P2", "Championship 25-26 Season 1 Tamers Pack"],
  ["EX5-007_P2", "Digimon Story: Time Stranger - Collector's Edition"],
  ["EX5-016_P2", "Digimon Story: Time Stranger - Collector's Edition"],
  ["EX5-070_P5", "Special Event Pack 2025"],
  ["EX5-073_P3", "Digimon Story: Time Stranger - Collector's Edition"],
  ["EX7-028_P2", "Digimon Story: Time Stranger Tutorial Deck"],
  ["P-037_P6", "Digimon Story: Time Stranger Tutorial Deck"],
  ["P-041_P0", "DC-1 2022 Grand Prix Stamp"],
  ["P-071_P2", "Championship 2023 Gold Card Set"],
  ["P-117_P1", "Demo Deck: Imperialdramon"],
  ["P-123_P1", "Demo Deck: Imperialdramon"],
  ["P-124_P1", "Demo Deck: Imperialdramon"],
  ["P-130_P1", "Demo Deck: Imperialdramon"],
  ["P-131_P1", "Digimon Liberator Release Commemoration"],
  ["P-134_P1", "Digimon Liberator Release Commemoration"],
  ["P-148_P1", "Store Tournament 2024 Jul.\u2013Sep. Winner Pack"],
  ["P-151_P2", "Legend Pack 2024"],
  ["P-191_P2", "Digimon Story: Time Stranger Tutorial Deck"],
  ["P-194_P2", "Digimon Story: Time Stranger - Collector's Edition"],
  ["P-245_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["P-246_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["P-247_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["P-248_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["P-249_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["P-250_P1", "Official Store Tournament 2026 Vol.4 (Winner)"],
  ["RB1-006_P1", "2024 Evolution Cup August 2024 Wave 2 (Participation)"],
  ["RB1-006_P2", "2024 Evolution Cup August 2024 Wave 2 (Top 4)"],
  ["RB1-032_P4", "AD-01: ADVANCED BOOSTER DIGIMON GENERATION"],
  ["ST10-13_P1", "Digimon Story: Time Stranger Tutorial Deck"],
  ["ST12-12_P3", "Special Limited Set"],
  ["ST12-13_P2", "Special Limited Set"],
  ["ST13-08_P1", "AD-01: ADVANCED BOOSTER DIGIMON GENERATION"],
  ["ST14-02_P0", "Beelzemon Cup Participation Pack"],
  ["ST20-01_P1", "ST-20 & ST-21: Welcome Tamers Pack"],
  ["ST21-01_P2", "Regionals 26-27 Season 2 Promotion Card"],
  ["ST21-10_P3", "Regionals 26-27 Season 2 Promotion Card"],
  ["ST23-07_P2", "Regionals 26-27 Season 2 Participation Set"],
  ["ST23-07_P3", "Regionals 26-27 Season 2 Finalist Set"],
  ["ST23-07_P4", "Regionals 26-27 Season 2 Champion Set"],
  ["ST23-15_P1", "Judge Pack 10"],
  ["ST24-04_P2", "ST-24: STARTER DECK DIGIMON DATA SQUAD"],
  ["ST24-15_P1", "Judge Pack 10"],
  ["ST7-05_P0", "DC-1 2022 Grand Prix Stamp"],
  ["ST7-08_P0", "DC-1 2022 Grand Prix Stamp"],
  ["ST7-11_P0", "DC-1 2022 Grand Prix Stamp"],
  ["ST8-08_P1", "Championship Finals 2024 Trophy Cards"],
]);

function unlistedEnglishPrintings(card) {
  return [...UNLISTED_ENGLISH_PRINTINGS]
    .filter(([id]) => id.startsWith(`${card.cardNumber}_P`))
    .map(([id, note]) => ({ id, note }));
}

/**
 * Source-declared or allowlisted English printing IDs belonging to this canonical card; a
 * source entry wins over an allowlisted one. An errata printing (`_P1-Errata`) keeps its
 * plain art ID and its own image, whose pre-errata image is the client's fallback.
 */
export function sourceCardArts(card) {
  const seen = new Set();
  return [...(Array.isArray(card.AAs) ? card.AAs : []), ...unlistedEnglishPrintings(card)]
    .flatMap((art) => {
      if (typeof art.id !== "string" || !art.id.startsWith(card.cardNumber)) return [];
      const printing = art.id.slice(card.cardNumber.length).match(/^_P(\d+)(?:-Errata)?$/);
      if (!printing) return [];
      const artId = `${card.cardNumber}_P${printing[1]}`;
      if (seen.has(artId)) return [];
      seen.add(artId);
      return [
        { artId, imageId: PRINTING_IMAGE_IDS.get(artId) ?? art.id, label: art.note || art.type || "Alternate art" },
      ];
    })
    .sort((a, b) => a.artId.localeCompare(b.artId, "en", { numeric: true }));
}

/**
 * The Japanese base printing plus the source's Japanese arts (`JAAs`), under `-J` art IDs so
 * they never collide with an English printing. Some differ from the English art (Sistermon
 * Noir became Ciel in English), so players can pick either. The source spells a few image IDs
 * with a lowercase `-j` or as `-Sample-J` scans; the art ID is normalized, the image ID kept.
 */
export function sourceJapaneseArts(card) {
  const seen = new Set();
  const base = { artId: `${card.cardNumber}-J`, imageId: `${card.cardNumber}-J`, label: "Japanese printing" };
  const alternates = (Array.isArray(card.JAAs) ? card.JAAs : [])
    .flatMap((art) => {
      if (typeof art.id !== "string" || !art.id.startsWith(card.cardNumber)) return [];
      const printing = art.id.slice(card.cardNumber.length).match(/^_P(\d+)(?:-Sample)?-J$/i);
      if (!printing) return [];
      const artId = `${card.cardNumber}_P${printing[1]}-J`;
      if (seen.has(artId)) return [];
      seen.add(artId);
      return [{ artId, imageId: art.id, label: `${art.note || art.type || "Alternate art"} (Japanese)` }];
    })
    .sort((a, b) => a.artId.localeCompare(b.artId, "en", { numeric: true }));
  return [base, ...alternates];
}

export function encodeCardArts(artsByCard, previousLabels = []) {
  const used = new Set(Object.values(artsByCard).flatMap((arts) => arts.map((art) => art.label)));
  const labels = previousLabels.filter((label) => used.has(label));
  for (const label of used) {
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }
  const labelIndex = new Map(labels.map((label, index) => [label, index]));
  const cards = Object.fromEntries(
    Object.entries(artsByCard)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([cardId, arts]) => [
        cardId,
        arts.map((art) => {
          if (!art.artId.startsWith(cardId)) {
            throw new Error(`Art ${art.artId} does not belong to ${cardId}`);
          }
          const encoded = [art.artId.slice(cardId.length), labelIndex.get(art.label)];
          return art.imageId === art.artId ? encoded : [...encoded, art.imageId];
        }),
      ]),
  );
  return { labels, cards };
}

export function serializeCardArts({ labels, cards }) {
  const formatTuple = (tuple) => `[${tuple.map((value) => JSON.stringify(value)).join(", ")}]`;
  const formatCard = ([cardId, arts]) => {
    if (arts.length === 1) {
      return `    ${JSON.stringify(cardId)}: [${formatTuple(arts[0])}]`;
    }
    return `    ${JSON.stringify(cardId)}: [\n${arts.map((art) => `      ${formatTuple(art)}`).join(",\n")}\n    ]`;
  };
  return [
    "{",
    '  "labels": [',
    labels.map((label) => `    ${JSON.stringify(label)}`).join(",\n"),
    "  ],",
    '  "cards": {',
    Object.entries(cards).map(formatCard).join(",\n"),
    "  }",
    "}",
    "",
  ].join("\n");
}

export function decodeCardArts({ labels, cards }) {
  return Object.fromEntries(
    Object.entries(cards).map(([cardId, arts]) => [
      cardId,
      arts.map(([suffix, labelIndex, imageId]) => ({
        artId: `${cardId}${suffix}`,
        imageId: imageId ?? `${cardId}${suffix}`,
        label: labels[labelIndex],
      })),
    ]),
  );
}
