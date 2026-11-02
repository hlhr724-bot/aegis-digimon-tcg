export const RankedDiscordStatus = {
  PENDING: { name: "PENDING", value: "pending" },
  SYNCED: { name: "SYNCED", value: "synced" },
} as const;
export type RankedDiscordStatus = (typeof RankedDiscordStatus)[keyof typeof RankedDiscordStatus]["value"];
