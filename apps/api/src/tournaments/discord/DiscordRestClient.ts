export type DiscordMessage = {
  content?: string;
  embeds?: readonly Record<string, unknown>[];
  allowedUserIds?: readonly string[];
};

export type EnsureTournamentChannelParams = {
  referenceChannelId: string;
  guildId?: string;
  name: string;
  topic: string;
};

export type DiscordRestClient = {
  postMessage(channelId: string, message: DiscordMessage): Promise<{ id: string }>;
  ensureTournamentChannel(params: EnsureTournamentChannelParams): Promise<{ id: string; guildId: string }>;
  addMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  removeMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
};
