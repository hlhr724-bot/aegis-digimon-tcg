import { chunkDiscordLines } from "#api/tournaments/discord/chunkDiscordLines";
import type { DiscordMessage } from "#api/tournaments/discord/DiscordRestClient";
import { formatDiscordPlayer } from "#api/tournaments/discord/formatDiscordPlayer";
import type { TournamentRoundPairing } from "#api/tournaments/discord/TournamentRoundPairing";

type Params = { title: string; link: string; pairings: readonly TournamentRoundPairing[] };

export function formatTournamentRound({ title, link, pairings }: Params): DiscordMessage[] {
  const lines = pairings.map(({ table, players }) => {
    const [first, second] = players.map(formatDiscordPlayer);
    return second ? `Table ${table}: ${first} vs ${second}` : `Table ${table}: ${first} has a bye`;
  });
  return chunkDiscordLines([`## ${title}`, ...lines, `Play your match: <${link}>`]);
}
