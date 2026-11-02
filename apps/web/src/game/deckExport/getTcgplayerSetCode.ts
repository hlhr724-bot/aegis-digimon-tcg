import type { CardDefinition } from "@aegis/shared/cards/types";
import cardSets from "@/game/deckExport/tcgplayerCardSets.json";

const setCodes: Readonly<Record<string, string>> = {
  AD1: "AD-01",
  BT4: "BT-04",
  BT5: "BT-05",
  BT6: "BT-06",
  BT7: "BT-07",
  BT8: "BT-08",
  BT9: "BT-09",
  BT10: "BT-10",
  BT11: "BT-11",
  BT12: "BT-12",
  BT13: "BT-13",
  BT14: "BT-14",
  BT15: "BT-15",
  BT16: "BT-16",
  BT17: "BT-17",
  BT21: "BT-21",
  BT22: "BT-22",
  BT23: "BT-23",
  BT24: "BT-24",
  BT25: "BT-25",
  BT26: "BT-26",
  BT27: "BT27",
  EX1: "EX-01",
  EX2: "EX-02",
  EX3: "EX-03",
  EX4: "EX-04",
  EX5: "EX-05",
  EX6: "EX-06",
  EX7: "EX-07",
  EX8: "EX-08",
  EX9: "EX-09",
  EX10: "EX-10",
  EX11: "EX-11",
  EX12: "EX-12",
  EX13: "EX-13",
  EX14: "EX-14",
  ST1: "ST-1",
  ST2: "ST-2",
  ST3: "ST-3",
  ST4: "ST-4",
  ST5: "ST-5",
  ST6: "ST-6",
  ST7: "ST-7",
  ST8: "ST-8",
  ST9: "ST-9",
  ST10: "ST-10",
  ST12: "ST-12",
  ST13: "ST-13",
  ST14: "ST-14",
  ST15: "ST-15",
  ST16: "ST-16",
  ST17: "ST-17",
  ST18: "ST-18",
  ST19: "ST-19",
  ST20: "ST-20",
  ST21: "ST-21",
  ST22: "ST-22",
  ST23: "ST-23",
  ST24: "ST-24",
  RB1: "RB-01",
  P: "D-PR",
};

export function getTcgplayerSetCode(card: Pick<CardDefinition, "cardId" | "set">): string | undefined {
  if (Object.hasOwn(cardSets, card.cardId)) {
    return cardSets[card.cardId as keyof typeof cardSets];
  }
  if (Object.hasOwn(setCodes, card.set)) {
    return setCodes[card.set];
  }
  return undefined;
}
