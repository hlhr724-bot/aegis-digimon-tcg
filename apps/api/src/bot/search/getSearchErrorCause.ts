import type { LiveSearchErrorStage } from "#api/bot/search/LiveSearchErrorStage";

const MAX_CAUSE_LENGTH = 120;

type Params = { error: unknown; stage: LiveSearchErrorStage };

export function getSearchErrorCause({ error, stage }: Params): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${stage}: ${message.replace(/\d+/g, "#")}`.slice(0, MAX_CAUSE_LENGTH);
}
