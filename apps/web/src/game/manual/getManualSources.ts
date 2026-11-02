import { getManualPermanentCards } from "@aegis/shared/manual/getManualPermanentCards";
import type { ManualLocation } from "@aegis/shared/manual/ManualCommand";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { Zone } from "@aegis/shared/schema/enums";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Translate } from "@/i18n/translationTypes";

export type ManualSourceOption = { key: string; label: string; from: ManualLocation; permanent?: Permanent };
type Params = { player: PlayerState; t: Translate };

export function getManualSources({ player, t }: Params): ManualSourceOption[] {
  const result: ManualSourceOption[] = [];
  const getName = (cardId: string) => getCardDefinition(cardId)?.nameEn ?? cardId;
  for (const zone of [Zone.Hand, Zone.Trash, Zone.Delay] as const) {
    const cards = zone === Zone.Delay ? player.delayZone : player[zone];
    for (const card of cards ?? []) {
      result.push({
        key: card.instanceId,
        label: `${t(`manual.zone.${zone}`)} · ${getName(card.cardId)}`,
        from: { zone, instanceId: card.instanceId },
      });
    }
  }
  for (const zone of [Zone.Deck, Zone.EggDeck, Zone.Security] as const) {
    let count = player.deckCount;
    if (zone === Zone.EggDeck) {
      count = player.eggDeckCount;
    }
    if (zone === Zone.Security) {
      count = player.securityCount;
    }
    if (count > 0) {
      result.push({
        key: `${zone}:top`,
        label: `${t(`manual.zone.${zone}`)} · ${t("manual.top")}`,
        from: { zone, index: 0 },
      });
      if (count > 1) {
        result.push({
          key: `${zone}:bottom`,
          label: `${t(`manual.zone.${zone}`)} · ${t("manual.bottom")}`,
          from: { zone, index: count - 1 },
        });
      }
    }
  }
  for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
    const zone = permanent.inBreeding ? Zone.Breeding : Zone.BattleArea;
    for (const part of ["top", "source", "link"] as const) {
      const cards = getManualPermanentCards({ permanent, part });
      for (const [index, card] of cards.entries()) {
        result.push({
          key: card.instanceId,
          label: `${getName(permanent.topCard.cardId)} · ${t(`manual.${part}`)} ${index + 1} · ${getName(card.cardId)}`,
          from: { zone, permanentId: permanent.permanentId, part, instanceId: card.instanceId },
          permanent,
        });
      }
    }
  }
  const inspected: { zone: Zone; instanceId: string; cardId: string }[] = JSON.parse(
    player.manualInspectionJson || "[]",
  );
  for (const card of inspected) {
    result.push({
      key: `inspect:${card.instanceId}`,
      label: `${t("manual.inspect")} · ${getName(card.cardId)}`,
      from: { zone: card.zone, instanceId: card.instanceId },
    });
  }
  return result;
}
