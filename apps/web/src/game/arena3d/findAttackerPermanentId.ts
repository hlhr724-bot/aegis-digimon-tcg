import type { Permanent } from "@aegis/shared";

type Params = {
  battleArea: Iterable<Permanent> | undefined;
  cardId: string;
};

export function findAttackerPermanentId({ battleArea, cardId }: Params): string | undefined {
  for (const permanent of battleArea ?? []) {
    if (permanent.topCard?.cardId === cardId) {
      return permanent.permanentId;
    }
  }
  return undefined;
}
