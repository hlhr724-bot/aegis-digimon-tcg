import { createHash } from "node:crypto";
import type { GameEngine } from "#api/engine/GameEngine";

export function rollbackStateFingerprint(engine: Pick<GameEngine, "state" | "refreshHandAffordances">): string {
  engine.refreshHandAffordances();
  const json = engine.state.toJSON() as Record<string, unknown>;
  for (const key of [
    "matchLogId",
    "matchId",
    "roomCode",
    "spectatorCode",
    "series",
    "stateVersion",
    "matchTimer",
    "timerStartSeconds",
    "timerRefillSeconds",
    "timerRemaining0",
    "timerRemaining1",
    "timerActiveSeat",
    "mulliganTimerRemaining0",
    "mulliganTimerRemaining1",
    "allowRollback",
    "rollbackRevision",
    "rollbackRequestId",
    "rollbackRequesterSeat",
    "rollbackKind",
    "rollbackBusy",
    "undoActionSeat",
    "rollbackTurnSeat",
    "canUndoAction",
    "canRollbackTurn",
  ])
    delete json[key];
  for (const player of json.players as Record<string, unknown>[]) {
    for (const key of [
      "sessionId",
      "displayName",
      "avatarId",
      "equippedRankedTier",
      "botPersonaId",
      "hideIdentityFromSpectators",
      "spectatorNamesJson",
      "anonymousSpectatorCount",
      "deckCount",
      "eggDeckCount",
      "handCount",
      "securityCount",
      "securityView",
    ])
      delete player[key];
  }
  return createHash("sha256").update(JSON.stringify(json)).digest("hex");
}
