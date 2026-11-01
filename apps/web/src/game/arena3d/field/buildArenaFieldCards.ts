import type { CardInstance, Permanent } from "@aegis/shared";
import type { ArenaFieldCard } from "@/game/arena3d/field/ArenaFieldCard";
import { ARENA_VISIBLE_SOURCE_LIMIT } from "@/game/arena3d/field/arenaCardStackLayout";
import { buildArenaCardUrls } from "@/game/arena3d/field/buildArenaCardUrls";

type Params = {
  permanents: Iterable<Permanent | undefined>;
  backUrl: string;
};

function buildInstanceUrls(card: CardInstance | undefined, backUrl: string): readonly string[] {
  return buildArenaCardUrls({ cardId: card?.cardId, artId: card?.artId, faceUp: card?.faceUp !== false, backUrl });
}

export function buildArenaFieldCards({ permanents, backUrl }: Params): ReadonlyMap<string, ArenaFieldCard> {
  const cards = new Map<string, ArenaFieldCard>();
  for (const permanent of permanents) {
    if (!permanent?.topCard) {
      continue;
    }
    cards.set(permanent.permanentId, {
      topUrls: buildInstanceUrls(permanent.topCard, backUrl),
      sourceUrls: Array.from(permanent.stack ?? [], (card) => buildInstanceUrls(card, backUrl)).slice(
        0,
        ARENA_VISIBLE_SOURCE_LIMIT,
      ),
      linkUrls: Array.from(permanent.linked ?? [], (card) => buildInstanceUrls(card, backUrl)),
    });
  }
  return cards;
}
