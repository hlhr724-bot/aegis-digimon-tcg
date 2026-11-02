import type { ServerEvent } from "@aegis/shared";
import { BotLine, type BotLineEntry } from "@aegis/shared/bot/BotLine";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Seat } from "@aegis/shared/schema/enums";

type Params = {
  event: ServerEvent;
  botSeat: Seat;
  securityCounts: readonly [number, number];
  turnCount: number;
  isBoss: boolean;
};

type Result = { line: BotLineEntry; key: string; cardId?: string };

const bigDigivolveLevel = 5;

function createResult(line: BotLineEntry, turnCount: number, cardId?: string): Result {
  return {
    line,
    key: line.isRepeatable ? `${line.value}:${turnCount}` : line.value,
    ...(cardId ? { cardId } : {}),
  };
}

export function getBotLine({ event, botSeat, securityCounts, turnCount, isBoss }: Params): Result | undefined {
  if (event.kind === "matchStarted") {
    return createResult(isBoss ? BotLine.BOSS_GREETING : BotLine.GREETING, turnCount);
  }
  if (
    event.kind === "digivolved" &&
    event.seat === botSeat &&
    (getCardDefinition(event.cardId)?.level ?? 0) >= bigDigivolveLevel
  ) {
    return createResult(BotLine.BIG_DIGIVOLVE, turnCount, event.cardId);
  }
  if (event.kind === "securityChecked" && securityCounts[event.seat] === 0) {
    return createResult(event.seat === botSeat ? BotLine.LAST_STAND : BotLine.PRESSURE, turnCount);
  }
  if (event.kind === "gameOver" && event.result.outcome === "win") {
    const isWinner = event.result.winnerSeat === botSeat;
    return createResult(isWinner ? BotLine.VICTORY : BotLine.DEFEAT, turnCount);
  }
  return undefined;
}
