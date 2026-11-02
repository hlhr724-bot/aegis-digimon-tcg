import type { RankedConfig } from "@aegis/shared/ranked/RankedContracts";
import { getRankedSeason } from "#api/ranked/getRankedSeason";

type Params = { env?: NodeJS.ProcessEnv; now?: number };

export function getRankedConfig({ env = process.env, now = Date.now() }: Params = {}): RankedConfig {
  const { formats } = getRankedSeason(now);
  return { enabled: env.AEGIS_RANKED_ENABLED === "true", formats };
}
