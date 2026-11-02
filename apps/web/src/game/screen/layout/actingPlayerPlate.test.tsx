// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CombatWindow, GameState, PendingDecision } from "@aegis/shared/schema/GameState";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import { I18nProvider } from "@/i18n/I18nProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { getActingPlateKeys } from "@/game/getActingPlateKeys";
import { OpponentBar } from "@/game/screen/layout/OpponentBar";
import { PlayerLine } from "@/game/screen/layout/PlayerLine";

type StateParams = {
  turnSeat: Seat;
  configure?: (state: GameState) => void;
};

type BoardParams = {
  state: GameState;
  viewerSeat: Seat;
  spectating?: boolean;
};

function buildState({ turnSeat, configure }: StateParams) {
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = turnSeat;
  configure?.(state);
  return state;
}

function Plates({ state, viewerSeat, spectating = false }: BoardParams) {
  const { t } = useTranslation();
  const keys = getActingPlateKeys({ state, displayedTurnSeat: state.turnSeat as Seat, viewerSeat, spectating });
  return (
    <>
      <OpponentBar
        spectating={spectating}
        handStripRef={createRef<HTMLDivElement>()}
        opponentName="Rival"
        opponentAvatarId=""
        viewerSeat={viewerSeat}
        displayedTurnSeat={state.turnSeat as Seat}
        displayedTurnCount={3}
        actingLabel={keys.opponent ? t(keys.opponent) : undefined}
        phase={Phase.Main}
        memory={0}
        eggDeckCount={5}
        handCount={4}
        deckCount={30}
        trashCount={0}
        portraitArena={false}
        narrowGameLayout={false}
        skippable={false}
        onOpenLog={() => undefined}
        onReportBug={() => undefined}
        onOpenArenaLook={() => undefined}
        onSurrender={() => undefined}
        onSkipPresentation={() => undefined}
      />
      <PlayerLine name="Tamer" side="player" actingLabel={keys.viewer ? t(keys.viewer) : undefined} />
    </>
  );
}

function renderPlates(params: BoardParams) {
  render(
    <I18nProvider>
      <Plates {...params} />
    </I18nProvider>,
  );
  return {
    viewerChip: screen.queryByTestId("player-acting"),
    opponentChip: screen.queryByTestId("opponent-acting"),
    viewerPlate: document.querySelector('.game-player-line[data-side="player"]'),
    opponentPlate: document.querySelector('.game-player-line[data-side="opponent"]'),
  };
}

afterEach(cleanup);

describe("the acting player's plate", () => {
  it("marks the viewer's plate during the viewer's turn", () => {
    const plates = renderPlates({ state: buildState({ turnSeat: 0 }), viewerSeat: 0 });
    expect(plates.viewerChip?.textContent).toBe("Your move");
    expect(plates.viewerPlate?.hasAttribute("data-acting")).toBe(true);
    expect(plates.opponentChip).toBeNull();
    expect(plates.opponentPlate?.hasAttribute("data-acting")).toBe(false);
  });

  it("marks the opponent's plate during the opponent's turn", () => {
    const plates = renderPlates({ state: buildState({ turnSeat: 1 }), viewerSeat: 0 });
    expect(plates.opponentChip?.textContent).toBe("Their move");
    expect(plates.opponentPlate?.hasAttribute("data-acting")).toBe(true);
    expect(plates.viewerChip).toBeNull();
  });

  it("moves to the viewer's plate when the viewer must decide on the opponent's turn", () => {
    const state = buildState({
      turnSeat: 1,
      configure: (draft) => {
        draft.pendingDecision = Object.assign(new PendingDecision(), { decisionId: "d", seat: 0, kind: "optional" });
      },
    });
    const plates = renderPlates({ state, viewerSeat: 0 });
    expect(plates.viewerChip?.textContent).toBe("Your move");
    expect(plates.opponentChip).toBeNull();
  });

  it("follows the seat that must answer a combat window", () => {
    const state = buildState({
      turnSeat: 0,
      configure: (draft) => {
        draft.combatWindow = Object.assign(new CombatWindow(), { seat: 1 });
      },
    });
    const plates = renderPlates({ state, viewerSeat: 0 });
    expect(plates.opponentChip?.textContent).toBe("Their move");
    expect(plates.viewerChip).toBeNull();
  });

  it("shows a spectator which named player acts without addressing them as a player", () => {
    const viewerTurn = renderPlates({ state: buildState({ turnSeat: 0 }), viewerSeat: 0, spectating: true });
    expect(viewerTurn.viewerChip?.textContent).toBe("To move");
    expect(viewerTurn.opponentChip).toBeNull();
    cleanup();
    const opponentTurn = renderPlates({ state: buildState({ turnSeat: 1 }), viewerSeat: 0, spectating: true });
    expect(opponentTurn.opponentChip?.textContent).toBe("To move");
    expect(opponentTurn.viewerChip).toBeNull();
  });

  it("marks nobody once the match is over", () => {
    const state = buildState({
      turnSeat: 0,
      configure: (draft) => {
        draft.gameOver = true;
      },
    });
    const plates = renderPlates({ state, viewerSeat: 0 });
    expect(plates.viewerChip).toBeNull();
    expect(plates.opponentChip).toBeNull();
  });
});

describe("equipped player frames", () => {
  it("shows the opponent's equipped frame and leaves unequipped players unframed", () => {
    const { container } = render(
      <I18nProvider>
        <PlayerLine name="Framed opponent" side="opponent" equippedRankedTier="diamond" />
        <PlayerLine name="Unequipped player" side="player" />
        <PlayerLine name="Invalid frame" side="opponent" equippedRankedTier="invalid" />
      </I18nProvider>,
    );
    const frames = container.querySelectorAll(".game-player-line__avatar.ranked-equipped");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.getAttribute("data-tier")).toBe("diamond");
    expect(frames[0]!.closest(".game-player-line")?.getAttribute("data-side")).toBe("opponent");
  });
});
