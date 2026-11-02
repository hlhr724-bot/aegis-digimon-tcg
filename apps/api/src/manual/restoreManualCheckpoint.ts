import { ArraySchema } from "@colyseus/schema";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { ManualCheckpoint } from "#api/manual/captureManualCheckpoint";
import {
  clearBattleArea,
  clearZone,
  extractLinkedById,
  fillZone,
  linkCard,
  placePermanent,
  replaceStack,
  setBreeding,
  setTopCard,
} from "#api/engine/state/access";

type Params = { state: GameState; checkpoint: ManualCheckpoint };

export function restoreManualCheckpoint({ state, checkpoint }: Params): void {
  state.turnSeat = checkpoint.turnSeat;
  state.isFirstPlayersFirstTurn = checkpoint.isFirstPlayersFirstTurn;
  state.turnCount = checkpoint.turnCount;
  state.memory = checkpoint.memory;
  Object.assign(state.manual, checkpoint.table);
  for (const entry of checkpoint.players) {
    clearBattleArea(entry.player);
    setBreeding(entry.player, undefined);
    for (const zone of entry.zones) {
      clearZone(entry.player, zone.zone);
    }
  }
  for (const entry of checkpoint.players) {
    for (const face of entry.faces) {
      face.card.faceUp = face.faceUp;
    }
    for (const zone of entry.zones) {
      fillZone(entry.player, zone.zone, zone.cards);
    }
    for (const saved of [...entry.battle, ...(entry.breeding ? [entry.breeding] : [])]) {
      const permanent = saved.permanent;
      permanent.inBreeding = saved.inBreeding;
      if (saved.inBreeding) {
        setBreeding(entry.player, permanent);
      } else {
        placePermanent(entry.player, permanent);
      }
      setTopCard(permanent, saved.top);
      replaceStack(permanent, saved.sources);
      for (const card of Array.from(permanent.linked)) {
        extractLinkedById(permanent, card.instanceId);
      }
      for (const card of saved.links) {
        linkCard(permanent, card, "bottom");
      }
      permanent.currentDP = saved.dp;
      permanent.baseDP = saved.baseDP;
      permanent.isSuspended = saved.suspended;
      permanent.inBreeding = saved.inBreeding;
      permanent.manualMarker = saved.marker;
      permanent.manualStatuses = new ArraySchema(...saved.statuses);
      permanent.securityAttack = saved.securityAttack;
      permanent.securityAttackModifier = saved.securityAttackModifier;
      permanent.keywords = new ArraySchema(...saved.keywords);
      permanent.grantedKeywords = new ArraySchema(...saved.grantedKeywords);
      permanent.originalColorsOverride = new ArraySchema(...saved.colors);
    }
    entry.player.manualInspectionJson = "[]";
  }
}
