import type { PermanentSpec, ScenarioFixture } from "#api/engine/scenario/types";
import type { StoryCatalogDeck } from "@aegis/shared/story/StoryCatalogDeck";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";
import { StoryDifficulty } from "@aegis/shared/story/StoryDifficulty";
import { getStoryScenarioDeck } from "#api/story/getStoryScenarioDeck";
import { seitenGokuumonStoryDeck } from "#api/story/decks/seitenGokuumonStoryDeck";
import { buildStoryOpponentPermanent } from "#api/story/buildStoryOpponentPermanent";

type Params = { battleId: string };

type SeatParams = {
  deck: Pick<StoryCatalogDeck, "main" | "eggs">;
  security: number;
  level?: number | null;
  opponent?: string;
};

const handSize = 5;

function createSeat({ deck, security, level, opponent = "" }: SeatParams) {
  let cards = deck.main.flatMap(([card, count]) => Array.from({ length: count }, () => card));
  const battleArea: PermanentSpec[] = [];
  const built = level ? buildStoryOpponentPermanent({ cards, level, opponent }) : undefined;
  if (built) {
    battleArea.push(built.permanent);
    cards = built.remaining;
  }
  return {
    hand: cards.slice(0, handSize),
    security: cards.slice(handSize, handSize + security),
    deck: cards.slice(handSize + security),
    eggDeck: deck.eggs.flatMap(([card, count]) => Array.from({ length: count }, () => card)),
    battleArea,
  };
}

export function getCatalogStoryScenario({ battleId }: Params): ScenarioFixture | undefined {
  const battle = catalogStoryBattles.find((entry) => entry.id === battleId);
  if (!battle?.opponentDeckRef || !battle.playerDeckRef) {
    return undefined;
  }
  const difficulty = getStoryBattleDifficulty({ battleId }) ?? StoryDifficulty.INTRO;
  return {
    name: battle.id,
    memory: 0,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: true,
    presentation: { timed: false },
    board: {
      0: createSeat({ deck: getStoryScenarioDeck({ ref: battle.playerDeckRef }), security: difficulty.playerSecurity }),
      1: createSeat({
        deck: battle.id === "bb13" ? seitenGokuumonStoryDeck : getStoryScenarioDeck({ ref: battle.opponentDeckRef }),
        security: difficulty.opponentSecurity,
        level: difficulty.opponentLevel,
        opponent: battle.opponent,
      }),
    },
  };
}
