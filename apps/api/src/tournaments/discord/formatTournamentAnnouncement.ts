import type { DiscordMessage } from "#api/tournaments/discord/DiscordRestClient";

type Params = {
  name: string;
  description: string;
  link: string;
  format: string;
  startsAt: number;
  maxPlayers: number;
  registeredCount: number;
  bestOf: number;
};

const DESCRIPTION_LIMIT = 1000;

export function formatTournamentAnnouncement(params: Params): DiscordMessage {
  const startsAt = Math.floor(params.startsAt / 1000);
  return {
    content: `A new tournament is open for registration: **${params.name.slice(0, 200)}**`,
    embeds: [
      {
        title: params.name.slice(0, 256),
        url: params.link,
        description: params.description.slice(0, DESCRIPTION_LIMIT) || undefined,
        fields: [
          { name: "Starts", value: `<t:${startsAt}:F> (<t:${startsAt}:R>)`, inline: false },
          { name: "Format", value: params.format, inline: true },
          { name: "Matches", value: `Best of ${params.bestOf}`, inline: true },
          { name: "Players", value: `${params.registeredCount}/${params.maxPlayers}`, inline: true },
        ],
        footer: { text: "Pairings and results will be posted in this tournament channel." },
      },
    ],
  };
}
