import { Phase } from "@aegis/shared/schema/enums";
import type { LogTurnGroup } from "@/game/log/LogEntry";
/* The fixed board the showcase renders: cards, permanents, hands, decisions, panels,
   notices and zone scenes, all built once so every case reads the same state. */

import { CardInstance, getCardDefinition, Permanent, type DecisionRequest, type Seat } from "@aegis/shared";
import { type HandEntry } from "../game/piece";
import type { LogLine } from "@/game/log/LogEntry";
import type { SecurityClashScene } from "../game/securityClash";
import type { PermanentBurst, ZoneShowcase as ZoneShowcaseModel } from "../game/showcases";
import { type MatchNotice } from "../game/notices";
import { type SidePanel } from "../game/sidePanels";
import { Side } from "../game/side";
import { type TranslationKey } from "../i18n";

export const CARDS = {
  egg: "ST1-01",
  rookie: "ST1-03",
  champion: "ST1-07",
  ultimate: "ST1-09",
  mega: "ST1-11",
  tamer: "BT1-085",
  option: "BT1-090",
  opponentChampion: "ST2-06",
  opponentUltimate: "ST2-08",
} as const;

function cardInstance(instanceId: string, cardId: string, ownerSeat: Seat = 0): CardInstance {
  const instance = new CardInstance();
  instance.instanceId = instanceId;
  instance.cardId = cardId;
  instance.ownerSeat = ownerSeat;
  return instance;
}

export function permanent({
  permanentId,
  cardId,
  baseDP,
  currentDP,
  seat = 0,
  suspended = false,
  summoningSick = false,
  stackCardIds = [],
  grantedKeywords = [],
  keywords = [],
}: {
  permanentId: string;
  cardId: string;
  baseDP: number;
  currentDP?: number;
  seat?: Seat;
  suspended?: boolean;
  summoningSick?: boolean;
  stackCardIds?: readonly string[];
  grantedKeywords?: readonly string[];
  /** Resolved active keywords, as the server projects them (drives the Blocker shield). */
  keywords?: readonly string[];
}): Permanent {
  const perm = new Permanent();
  perm.permanentId = permanentId;
  perm.controllerSeat = seat;
  perm.topCard = cardInstance(`${permanentId}-top`, cardId, seat);
  perm.baseDP = baseDP;
  perm.currentDP = currentDP ?? baseDP;
  perm.isSuspended = suspended;
  perm.summoningSick = summoningSick;
  perm.stack.push(...stackCardIds.map((id, index) => cardInstance(`${permanentId}-under-${index}`, id, seat)));
  perm.grantedKeywords.push(...grantedKeywords);
  perm.keywords.push(...keywords);
  return perm;
}

export function handEntry({
  index,
  cardId,
  playable = false,
  digivolveTargets = [],
}: {
  index: number;
  cardId: string;
  playable?: boolean;
  digivolveTargets?: readonly string[];
}): HandEntry {
  return {
    instanceId: `hand-${index}`,
    cardId,
    activatableEffectsJson: "",
    playableFromHand: playable,
    projectedPlayCost: -1,
    digivolveTargetPermanentIds: [...digivolveTargets],
    linkTargetPermanentIds: [],
  };
}

export const MIXED_HAND: HandEntry[] = [
  handEntry({ index: 0, cardId: CARDS.rookie, playable: true }),
  handEntry({ index: 1, cardId: CARDS.champion }),
  handEntry({ index: 2, cardId: CARDS.tamer, playable: true }),
  handEntry({ index: 3, cardId: CARDS.option }),
  handEntry({ index: 4, cardId: CARDS.ultimate, digivolveTargets: ["p-you-1"] }),
];

export const LARGE_HAND: HandEntry[] = Array.from({ length: 10 }, (_, index) =>
  handEntry({
    index,
    cardId: Object.values(CARDS)[index % Object.values(CARDS).length]!,
    playable: index % 3 === 0,
  }),
);

export const TARGET_DECISION: DecisionRequest = {
  decisionId: "showcase-decision",
  seat: 0,
  kind: "chooseTargets",
  promptText: "Delete 1 of your opponent's Digimon with 5000 DP or less.",
  sourceCardId: CARDS.option,
  options: {
    candidateInstanceIds: ["opp-1", "opp-2"],
    min: 1,
    max: 1,
    timing: "Main",
    effectText: "[Main] Delete 1 of your opponent's Digimon with 5000 DP or less.",
    // Server-projected: the badge on a picked target reads this, never the prompt.
    targetFate: "delete",
  },
};

export const TRIGGER_DECISION: DecisionRequest = {
  decisionId: "showcase-triggers",
  seat: 0,
  kind: "orderTriggers",
  promptText: "Choose one effect to activate",
  options: {
    triggerKeys: [`p-you-1-top::${CARDS.champion}/ir-0-0`, `p-you-2-top::${CARDS.ultimate}/ir-1-0`],
    triggerCardIds: [CARDS.champion, CARDS.ultimate],
    timing: "OnPlay",
  },
};

/** One permanent, two windows: the case that must never read as two copies. */
export const SAME_PERMANENT_TRIGGER_DECISION: DecisionRequest = {
  decisionId: "showcase-same-permanent-triggers",
  seat: 0,
  kind: "orderTriggers",
  promptText: "Choose one effect to activate",
  options: {
    triggerKeys: [`p-you-1-top::EX12-064/on-play`, `p-you-1-top::EX12-064/when-digivolving`],
    triggerCardIds: ["EX12-064", "EX12-064"],
    triggerTimings: ["OnPlay", "WhenDigivolving"],
    timing: "OnPlay",
  },
};

export const HAND_SELECTION_DECISION: DecisionRequest = {
  decisionId: "showcase-hand-selection",
  seat: 0,
  kind: "selectCards",
  promptText: "Select 2 cards to trash.",
  options: { candidateInstanceIds: ["hand-0", "hand-1", "hand-2"], min: 0, max: 2 },
};

/* The dual-colour and Blocker fixtures the persistent field badges are shown on. */
export const DUAL_COLOR_CARD = "AD1-004";

export const noop = () => {};

export const PERMANENTS = {
  champion: permanent({
    permanentId: "p-you-1",
    cardId: CARDS.champion,
    baseDP: 4000,
    currentDP: 6000,
    stackCardIds: [CARDS.egg, CARDS.rookie],
    keywords: ["Blocker", "SecurityAttack"],
    grantedKeywords: ["Blocker"],
  }),
};

export const INSPECTED_PERMANENT = permanent({
  permanentId: "p-opp-1",
  cardId: CARDS.opponentUltimate,
  baseDP: 7000,
  currentDP: 5000,
  seat: 1,
  stackCardIds: [CARDS.egg, CARDS.rookie, CARDS.opponentChampion],
  keywords: ["Blocker", "Piercing"],
  grantedKeywords: ["Piercing"],
});

const showcaseCardName = (cardId: string) => getCardDefinition(cardId)?.nameEn ?? cardId;

export const BATTLE_CLASH: SecurityClashScene = {
  key: 1,
  resolution: "battle",
  revealed: { cardId: CARDS.opponentChampion, side: Side.Opponent, dp: 4000 },
  attacker: { cardId: CARDS.champion, side: Side.Viewer, dp: 6000 },
};

export const SHOWCASE_LOG: LogLine[] = [
  { text: `You played ${showcaseCardName(CARDS.champion)}.`, kind: "you", cardIds: [CARDS.champion] },
  {
    text: `Opponent digivolved into ${showcaseCardName(CARDS.opponentUltimate)}.`,
    kind: "opp",
    cardIds: [CARDS.opponentUltimate],
  },
  { text: "Memory moved from -2 to +4.", kind: "sys" },
  { text: `Security check revealed ${showcaseCardName(CARDS.rookie)}.`, kind: "sys", cardIds: [CARDS.rookie] },
];

const SHOWCASE_NOW = 1_000;

function showcasePanel({
  id,
  titleKey,
  side = Side.Viewer,
  cardIds,
  ordered = false,
  age = 0,
}: {
  id: string;
  titleKey: TranslationKey;
  side?: SidePanel["side"];
  cardIds: readonly string[];
  ordered?: boolean;
  age?: number;
}): SidePanel {
  return {
    id,
    titleKey,
    side,
    cards: cardIds.map((cardId, index) => ({ cardId, badge: index + 1 })),
    ordered,
    createdAt: SHOWCASE_NOW - age,
  };
}

export const PANEL_CASES: { label: string; panels: SidePanel[] }[] = [
  {
    label: "Discarded cards (viewer)",
    panels: [showcasePanel({ id: "discard", titleKey: "panel.discardedCards", cardIds: [CARDS.rookie, CARDS.option] })],
  },
  {
    label: "Cards added to hand (viewer)",
    panels: [showcasePanel({ id: "hand", titleKey: "panel.cardsAddedToHand", cardIds: [CARDS.champion] })],
  },
  {
    label: "Selected Cards (viewer)",
    panels: [
      showcasePanel({
        id: "selected",
        titleKey: "panel.selectedCards",
        cardIds: [CARDS.tamer, CARDS.mega],
        ordered: true,
      }),
    ],
  },
  {
    label: "Revealed Cards (opponent, numbered)",
    panels: [
      showcasePanel({
        id: "revealed",
        titleKey: "panel.revealedCards",
        side: Side.Opponent,
        cardIds: [CARDS.opponentChampion, CARDS.opponentUltimate, CARDS.egg],
        ordered: true,
      }),
    ],
  },
  {
    label: "Deleted cards (opponent)",
    panels: [
      showcasePanel({
        id: "deleted",
        titleKey: "panel.deletedCards",
        side: Side.Opponent,
        cardIds: [CARDS.opponentUltimate],
      }),
    ],
  },
  {
    label: "Played Card (opponent)",
    panels: [
      showcasePanel({
        id: "played",
        titleKey: "panel.playedCard",
        side: Side.Opponent,
        cardIds: [CARDS.opponentChampion],
      }),
    ],
  },
  {
    label: "Deck Bottom Card (viewer)",
    panels: [showcasePanel({ id: "deck-bottom", titleKey: "panel.deckBottomCard", cardIds: [CARDS.ultimate] })],
  },
  {
    label: "Digivolution Cards (opponent)",
    panels: [
      showcasePanel({
        id: "digivolution",
        titleKey: "panel.digivolutionCards",
        side: Side.Opponent,
        cardIds: [CARDS.egg, CARDS.rookie, CARDS.champion],
        ordered: true,
      }),
    ],
  },
];

function showcaseNotice(id: string, body: MatchNotice["body"], overrides: Partial<MatchNotice> = {}): MatchNotice {
  return { id, side: Side.Viewer, fromSecurity: false, body, createdAt: SHOWCASE_NOW, ...overrides };
}

export const NOTICE_CASES: { label: string; notices: MatchNotice[] }[] = [
  {
    label: "viewer's effect",
    notices: [
      showcaseNotice("effect-you", {
        variant: "effect",
        cardId: CARDS.option,
        timing: "Main",
        description: "Delete 1 of your opponent's Digimon with 5000 DP or less.",
      }),
    ],
  },
  {
    label: "opponent's effect",
    notices: [
      showcaseNotice(
        "effect-opp",
        {
          variant: "effect",
          cardId: CARDS.opponentUltimate,
          timing: "WhenDigivolving",
          description: "Draw 1 card.",
        },
        { side: Side.Opponent },
      ),
    ],
  },
  {
    label: "security effect",
    notices: [
      showcaseNotice(
        "effect-security",
        {
          variant: "effect",
          cardId: CARDS.mega,
          timing: "Security",
          description: "Play this card without paying its memory cost.",
        },
        { fromSecurity: true },
      ),
    ],
  },
  {
    label: "DigiXros call-out (pink pill)",
    notices: [showcaseNotice("keyword", { variant: "keyword", keyword: "digiXros", cardId: CARDS.mega })],
  },
  {
    label: "recovery and refusal",
    notices: [
      showcaseNotice("recovery", { variant: "recovery", amount: 2 }),
      showcaseNotice("rejection", { variant: "rejection", reason: "It is not your turn." }),
    ],
  },
];

export function showcaseBurst(
  variant: PermanentBurst["variant"],
  overrides: Partial<PermanentBurst> = {},
): PermanentBurst {
  return { key: 1, permanentId: "p-burst", variant, color: "Blue", inBreeding: false, ...overrides };
}

export const ZONE_SHOWCASES: { label: string; showcase: ZoneShowcaseModel }[] = [
  {
    label: "opponent played a card",
    showcase: { key: 1, cardId: CARDS.opponentChampion, seat: 1, mine: false, kind: "play", color: "Blue" },
  },
  {
    label: "opponent digivolved in breeding",
    showcase: { key: 2, cardId: CARDS.opponentChampion, seat: 1, mine: false, kind: "digivolve", color: "Blue" },
  },
];

export const SHOWCASE_LOG_TURNS: readonly LogTurnGroup[] = [
  {
    turnCount: 1,
    turnSeat: 0,
    phases: [
      {
        phase: Phase.Main,
        entries: [...SHOWCASE_LOG]
          .reverse()
          .map((line, index) => ({ ...line, id: `fixture-${index}`, turnCount: 1, turnSeat: 0, phase: Phase.Main })),
      },
    ],
  },
];
