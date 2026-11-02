export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super("digilab_unavailable");
  }
}
