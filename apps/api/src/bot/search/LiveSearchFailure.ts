import type { LiveSearchFallback } from "#api/bot/search/LiveSearchFallback";

export class LiveSearchFailure extends Error {
  readonly fallback: LiveSearchFallback;

  constructor({ fallback, message }: { fallback: LiveSearchFallback; message: string }) {
    super(message);
    this.name = "LiveSearchFailure";
    this.fallback = fallback;
  }
}
