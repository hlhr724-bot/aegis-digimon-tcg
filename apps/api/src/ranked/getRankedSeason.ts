import { getRankedSeasonFormats } from "#api/ranked/getRankedSeasonFormats";
import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";

const EPOCH = Date.UTC(2026, 9, 12);
const DURATION = 56 * 24 * 60 * 60 * 1000;

export function getRankedSeason(now: number): RankedSeason {
  const index = Math.max(0, Math.floor((now - EPOCH) / DURATION));
  const startsAt = EPOCH + index * DURATION;
  return {
    id: index + 1,
    startsAt,
    endsAt: startsAt + DURATION,
    finalized: false,
    formats: getRankedSeasonFormats({ seasonId: index + 1 }),
  };
}
