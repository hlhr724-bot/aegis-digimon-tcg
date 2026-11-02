export class DiscordRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs: number;

  constructor(status: number, retryAfterMs = 0) {
    super(`discord_${status}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
