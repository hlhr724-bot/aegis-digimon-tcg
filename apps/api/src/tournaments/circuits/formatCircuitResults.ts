import type { TournamentCircuitStanding } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { chunkDiscordLines } from "#api/tournaments/discord/chunkDiscordLines";
import type { DiscordMessage } from "#api/tournaments/discord/DiscordRestClient";
import { formatDiscordPlayer } from "#api/tournaments/discord/formatDiscordPlayer";

type Params = {
  name: string;
  link: string;
  standings: readonly TournamentCircuitStanding[];
};

const PODIUM_SIZE = 8;

export function formatCircuitResults({ name, link, standings }: Params): DiscordMessage[] {
  const lines = standings
    .filter((standing) => standing.position <= PODIUM_SIZE)
    .map(
      (standing) =>
        `${standing.position}. ${formatDiscordPlayer({ name: standing.displayName })} — ${standing.points} pts`,
    );
  return chunkDiscordLines([`## ${name} circuit has finished`, ...lines, `Final leaderboard: <${link}>`]);
}
