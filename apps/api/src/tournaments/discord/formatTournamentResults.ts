import { chunkDiscordLines } from "#api/tournaments/discord/chunkDiscordLines";
import type { DiscordMessage } from "#api/tournaments/discord/DiscordRestClient";
import { formatDiscordPlayer } from "#api/tournaments/discord/formatDiscordPlayer";
import { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";
import type { TournamentPlacement } from "#api/tournaments/discord/TournamentPlacement";

type Params = { name: string; link: string; placements: readonly TournamentPlacement[] };

const LABELS = {
  [TournamentDiscordRole.CHAMPION.value]: "Champion",
  [TournamentDiscordRole.TOP_FOUR.value]: "Top 4",
  [TournamentDiscordRole.TOP_EIGHT.value]: "Top 8",
} as const;

export function formatTournamentResults({ name, link, placements }: Params): DiscordMessage[] {
  const lines = Object.entries(LABELS).flatMap(([role, label]) => {
    const players = placements.filter((placement) => placement.role === role);
    return players.length
      ? [`**${label}:** ${players.map(({ player }) => formatDiscordPlayer(player)).join(", ")}`]
      : [];
  });
  return chunkDiscordLines([`## ${name} has finished`, ...lines, `Final standings: <${link}>`]);
}
