import type { DiscordMessage } from "#api/tournaments/discord/DiscordRestClient";

const MESSAGE_LIMIT = 2000;
const MENTION = /<@(\d+)>/g;

export function chunkDiscordLines(lines: readonly string[]): DiscordMessage[] {
  const messages: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > MESSAGE_LIMIT && current) {
      messages.push(current);
      current = line.slice(0, MESSAGE_LIMIT);
      continue;
    }
    current = candidate.slice(0, MESSAGE_LIMIT);
  }
  if (current) {
    messages.push(current);
  }
  return messages.map((content) => ({
    content,
    allowedUserIds: [...new Set([...content.matchAll(MENTION)].map((match) => match[1]!))].slice(0, 100),
  }));
}
