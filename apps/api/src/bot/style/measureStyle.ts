import { measureStyleEvents } from "#api/bot/style/measureStyleEvents";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import type { ServerEvent } from "@aegis/shared/protocol/events";

type Params = { replay: ReplayRecord };

export async function measureStyle({ replay }: Params) {
  const events: ServerEvent[] = [];
  const run = await runReplay(replay, {
    stopOnDivergence: true,
    onBatch: (_state, batch) => {
      events.push(...batch);
    },
  });
  if (run.divergences.length > 0 || run.applied !== replay.inputs.length) {
    throw new Error("Cannot measure style from a divergent replay");
  }
  return measureStyleEvents({ events });
}
