import { DiscordRequestError } from "#api/tournaments/discord/DiscordRequestError";

type Params = { error: unknown; attempts: number; now: number };

const MAX_BACKOFF_MS = 3_600_000;

export function getDiscordRetryAt({ error, attempts, now }: Params): number {
  const backoff = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.min(attempts, 6));
  const retryAfter = error instanceof DiscordRequestError ? error.retryAfterMs : 0;
  return now + Math.max(backoff, retryAfter);
}
