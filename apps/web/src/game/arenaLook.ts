/* The match board's look: the chosen board colors and battlefield, read from the
   same stores the arena look settings write, so a change there repaints the board
   live. The art and the palette ride as custom properties; the stylesheet layers
   them under the board (style/redesignArena.css). */

import { useMemo, type CSSProperties } from "react";
import { getCardDefinition, type PlayerState } from "@aegis/shared";
import { arenaPaletteStyle, useArenaPalette, type ArenaDeckColors } from "../design/arenaPalette";
import { resolveBattlefield, useBattlefieldId } from "../design/battlefield";
import { useMediaQuery } from "../design/useMediaQuery";
import { PORTRAIT_ARENA_QUERY } from "./screen/queries";
import type { ArenaEnvironment } from "@/game/arena3d/ArenaEnvironment";
import { arenaEnvironmentPreference } from "@/game/arena3d/arenaEnvironmentPreference";
import { resolveArenaEnvironment } from "@/game/arena3d/resolveArenaEnvironment";

export interface ArenaBoardLook {
  /** Palette and art custom properties for the element that holds the board. */
  style: CSSProperties;
  /** A battlefield image sits under the board, so the board surface turns to glass. */
  hasArt: boolean;
  artSrc: string | undefined;
  environment: ArenaEnvironment;
  deckColors: ArenaDeckColors;
}

type VisibleCards = Pick<PlayerState, "battleArea" | "breeding" | "trash" | "hand">;

/**
 * A synchronized zone as a plain array. ArraySchema has no flatMap, and a zone this
 * client may not see (the opponent's hand) arrives undefined.
 */
function cardsIn<T>(zone: Iterable<T> | undefined): T[] {
  return Array.from(zone ?? []);
}

/**
 * The color a player's visible cards print most often, standing in for the deck's
 * main color: decks are not synchronized, but the field, the raising area, the
 * trash and the viewer's own hand already show what a deck is built around.
 */
export function mainCardColor(player: VisibleCards | undefined): string | undefined {
  if (!player) return undefined;
  const cardIds = [
    ...cardsIn(player.battleArea).flatMap((permanent) => [
      permanent.topCard?.cardId,
      ...cardsIn(permanent.stack).map((card) => card.cardId),
    ]),
    player.breeding?.topCard?.cardId,
    ...cardsIn(player.trash).map((card) => card.cardId),
    ...cardsIn(player.hand).map((card) => card.cardId),
  ];
  const tally = new Map<string, number>();
  for (const cardId of cardIds) {
    const color = cardId ? getCardDefinition(cardId)?.colors[0] : undefined;
    if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [color, count] of tally) if (best === undefined || count > tally.get(best)!) best = color;
  return best;
}

export function useArenaBoardLook({
  viewer,
  opponent,
  matchKey,
}: {
  viewer: VisibleCards | undefined;
  opponent: VisibleCards | undefined;
  /** Keeps a random battlefield on one scene for the whole match. */
  matchKey?: string;
}): ArenaBoardLook {
  const playerColor = mainCardColor(viewer);
  const opponentColor = mainCardColor(opponent);
  const palette = useArenaPalette({ player: playerColor, opponent: opponentColor });
  const battlefield = resolveBattlefield(useBattlefieldId(), matchKey);
  const environment = resolveArenaEnvironment({ choice: arenaEnvironmentPreference.useChoice(), matchKey });
  const portrait = useMediaQuery(PORTRAIT_ARENA_QUERY);
  const art = portrait ? (battlefield.portraitSrc ?? battlefield.src) : battlefield.src;
  return useMemo(
    () => ({
      style: {
        ...arenaPaletteStyle(palette),
        "--arena-art": art ? `url("${art}")` : "none",
      } as CSSProperties,
      hasArt: Boolean(art),
      artSrc: art,
      environment,
      deckColors: { player: playerColor, opponent: opponentColor },
    }),
    [palette, art, environment, playerColor, opponentColor],
  );
}
