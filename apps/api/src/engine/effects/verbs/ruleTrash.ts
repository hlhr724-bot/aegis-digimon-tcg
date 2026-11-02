import { Zone } from "@aegis/shared/schema/enums";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { applyOverflow, extractPermanentAt, insertCard, setBreeding } from "#api/engine/state/access";
import type { Primitives } from "#api/engine/effects/EffectContext";

import type { PrimitivesContext } from "#api/engine/effects/verbs/context";

export function createRuleTrashVerbs(pc: PrimitivesContext) {
  const { engine, dropPermanentLedgers, ledger, player, state } = pc;

  const trashPermanentByRule: Primitives["trashPermanentByRule"] = async (permanentIds) => {
    const wanted = new Set(permanentIds);
    const extractedPermanents: { permanent: Permanent; from: Zone }[] = [];
    const moved: CardInstance[] = [];
    const movedByZone = new Map<Zone, CardInstance[]>();
    for (const owner of state.players) {
      for (let index = owner.battleArea.length - 1; index >= 0; index -= 1) {
        const permanent = owner.battleArea[index];
        if (permanent === undefined || !wanted.has(permanent.permanentId)) {
          continue;
        }
        const extracted = extractPermanentAt(owner, index);
        if (extracted !== undefined) {
          extractedPermanents.push({ permanent: extracted, from: Zone.BattleArea });
        }
      }
      if (owner.breeding !== undefined && wanted.has(owner.breeding.permanentId)) {
        extractedPermanents.push({ permanent: owner.breeding, from: Zone.Breeding });
        setBreeding(owner, undefined);
      }
    }
    for (const { permanent, from } of extractedPermanents) {
      dropPermanentLedgers(permanent.permanentId);
      const cards = [...permanent.stack, ...(permanent.topCard ? [permanent.topCard] : []), ...permanent.linked];
      for (const card of cards) {
        card.faceUp = true;
        insertCard(player(card.ownerSeat), Zone.Trash, card);
        moved.push(card);
      }
      const zoneCards = movedByZone.get(from) ?? [];
      zoneCards.push(...cards);
      movedByZone.set(from, zoneCards);
    }
    if (moved.length === 0) {
      return [];
    }
    ledger.dropSourceInstances(
      state,
      moved.map((card) => card.instanceId),
    );
    applyOverflow(engine.memory, moved, state.turnSeat);
    for (const [from, cards] of movedByZone) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        from,
        to: Zone.Trash,
      });
    }
    return moved;
  };

  return { trashPermanentByRule };
}
