import type { DiscordPlayer } from "#api/tournaments/discord/DiscordPlayer";

export function formatDiscordPlayer(player: DiscordPlayer): string {
  if (player.discordUserId) {
    return `<@${player.discordUserId}>`;
  }
  return `**${player.name.replace(/[\\*_~`|>@#:<]/g, (character) => `\\${character}`)}**`;
}
