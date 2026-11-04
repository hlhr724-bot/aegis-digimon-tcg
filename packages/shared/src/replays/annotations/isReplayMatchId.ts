const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReplayMatchId(value: unknown): value is string {
  return typeof value === "string" && MATCH_ID.test(value);
}
