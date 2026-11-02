import artsJson from "./data/arts.json" with { type: "json" };
import regionalArtsJson from "./data/regional-arts.json" with { type: "json" };
import { cardData } from "./data/index.js";
import type { CardArt } from "./types.js";

type EncodedCardArt = [suffix: string, labelIndex: number, imageId?: string];

interface EncodedCardArts {
  labels: readonly string[];
  cards: Readonly<Record<string, readonly EncodedCardArt[]>>;
}

const encodedArtSources = [artsJson, regionalArtsJson] as unknown as readonly EncodedCardArts[];
const decodedAlternateArts = new Map<string, readonly CardArt[]>();

function decodeArts(encodedArts: EncodedCardArts, cardId: string): CardArt[] {
  const encoded = Object.hasOwn(encodedArts.cards, cardId) ? encodedArts.cards[cardId]! : [];
  return encoded.map(([suffix, labelIndex, imageId]): CardArt => {
    const artId = `${cardId}${suffix}`;
    return { artId, imageId: imageId ?? artId, label: encodedArts.labels[labelIndex] ?? "" };
  });
}

function getAlternateArts(cardId: string): readonly CardArt[] {
  const cached = decodedAlternateArts.get(cardId);
  if (cached) {
    return cached;
  }
  const decoded = encodedArtSources.flatMap((encodedArts) => decodeArts(encodedArts, cardId));
  decodedAlternateArts.set(cardId, decoded);
  return decoded;
}

/** Cosmetic printing IDs never become the card's rules identity. */
export function getCardArts(cardId: string): readonly CardArt[] {
  const base: CardArt = {
    artId: cardId,
    imageId: (Object.hasOwn(cardData, cardId) ? cardData[cardId]?.imageId : undefined) ?? cardId,
    label: "Original art",
  };
  return [base, ...getAlternateArts(cardId)];
}

/** Reject foreign/unknown printing IDs and retain compatibility with older decks. */
export function resolveCardArt(cardId: string, artId?: string): CardArt {
  const arts = getCardArts(cardId);
  return arts.find((art) => art.artId === artId) ?? arts[0]!;
}
