import type { BlockContext, CounterContext } from "#api/bot/policy";
import type { BotView } from "#api/bot/view";
import type { CombatSearchKind } from "#api/bot/search/CombatSearchKind";

export type CombatSearchRequest =
  | { kind: typeof CombatSearchKind.BLOCK.value; view: BotView; context: BlockContext }
  | { kind: typeof CombatSearchKind.COUNTER.value; view: BotView; context: CounterContext };
