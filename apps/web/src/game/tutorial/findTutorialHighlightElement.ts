import type { GameState, Seat } from "@aegis/shared";
import { TutorialHighlightKind } from "@aegis/shared/tutorial/TutorialHighlightKind";
import type { TutorialHighlight } from "@aegis/shared/tutorial/TutorialStep";
import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";

type Params = { highlight: TutorialHighlight; state: GameState; viewerSeat: Seat; root: ParentNode };

function findVisible(root: ParentNode, selector: string): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector));
  return candidates.find((element) => element.getClientRects().length > 0) ?? null;
}

type PermanentSelectorParams = { state: GameState; seat: Seat; cardId: string; drop: string };

function getPermanentSelector({ state, seat, cardId, drop }: PermanentSelectorParams): string | undefined {
  const permanent = state.players[seat]?.battleArea.find((entry) => entry.topCard?.cardId === cardId);
  return permanent ? `[data-drop="${drop}"][data-id="${permanent.permanentId}"]` : undefined;
}

export function findTutorialHighlightElement({ highlight, state, viewerSeat, root }: Params): HTMLElement | null {
  const opponentSeat: Seat = viewerSeat === 0 ? 1 : 0;
  let selector: string | undefined;
  switch (highlight.kind) {
    case TutorialHighlightKind.HAND_CARD.value:
      selector = `[data-hand-card-id="${highlight.cardId}"]`;
      break;
    case TutorialHighlightKind.FIELD_CARD.value:
      selector = getPermanentSelector({ state, seat: viewerSeat, cardId: highlight.cardId, drop: "perm-you" });
      break;
    case TutorialHighlightKind.OPPONENT_FIELD_CARD.value:
      selector = getPermanentSelector({ state, seat: opponentSeat, cardId: highlight.cardId, drop: "perm-opp" });
      break;
    case TutorialHighlightKind.BREEDING.value:
      selector = `[data-arena-region="${ArenaInputRegion.BREEDING.value}"]`;
      break;
    case TutorialHighlightKind.MEMORY.value:
      selector = ".game-memory-gauge";
      break;
    case TutorialHighlightKind.END_TURN.value:
      selector = ".game-end-turn-orb";
      break;
    case TutorialHighlightKind.OPPONENT_SECURITY.value:
      selector = '[data-drop="opp-security"]';
      break;
  }
  return selector ? findVisible(root, selector) : null;
}
