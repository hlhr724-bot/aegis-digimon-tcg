/* Visual preview of the current arena, using the real match screen without a server. */
import { PHASES } from "../game/screen/constants";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  CATALOG_DECKS,
  CardInstance,
  CardKind,
  GameState,
  Permanent,
  Phase,
  PlayerState,
  getCardDefinition,
  splitPrintedClauses,
  type DecisionRequest,
  type DecisionResponse,
  type Seat,
  type ServerEvent,
} from "@aegis/shared";
import {
  BATTLEFIELDS,
  battlefieldById,
  getBattlefieldId,
  setBattlefieldId,
  subscribeBattlefield,
} from "../design/battlefield";
import { singleServerBatch, type ServerBatch } from "../net/serverBatches";
import { SECURITY_CHECK_REPLAY } from "./securityCheckReplay";
import { GameScreen } from "../game/GameScreen";
import { TIMINGS } from "../game/timings";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import { createArenaCrowdedDemoState, type CrowdedTamers } from "./arenaDemoCrowded";
import { createArenaSecurityDemoState } from "./arenaDemoSecurity";
import { prepareDemoCombat } from "./arenaDemoCombat";
import { ArenaKeywordEditor } from "./ArenaKeywordEditor";
import { ArenaDemoTools } from "./ArenaDemoTools";
import { ArenaVisualPlayer } from "./ArenaVisualPlayer";
import { useArenaVisualPlayback } from "./arenaVisualPlayback";
import {
  applyDemoKeywordGrants,
  demoDigimon,
  demoKeywordLabels,
  removeDemoKeywordGrant,
  upsertDemoKeywordGrant,
  type DemoKeywordGrants,
} from "./arenaDemoKeywords";
import "./arenaDemo.css";

function card(cardId: string, instanceId: string, ownerSeat: Seat): CardInstance {
  const result = new CardInstance();
  result.cardId = cardId;
  result.instanceId = instanceId;
  result.ownerSeat = ownerSeat;
  return result;
}

function fighter(cardId: string, permanentId: string, seat: Seat, sources: string[] = []): Permanent {
  const result = new Permanent();
  result.permanentId = permanentId;
  result.controllerSeat = seat;
  result.topCard = card(cardId, `${permanentId}-top`, seat);
  result.baseDP = getCardDefinition(cardId)?.dp ?? 0;
  result.currentDP = result.baseDP;
  result.stack.push(...sources.map((id, index) => card(id, `${permanentId}-source-${index}`, seat)));
  return result;
}

function previewHandSize(parameter: "hand" | "opponentHand"): number {
  const requested = Number(new URLSearchParams(window.location.search).get(parameter) ?? 5);
  return Number.isInteger(requested) ? Math.max(1, Math.min(30, requested)) : 5;
}

type DemoPermanent = {
  cardId: string;
  id: string;
  sources?: readonly string[];
  suspended?: boolean;
  /** Rules text of the effects the demo offers in the card's action row. */
  activatable?: readonly string[];
};

/** How many notices the burst preview raises, one per server batch. */
const NOTICE_BURST_COUNT = 4;

/** The gap between them: long enough to read one arriving, short enough that they overlap. */
const NOTICE_BURST_GAP_MS = 700;
/* Stands in for the server's own pacing: the real batches were 0.5-3 s apart. */
const SECURITY_REPLAY_GAP_MS = 750;
/* Matches the `cardPlayed` in the replay, so the client binds its entrance to this permanent. */
const SECURITY_TAMER_CARD_ID = "BT10-087";
const SECURITY_TAMER_PERMANENT_ID = "perm-4";

/* The gaps of the notice-ordering preview, one per beat. They stand in for the server's
   own pacing in the match this preview reproduces: the declaration, then the trigger the
   attack fired, then the check, then the turn change — each far enough apart to be read,
   close enough that the previous toasts are still on screen when the next beat lands. */
const NOTICE_ORDER_GAPS_MS = [0, 1200, 1700, 2200] as const;
/** The opponent's Digimon on the demo board whose [All Turns] clause the preview plays. */
const PLUTOMON_CARD_ID = "BT26-059";
/* The gap between Plutomon's clause and the deletion it carries out. Long enough that the
   card is seen to light up and the clause is seen to arrive before anything leaves the
   board, which is the order a real batch presents them in. */
const PLUTOMON_GAPS_MS = [0, 1400] as const;

/* The card the scripted check turns up. A Digimon, so the reveal plays its battle. */
const NOTICE_ORDER_SECURITY_CARD_ID = "BT1-010";

const ARENA_DECKS: readonly {
  recipeId: string;
  name: string;
  breeding: DemoPermanent;
  battle: readonly DemoPermanent[];
  hand: readonly string[];
  trash: readonly string[];
}[] = [
  {
    recipeId: "bt26-dgo-2026-08-28-7-chronomon",
    name: "BT26 Chronomon",
    breeding: { cardId: "BT26-009", id: "you-breeding", sources: ["BT26-001"] },
    battle: [
      {
        cardId: "BT26-016",
        id: "you-chronomon",
        sources: ["BT26-001", "BT26-009", "BT26-011", "BT26-015"],
        activatable: [
          "[Main] Activate this Digimon's effect",
          "[Main] By suspending this Digimon, you may play 1 red Tamer card from your hand without paying the cost",
        ],
      },
      { cardId: "BT26-009", id: "you-hyokomon" },
      {
        cardId: "BT26-092",
        id: "you-shota",
        activatable: ["[Main] Draw 1"],
      },
    ],
    hand: ["BT26-009", "BT26-011", "BT26-016", "BT26-087", "BT8-095"],
    trash: ["BT26-015", "BT8-095"],
  },
  {
    recipeId: "bt26-dgo-2026-08-28-8-plutomon",
    name: "BT26 Plutomon",
    breeding: {
      cardId: "BT26-066",
      id: "opponent-breeding",
      sources: ["BT24-007"],
    },
    battle: [
      {
        cardId: "BT26-059",
        id: "opponent-plutomon",
        sources: ["BT24-007", "BT26-066", "BT26-069", "BT26-074"],
      },
      { cardId: "BT26-069", id: "opponent-dobermon", suspended: true },
      { cardId: "BT24-088", id: "opponent-asuna" },
    ],
    hand: ["BT26-059", "BT26-079", "BT26-074", "BT26-056", "BT26-100"],
    trash: ["BT26-074", "BT26-100"],
  },
];

function previewRecipe(recipeId: string) {
  const recipe = CATALOG_DECKS.find((deck) => deck.deckId === recipeId);
  if (!recipe) throw new Error(`Unknown arena demo deck: ${recipeId}`);
  return recipe;
}

export function createArenaDemoState(
  drawCounts: readonly [number, number] = [0, 0],
  crowdedTamers?: CrowdedTamers,
  hatchSeats: readonly [boolean, boolean] = [false, false],
): GameState {
  const scenario = new URLSearchParams(window.location.search).get("scenario");
  if (scenario === "security") return createArenaSecurityDemoState(drawCounts);
  if (scenario === "crowded") return createArenaCrowdedDemoState(drawCounts, crowdedTamers);
  const state = new GameState();
  state.matchId = "arena-demo";
  const timerPreview = new URLSearchParams(window.location.search).get("timer");
  if (timerPreview === "on" || timerPreview === "low") {
    state.matchTimer = true;
    state.timerRemaining0 = timerPreview === "low" ? 20 : 272;
    state.timerRemaining1 = 228;
    state.timerActiveSeat = 0;
    state.inactivitySeat = 0;
    state.inactivityRemainingSeconds = timerPreview === "low" ? 25 : 90;
  }
  state.phase = Phase.Main;
  state.turnCount = 5;
  state.turnSeat = 0;
  state.memory = 3;

  for (const seat of [0, 1] as const) {
    const preview = ARENA_DECKS[seat]!;
    const recipe = previewRecipe(preview.recipeId);
    const remaining = [...recipe.decklist.mainDeck];
    const eggs = [...recipe.decklist.eggDeck];
    function take(cardId: string) {
      const pool = getCardDefinition(cardId)?.kinds.includes(CardKind.DigiEgg) ? eggs : remaining;
      const index = pool.indexOf(cardId);
      if (index < 0) throw new Error(`Arena demo uses too many copies of ${cardId} from ${recipe.deckId}`);
      pool.splice(index, 1);
      return cardId;
    }
    function permanent(piece: DemoPermanent) {
      const result = fighter(take(piece.cardId), piece.id, seat, piece.sources?.map((cardId) => take(cardId)) ?? []);
      result.isSuspended = piece.suspended ?? false;
      result.activatableEffectsJson = piece.activatable
        ? JSON.stringify(
            piece.activatable.map((description, index) => ({
              instanceId: result.topCard.instanceId,
              effectKey: `${piece.cardId}/${index}`,
              description,
            })),
          )
        : "";
      return result;
    }
    const player = new PlayerState();
    player.seat = seat;
    player.displayName = preview.name;
    player.avatarId = seat === 0 ? "herculeskabuterimon" : "piximon";
    player.sessionId = `arena-demo-${seat}`;
    if (scenario === "hatch") {
      if (hatchSeats[seat]) {
        player.breeding = permanent({ cardId: preview.breeding.sources![0]!, id: `hatch-${seat}` });
      }
    } else {
      player.breeding = permanent(preview.breeding);
    }
    if (player.breeding) player.breeding.inBreeding = true;
    player.battleArea.push(...preview.battle.map(permanent));
    player.trash.push(...preview.trash.map((cardId, index) => card(take(cardId), `trash-${seat}-${index}`, seat)));

    const handSize = previewHandSize(seat === 0 ? "hand" : "opponentHand");
    const hand = preview.hand.slice(0, handSize).map(take);
    const variety = [...new Set(remaining)];
    for (let index = 0; hand.length < handSize; index += 1) {
      const cardId = variety[index % variety.length]!;
      if (remaining.includes(cardId)) hand.push(take(cardId));
    }
    // Opponent hand and both security zones stay hidden, as in the server's public view.
    if (seat === 0) player.hand.push(...hand.map((cardId, index) => card(cardId, `hand-${index}`, seat)));
    player.handCount = handSize;
    player.securityCount = 5;
    remaining.splice(0, player.securityCount);
    const drawn = remaining.splice(0, Math.max(0, Math.floor(drawCounts[seat])));
    if (seat === 0) player.hand.push(...drawn.map((cardId, index) => card(cardId, `draw-${seat}-${index}`, seat)));
    player.handCount += drawn.length;
    player.deckCount = remaining.length;
    player.eggDeckCount = eggs.length;
    state.players.push(player);
  }
  return state;
}

export function ArenaDemo() {
  const { locale, t } = useTranslation();
  const portuguese = locale === "pt-BR";
  const securityScenario = new URLSearchParams(window.location.search).get("scenario") === "security";
  const hatchScenario = new URLSearchParams(window.location.search).get("scenario") === "hatch";
  const [hatchSeats, setHatchSeats] = useState<readonly [boolean, boolean]>([false, false]);
  const [movedBreedingSeats, setMovedBreedingSeats] = useState<ReadonlySet<Seat>>(() => new Set());
  const [previewOutcome, setPreviewOutcome] = useState<"win" | "loss" | "draw" | undefined>();
  const [imperialStep, setImperialStep] = useState<0 | 1 | 2 | 3>(() =>
    new URLSearchParams(window.location.search).get("scenario") === "imperial" ? 1 : 0,
  );
  const [imperialActivated, setImperialActivated] = useState(false);
  const [imperialReturned, setImperialReturned] = useState(false);
  const imperialText = getCardDefinition("AD1-024")!
    .effectText!.split("\n")
    .find((line) => line.startsWith("[All Turns]"))!;
  const imperialParts = imperialText.split(" Then, ");
  const imperialDecision: DecisionRequest | undefined =
    imperialStep === 1 || imperialStep === 2
      ? {
          decisionId: `imperial-part-${imperialStep}`,
          seat: 0,
          kind: "optional",
          sourceCardId: "AD1-024",
          sourcePermanentId: "demo-imperial",
          sourceInstanceId: "demo-imperial-top",
          promptText: "Activate this triggered effect?",
          options: {
            timing: "AllTurns",
            effectText: imperialText,
            effectTextPart: imperialStep === 1 ? imperialParts[0] : `Then, ${imperialParts[1]}`,
          },
        }
      : undefined;
  // Rina Shinomiya activating one of UlforceVeedramon's two [When Digivolving] effects: the
  // chooser that shows each borrowable effect as its card and full printed clause.
  const [rinaOpen, setRinaOpen] = useState(
    () => new URLSearchParams(window.location.search).get("scenario") === "rina",
  );
  const ulforceChoices = ["EX13-023", "BT11-032", "BT22-025"].flatMap((cardId) =>
    splitPrintedClauses(getCardDefinition(cardId)!.effectText)
      .filter((clause) => clause.labels.has("When Digivolving"))
      .map((clause) => ({ cardId, clause: clause.text })),
  );
  const rinaText = getCardDefinition("BT11-112")!.effectText!;
  const rinaDecision: DecisionRequest | undefined = rinaOpen
    ? {
        decisionId: "rina-activates-ulforce",
        seat: 0,
        kind: "chooseOption",
        sourceCardId: "BT11-112",
        sourcePermanentId: "demo-rina",
        sourceInstanceId: "demo-rina-top",
        promptText: "Rina Shinomiya",
        options: {
          choices: ulforceChoices.map((choice) => choice.clause),
          choiceEffects: ulforceChoices.map((choice) => ({
            cardId: choice.cardId,
            timing: "WhenDigivolving",
          })),
          timing: "Static",
          effectText: rinaText.slice(rinaText.indexOf("[All Turns]"), rinaText.indexOf("[Your Turn]")),
        },
      }
    : undefined;
  function previewImperial() {
    setBatches([]);
    setEffectPreview(null);
    setEffectDemoDeleted(false);
    setImperialReturned(false);
    setImperialActivated(false);
    setImperialStep(1);
  }
  function respondImperial(response: DecisionResponse) {
    if (response.kind !== "optional") return;
    if (imperialStep === 1) {
      setImperialActivated(response.accept);
      setImperialStep(response.accept ? 2 : 3);
    } else if (imperialStep === 2) {
      setImperialReturned(response.accept);
      setImperialStep(3);
    }
  }
  const [securityFaceDownCount, setSecurityFaceDownCount] = useState(0);
  const [effectPreview, setEffectPreview] = useState<
    "On Play" | "When Digivolving" | "When Attacking" | "Start of Main Phase" | "On Deletion" | null
  >(null);
  const [effectPreviewRun, setEffectPreviewRun] = useState(0);
  const [effectDemoDeleted, setEffectDemoDeleted] = useState(false);
  const [deckReturnPreview, setDeckReturnPreview] = useState<Seat | null>(null);
  const [handReturnPreview, setHandReturnPreview] = useState<{ seat: Seat; count: 1 | 2 } | null>(null);
  const [stackStripPreview, setStackStripPreview] = useState<{ seat: Seat; kind: "sources" | "top" } | null>(null);
  const [phase, setPhase] = useState(Phase.Main);
  const [batches, setBatches] = useState<ServerBatch[]>([]);
  const [keywordGrants, setKeywordGrants] = useState<DemoKeywordGrants>({});
  const [keywordEditorOpen, setKeywordEditorOpen] = useState(false);
  const [drawCounts, setDrawCounts] = useState<readonly [number, number]>([0, 0]);
  const [turnStartStep, setTurnStartStep] = useState<"prepare" | Phase.Active | Phase.Draw | Phase.Breeding | null>(
    null,
  );
  const [turnStartRun, setTurnStartRun] = useState(0);
  /** How many of the four burst notices have been emitted, or null when none is running. */
  const [noticeBurstStep, setNoticeBurstStep] = useState<number | null>(null);
  /** How many batches of the real security check have been emitted, or null when idle. */
  const [securityReplayStep, setSecurityReplayStep] = useState<number | null>(null);
  const [dockedBattlePreview, setDockedBattlePreview] = useState<{ attackerDP: number; run: number } | null>(null);
  /** The board the replay has reached, kept after it ends: 0 none, 2 Taiki played, 6 Xros'd. */
  const [securityBoardStep, setSecurityBoardStep] = useState(0);
  /** Which beat of the Plutomon preview has been emitted, or null when idle. */
  const [plutomonStep, setPlutomonStep] = useState<number | null>(null);
  const [plutomonRun, setPlutomonRun] = useState(0);
  /** The viewer's Digimon are off the board once Plutomon's clause has taken them. */
  const [plutomonDeleted, setPlutomonDeleted] = useState(false);
  /** Which beat of the notice-ordering preview has been emitted, or null when idle. */
  const [noticeOrderStep, setNoticeOrderStep] = useState<number | null>(null);
  const [noticeOrderRun, setNoticeOrderRun] = useState(0);
  /** The run number of the open hand-selection fixture, so repeating it asks again. */
  const [handSelectionRun, setHandSelectionRun] = useState<number | null>(null);
  /** The run number of the open hand-and-trash fixture, so repeating it asks again. */
  const [mixedSelectionRun, setMixedSelectionRun] = useState<number | null>(null);
  const keywordLabels = useMemo(() => demoKeywordLabels(keywordGrants), [keywordGrants]);
  const events = useMemo(() => batches.flatMap((batch) => batch.events), [batches]);
  const crowdedScenario = new URLSearchParams(window.location.search).get("scenario") === "crowded";
  const [crowdedTamers, setCrowdedTamers] = useState<CrowdedTamers>({ turnedAmiAiba: 0, allReady: false });
  const [deepStackSuspended, setDeepStackSuspended] = useState(false);
  const state = useMemo(() => {
    const next = createArenaDemoState(drawCounts, crowdedTamers, hatchSeats);
    for (const seat of movedBreedingSeats) {
      const player = next.players[seat]!;
      if (player.breeding) {
        player.battleArea.push(player.breeding);
        player.breeding = undefined;
      }
    }
    if (crowdedScenario) {
      const deepStack = next.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT25-075");
      if (deepStack) deepStack.isSuspended = deepStackSuspended;
    }
    next.phase = phase;
    if (deckReturnPreview !== null) {
      const owner = next.players[deckReturnPreview]!;
      const host = owner.battleArea.find((permanent) => permanent.stack.length >= 2);
      if (host) {
        owner.battleArea.splice(owner.battleArea.indexOf(host), 1);
        owner.deckCount += 1;
        owner.trash.push(...host.stack, ...host.linked);
      }
    }
    if (handReturnPreview) {
      const owner = next.players[handReturnPreview.seat]!;
      const hosts = [
        ...owner.battleArea.filter((permanent) => permanent.stack.length >= 2),
        ...owner.battleArea.filter((permanent) => permanent.stack.length < 2),
      ].slice(0, handReturnPreview.count);
      for (const host of hosts) {
        owner.battleArea.splice(owner.battleArea.indexOf(host), 1);
        owner.hand.push(host.topCard);
        owner.handCount += 1;
        owner.trash.push(...host.stack, ...host.linked);
      }
    }
    if (stackStripPreview) {
      const owner = next.players[stackStripPreview.seat]!;
      const host = owner.battleArea.find((permanent) => permanent.stack.length >= 2);
      if (host) {
        if (stackStripPreview.kind === "top") {
          owner.trash.push(host.topCard);
          host.topCard = host.stack.pop()!;
          host.baseDP = getCardDefinition(host.topCard.cardId)?.dp ?? 0;
          host.currentDP = host.baseDP;
        } else owner.trash.push(...host.stack.splice(-2));
      }
    }
    if (previewOutcome) {
      next.gameOver = true;
      next.winnerSeat = previewOutcome === "draw" ? -1 : previewOutcome === "win" ? 0 : 1;
      next.phase = Phase.End;
    }
    if (imperialStep !== 0) {
      const imperial = fighter("AD1-024", "demo-imperial", 0);
      imperial.isSuspended = !imperialActivated;
      next.players[0]!.battleArea.splice(0, next.players[0]!.battleArea.length, imperial);
      const opponent = fighter("BT1-010", "demo-imperial-opponent", 1);
      opponent.isSuspended = imperialActivated;
      next.players[1]!.battleArea.splice(
        0,
        next.players[1]!.battleArea.length,
        ...(imperialReturned ? [] : [opponent]),
      );
      if (imperialReturned) next.players[1]!.deckCount += 1;
    }
    // Batch 2 plays BT10-087 onto the opponent's field; batch 6 places a Digimon under it.
    if (securityBoardStep >= 2) {
      const xros = securityBoardStep >= 6 ? ["BT19-014"] : [];
      next.players[1]!.battleArea.push(fighter(SECURITY_TAMER_CARD_ID, SECURITY_TAMER_PERMANENT_ID, 1, xros));
      next.players[1]!.securityCount = Math.max(0, next.players[1]!.securityCount - 1);
    }
    if (effectDemoDeleted) {
      const removed = next.players[0]!.battleArea.splice(0, 1)[0];
      if (removed) next.players[0]!.trash.push(removed.topCard);
    }
    if (plutomonDeleted) {
      const taken = next.players[0]!.battleArea.filter((permanent) =>
        getCardDefinition(permanent.topCard?.cardId ?? "")?.kinds.includes(CardKind.Digimon),
      );
      for (const permanent of taken) {
        next.players[0]!.battleArea.splice(next.players[0]!.battleArea.indexOf(permanent), 1);
        next.players[0]!.trash.push(permanent.topCard, ...permanent.stack);
      }
    }
    if (securityScenario) {
      for (let index = 0; index < securityFaceDownCount; index++) {
        const securityCard = next.players[0]?.security[index + 2];
        if (securityCard) {
          securityCard.faceUp = false;
          securityCard.cardId = "";
          securityCard.artId = "";
        }
      }
      const partner = next.players[0]?.battleArea[0];
      if (partner) partner.currentDP = partner.baseDP + Math.max(0, 2 - securityFaceDownCount) * 1000;
    }
    applyDemoKeywordGrants(next, keywordGrants);
    prepareDemoCombat(next);
    if (turnStartStep !== null) {
      for (const permanent of next.players[0]!.battleArea) {
        permanent.isSuspended = turnStartStep === "prepare";
        permanent.canAttackPlayer = false;
        permanent.attackablePermanentIds.clear();
      }
    }
    return next;
  }, [
    phase,
    keywordGrants,
    drawCounts,
    crowdedTamers,
    crowdedScenario,
    deepStackSuspended,
    turnStartStep,
    securityScenario,
    securityFaceDownCount,
    effectDemoDeleted,
    stackStripPreview,
    deckReturnPreview,
    handReturnPreview,
    plutomonDeleted,
    securityBoardStep,
    imperialStep,
    imperialReturned,
    imperialActivated,
    hatchSeats,
    movedBreedingSeats,
    previewOutcome,
  ]);
  function previewDeckReturn(seat: Seat) {
    const host = state.players[seat]?.battleArea.find((permanent) => permanent.stack.length >= 2);
    if (!host) return;
    setDeckReturnPreview(seat);
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat,
          sourceCardId: host.topCard.cardId,
          sourcePermanentId: host.permanentId,
          effectKey: `demo/return-deck/${seat}`,
          timing: "Main",
          description: "Return this Digimon to the bottom of its owner's deck.",
        },
        {
          kind: "cardsMoved",
          seat,
          from: "battleArea",
          to: "deckBottom",
          instanceIds: [host.topCard.instanceId],
          cardIds: [host.topCard.cardId],
          returnedPermanents: [
            {
              permanentId: host.permanentId,
              instanceId: host.topCard.instanceId,
              cardId: host.topCard.cardId,
              artId: host.topCard.artId,
              seat,
            },
          ],
        },
        ...(host.stack.length
          ? [
              {
                kind: "cardsMoved" as const,
                seat,
                from: "various",
                to: "trash",
                instanceIds: host.stack.map((sourceCard) => sourceCard.instanceId),
                cardIds: host.stack.map((sourceCard) => sourceCard.cardId),
              },
            ]
          : []),
      ]),
    ]);
  }
  function previewHandReturn(seat: Seat, count: 1 | 2) {
    const owner = state.players[seat]!;
    const hosts = [
      ...owner.battleArea.filter((permanent) => permanent.stack.length >= 2),
      ...owner.battleArea.filter((permanent) => permanent.stack.length < 2),
    ].slice(0, count);
    if (!hosts.length) return;
    setHandReturnPreview({ seat, count });
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat,
          sourceCardId: hosts[0]!.topCard.cardId,
          sourcePermanentId: hosts[0]!.permanentId,
          effectKey: `demo/return-hand/${seat}`,
          timing: "Main",
          description: `Return ${hosts.length} Digimon to their owners' hands.`,
        },
        {
          kind: "cardsMoved",
          seat,
          from: "various",
          to: "hand",
          handAddition: "transfer",
          instanceIds: hosts.map((host) => host.topCard.instanceId),
          returnedPermanents: hosts.map((host) => ({
            permanentId: host.permanentId,
            instanceId: host.topCard.instanceId,
            cardId: host.topCard.cardId,
            artId: host.topCard.artId,
            seat,
          })),
        },
        {
          kind: "cardsMoved",
          seat,
          from: "battleArea",
          to: "trash",
          instanceIds: hosts.flatMap((host) =>
            [...host.stack, ...host.linked].map((sourceCard) => sourceCard.instanceId),
          ),
        },
      ]),
    ]);
  }
  function previewStackStrip(seat: Seat, kind: "sources" | "top") {
    const owner = createArenaDemoState(drawCounts).players[seat]!;
    const host = owner.battleArea.find((permanent) => permanent.stack.length >= 2);
    if (!host) return;
    const cards = kind === "top" ? [host.topCard] : host.stack.slice(-2);
    setStackStripPreview({ seat, kind });
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat,
          sourceCardId: host.topCard.cardId,
          sourcePermanentId: host.permanentId,
          effectKey: `demo/stack-strip/${seat}/${kind}`,
          timing: "Main",
          description:
            kind === "top" ? "Trash the top card of this Digimon." : "Trash 2 digivolution cards from this Digimon.",
        },
        {
          kind: "cardsMoved",
          seat,
          from: "battleArea",
          to: "trash",
          instanceIds: cards.map((sourceCard) => sourceCard.instanceId),
          cardIds: cards.map((sourceCard) => sourceCard.cardId),
          artIds: cards.map((sourceCard) => sourceCard.artId || sourceCard.cardId),
          ...(kind === "top"
            ? { strippedStackTops: { permanentId: host.permanentId, reason: "trashTop" as const } }
            : { trashedSources: { permanentId: host.permanentId, hostCardId: host.topCard.cardId } }),
        },
      ]),
    ]);
  }
  function previewResult(outcome: "win" | "loss" | "draw") {
    setPreviewOutcome(outcome);
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "gameOver",
          result: outcome === "draw" ? { outcome: "draw" } : { outcome: "win", winnerSeat: outcome === "win" ? 0 : 1 },
          reason: "security",
        },
      ]),
    ]);
  }
  function previewBreedingMove(seat: Seat) {
    const raised = state.players[seat]?.breeding;
    if (!raised) return;
    setMovedBreedingSeats((previous) => new Set(previous).add(seat));
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        { kind: "movedFromBreeding", seat, permanentId: raised.permanentId, cardId: raised.topCard.cardId },
      ]),
    ]);
  }
  function previewHatch(seat: Seat) {
    if (hatchSeats[seat]) return;
    const cardId = ARENA_DECKS[seat]!.breeding.sources![0]!;
    setHatchSeats((previous) => (seat === 0 ? [true, previous[1]] : [previous[0], true]));
    setBatches((previous) => [
      ...previous,
      singleServerBatch([{ kind: "hatched", seat, permanentId: `hatch-${seat}`, cardId }]),
    ]);
  }
  function previewTrashSource(seat: Seat) {
    const source = state.players[seat]?.trash[0];
    if (!source) return;
    // A presentation fixture, not printed-card rules validation.
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat,
          sourceCardId: source.cardId,
          sourceInstanceId: source.instanceId,
          effectKey: `trash-source-preview-${Date.now()}`,
          timing: "Trash",
          description: portuguese
            ? "Prévia visual: ativação da carta sob o topo do lixo."
            : "Visual preview: activate the card below the top of the trash.",
        },
      ]),
    ]);
  }
  function previewHandSource(position: "first" | "last") {
    const hand = state.players[0]?.hand;
    const source = position === "first" ? hand?.[0] : hand?.[hand.length - 1];
    if (!source) return;
    // Accepted public presentation fixture; no printed-card legality claim.
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat: 0,
          sourceCardId: source.cardId,
          sourceInstanceId: source.instanceId,
          effectKey: `hand-source-preview-${Date.now()}`,
          timing: "Hand",
          description: portuguese
            ? "Prévia visual: ativação de uma carta da mão."
            : "Visual preview: activate a card in hand.",
        },
      ]),
    ]);
  }
  const playback = useArenaVisualPlayback(state, keywordLabels, portuguese);
  const handSource = state.players[0]!.battleArea[0]?.topCard.cardId;
  /**
   * The hand-selection fixture: the same `selectCards` request an effect raises when it
   * asks which cards to trash, over the viewer's own hand.
   */
  const handSelectionDecision: DecisionRequest | undefined =
    handSelectionRun === null
      ? undefined
      : {
          decisionId: `demo-hand-selection-${handSelectionRun}`,
          seat: 0,
          kind: "selectCards",
          promptText: portuguese ? "Selecione até 2 cartas da sua mão" : "Select up to 2 cards from your hand",
          ...(handSource ? { sourceCardId: handSource } : {}),
          options: {
            candidateInstanceIds: state.players[0]!.hand.map((instance) => instance.instanceId),
            min: 1,
            max: 2,
            timing: "Main",
            effectText: portuguese
              ? "Prévia visual: escolha cartas da mão. Nada é descartado."
              : "Visual preview: pick cards from your hand. Nothing is trashed.",
          },
        };
  /**
   * The hand-and-trash fixture: a prompt whose candidates straddle two zones, which
   * is the case the dialog groups under a heading per zone.
   */
  const mixedSelectionDecision: DecisionRequest | undefined =
    mixedSelectionRun === null
      ? undefined
      : {
          decisionId: `demo-mixed-selection-${mixedSelectionRun}`,
          seat: 0,
          kind: "chooseTargets",
          promptText: portuguese
            ? "Selecione até 2 cartas da sua mão ou do seu lixo"
            : "Select up to 2 cards from your hand or trash",
          ...(handSource ? { sourceCardId: handSource } : {}),
          options: {
            candidateInstanceIds: [...state.players[0]!.hand.slice(0, 3), ...state.players[0]!.trash].map(
              (instance) => instance.instanceId,
            ),
            min: 1,
            max: 2,
            timing: "Main",
            effectText: portuguese
              ? "Prévia visual: escolha cartas da mão e do lixo. Nada acontece."
              : "Visual preview: pick cards from your hand and trash. Nothing happens.",
          },
        };
  // One prompt at a time, and the fixture the tools just opened wins over a scenario
  // left running from before it.
  const decision = mixedSelectionDecision ?? handSelectionDecision ?? rinaDecision ?? imperialDecision;
  function respondDecision(response: DecisionResponse) {
    if (mixedSelectionDecision) {
      setMixedSelectionRun(null);
      return;
    }
    if (handSelectionDecision) {
      setHandSelectionRun(null);
      return;
    }
    if (rinaDecision) {
      setRinaOpen(false);
      return;
    }
    respondImperial(response);
  }
  function drawCard(seat: Seat) {
    if (!state.players.find((player) => player.seat === seat)?.deckCount) return;
    setDrawCounts((previous) => (seat === 0 ? [previous[0] + 1, previous[1]] : [previous[0], previous[1] + 1]));
  }
  /** Visual hand-addition fixture through the same public event pipeline as a search. */
  function previewHandTransfer(seat: Seat, revealed: boolean) {
    if (!state.players[seat]?.deckCount) return;
    const index = drawCounts[seat];
    const nextCounts: [number, number] = [drawCounts[0], drawCounts[1]];
    nextCounts[seat] += 1;
    const after = createArenaDemoState(nextCounts);
    const cardId =
      seat === 0
        ? after.players[0]!.hand.find((entry) => entry.instanceId === `draw-${seat}-${index}`)!.cardId
        : ARENA_DECKS[seat]!.hand[0]!;
    const transferEvents: ServerEvent[] = [
      ...(revealed ? [{ kind: "cardRevealed" as const, seat, cardId }] : []),
      {
        kind: "cardsMoved",
        seat,
        from: "deck",
        to: "hand",
        handAddition: "transfer",
        instanceIds: [`draw-${seat}-${index}`],
        ...(revealed ? { cardIds: [cardId] } : {}),
      },
    ];
    setDrawCounts(nextCounts);
    setBatches((previous) => [...previous, singleServerBatch(transferEvents)]);
  }
  function previewPhase(next: Phase) {
    setPhase(next);
    const batch = singleServerBatch([{ kind: "phaseChanged", phase: next, turnSeat: 0, turnCount: 5 }]);
    setBatches((previous) => [...previous, batch]);
  }
  function previewEffects() {
    // Visual fixtures only: announce the public clauses without executing their rules.
    const effects = state.players[0]!.battleArea.slice(0, 3).map((permanent) => ({
      kind: "effectTriggered" as const,
      seat: 0 as const,
      sourceCardId: permanent.topCard.cardId,
      effectKey: `demo/${permanent.permanentId}`,
      description: getCardDefinition(permanent.topCard.cardId)?.effectText ?? "",
    }));
    setBatches((previous) => [...previous, singleServerBatch(effects)]);
  }
  /**
   * Four notices in a row, one server batch each, so the queued slots can be watched
   * filling up rather than each moment replacing the one before it. Both seats raise
   * them: on a phone they fold into the one centred slot, on a board they split.
   */
  function previewNoticeBurst() {
    setNoticeBurstStep(0);
  }
  /**
   * A selection over the viewer's own hand: the prompt the board opens when an effect
   * asks which cards to trash. A visual fixture — answering it closes the prompt and
   * narrates the choice; it trashes nothing, because the demo has no engine behind it.
   */
  function previewHandSelection() {
    setBatches([]);
    setHandSelectionRun((run) => (run ?? 0) + 1);
  }
  function previewMixedSelection() {
    setBatches([]);
    setMixedSelectionRun((run) => (run ?? 0) + 1);
  }
  function previewEffectActivation(
    timing: "On Play" | "When Digivolving" | "When Attacking" | "Start of Main Phase" | "On Deletion",
  ) {
    setBatches([]);
    setEffectDemoDeleted(false);
    setEffectPreviewRun((run) => run + 1);
    setEffectPreview(timing);
  }
  useEffect(() => {
    if (!effectPreview) return;
    const timer = setTimeout(() => {
      const timing = effectPreview;
      const source = createArenaDemoState(drawCounts).players[0]!.battleArea[0]!;
      const previewEvents: ServerEvent[] = [];
      setEffectDemoDeleted(timing === "On Deletion");
      if (timing === "On Play") {
        previewEvents.push({
          kind: "cardPlayed",
          seat: 0,
          cardId: source.topCard.cardId,
          permanentId: source.permanentId,
        });
      } else if (timing === "When Digivolving") {
        previewEvents.push({
          kind: "digivolved",
          seat: 0,
          cardId: source.topCard.cardId,
          permanentId: source.permanentId,
          mechanic: "normal",
        });
      } else if (timing === "When Attacking") {
        previewEvents.push({
          kind: "attackDeclared",
          seat: 0,
          attackerCardId: source.topCard.cardId,
          attackerPermanentId: source.permanentId,
          target: { kind: "player" },
        });
      } else if (timing === "Start of Main Phase") {
        setPhase(Phase.Main);
        previewEvents.push({
          kind: "phaseChanged",
          phase: Phase.Main,
          turnSeat: 0,
          turnCount: 5,
        });
      } else {
        previewEvents.push({
          kind: "cardsMoved",
          instanceIds: [source.topCard.instanceId],
          from: "battleArea",
          to: "trash",
          deletedPermanents: [
            {
              permanentId: source.permanentId,
              instanceId: source.topCard.instanceId,
              cardId: source.topCard.cardId,
              seat: 0,
            },
          ],
        });
      }
      // A visual fixture, not a claim that this card has all these trigger timings.
      previewEvents.push({
        kind: "effectTriggered",
        seat: 0,
        sourceCardId: source.topCard.cardId,
        effectKey: `demo/activation/${timing}`,
        timing,
        description: portuguese
          ? "Prévia visual: a carta brilha antes deste aviso."
          : "Visual preview: the card glows before this notice.",
      });
      setBatches((previous) => [...previous, singleServerBatch(previewEvents)]);
      setEffectPreview(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [effectPreview, effectPreviewRun, drawCounts, portuguese]);
  /**
   * The security check from a real match log, replayed batch by batch through the normal
   * cue pipeline: the [Security] clause plays the Tamer onto the field and the dock leaves,
   * then its [On Play] reveal reads in the card column, then the turn player's chain, then
   * the check closes. The gaps stand in for the server's own pacing.
   */
  function previewSecurityEffect() {
    setBatches([]);
    setSecurityBoardStep(0);
    setSecurityReplayStep(0);
  }
  function previewResolvedSecurityEffect() {
    setSecurityReplayStep(null);
    setSecurityBoardStep(2);
    setBatches([
      singleServerBatch([
        ...SECURITY_CHECK_REPLAY[0]!,
        ...SECURITY_CHECK_REPLAY[1]!,
        ...SECURITY_CHECK_REPLAY[2]!,
        ...SECURITY_CHECK_REPLAY[3]!,
        ...SECURITY_CHECK_REPLAY[7]!,
        ...SECURITY_CHECK_REPLAY.at(-1)!,
      ]),
    ]);
  }
  /** Controlled presentation events, independent of printed-card engine legality. */
  function previewPlainSecurityCheck(seat: Seat) {
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "securityRevealed",
          seat,
          revealedCardId: "BT1-085",
          attackerPermanentId: "preview-absent-attacker",
          isDigimon: false,
          hasSecurityEffect: false,
        },
        { kind: "securityChecked", seat, revealedCardId: "BT1-085", resolution: "trashed" },
      ]),
    ]);
  }
  function previewDockedSecurityBattle() {
    const attacker = state.players[0]!.battleArea.find(
      (permanent) => getCardDefinition(permanent.topCard.cardId)?.kinds.includes(CardKind.Digimon) ?? false,
    );
    if (!attacker) return;
    setDockedBattlePreview({ attackerDP: attacker.currentDP, run: Date.now() });
    setBatches((previous) => [
      ...previous,
      singleServerBatch([
        {
          kind: "attackDeclared",
          seat: 0,
          attackerPermanentId: attacker.permanentId,
          attackerCardId: attacker.topCard.cardId,
          target: { kind: "player" },
        },
        {
          kind: "securityRevealed",
          seat: 1,
          revealedCardId: "BT1-010",
          attackerPermanentId: attacker.permanentId,
          attackerDP: attacker.currentDP,
          securityCardDP: 2000,
          isDigimon: true,
          hasSecurityEffect: true,
        },
        {
          kind: "effectTriggered",
          seat: 1,
          sourceCardId: "BT1-010",
          timing: "Security",
          effectKey: "demo/security-before-battle",
          description: portuguese
            ? "Prévia visual: resolva o efeito de segurança antes da batalha."
            : "Visual preview: resolve the security effect before battle.",
        },
      ]),
    ]);
  }
  useEffect(() => {
    if (!dockedBattlePreview) return;
    // A controlled later server batch closes the check after its clause has read.
    const timer = setTimeout(() => {
      setBatches((previous) => [
        ...previous,
        singleServerBatch([
          {
            kind: "securityChecked",
            seat: 1,
            revealedCardId: "BT1-010",
            resolution: "battle",
            battle: {
              attackerDP: dockedBattlePreview.attackerDP,
              securityCardDP: 2000,
              attackerDeleted: false,
              securityDigimonDeleted: true,
            },
          },
        ]),
      ]);
      setDockedBattlePreview(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [dockedBattlePreview]);
  function previewTurnStart() {
    if (turnStartStep !== null || !state.players[0]!.deckCount) return;
    // A fresh screen clears any individually queued phase previews and establishes
    // the suspended board as the baseline before the unsuspend animation begins.
    setTurnStartRun((run) => run + 1);
    setBatches([]);
    setPhase(Phase.Main);
    setTurnStartStep("prepare");
  }
  useEffect(() => {
    if (turnStartStep === null) return;
    const timer = setTimeout(
      () => {
        if (turnStartStep === "prepare") {
          // A real server can send the entire automatic turn start at once. Let the
          // match presentation sequence it instead of spacing events in the demo.
          setTurnStartStep(Phase.Active);
          setPhase(Phase.Breeding);
          drawCard(0);
          const phaseChanged = (next: Phase) => ({
            kind: "phaseChanged" as const,
            phase: next,
            turnSeat: 0 as const,
            turnCount: 5,
          });
          setBatches([
            singleServerBatch([
              { kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 5 },
              phaseChanged(Phase.Active),
              // The unsuspend step is what a server reports, one move per permanent; the
              // presentation releases each card's held suspension off these, so a preview
              // that only flipped the board would leave it suspended on screen.
              ...state.players[0]!.battleArea.map((permanent) => ({
                kind: "cardsMoved" as const,
                instanceIds: [permanent.permanentId],
                from: "suspended",
                to: "unsuspended",
              })),
              phaseChanged(Phase.Draw),
              phaseChanged(Phase.Breeding),
            ]),
          ]);
        } else {
          setTurnStartStep(null);
        }
      },
      turnStartStep === "prepare" ? 600 : TIMINGS.turnBanner + TIMINGS.phaseBanner * 3,
    );
    return () => clearTimeout(timer);
    // The demo emits one batch; production cues own the actual presentation clocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnStartStep]);
  /**
   * One moment carrying both halves: the clause on the left, the cards it turned up on the
   * right. It is the opponent's, because a reveal only opens a panel on the side that did
   * NOT make it — the viewer's own reveal is already visible in the zone it came from.
   */
  function previewSplitToasts() {
    setBatches([]);
    setPhase(Phase.Main);
    const board = createArenaDemoState(drawCounts);
    const source = board.players[1]!.battleArea[0]!;
    setBatches([
      singleServerBatch([
        {
          kind: "effectTriggered",
          seat: 1,
          sourceCardId: source.topCard.cardId,
          effectKey: "demo/split-toasts",
          timing: "OnPlay",
          description: portuguese
            ? "[Ao Jogar] Revele as 3 cartas do topo do seu deck."
            : "[OnPlay] Reveal the top 3 cards of your deck.",
        },
        /* A public snapshot lists no deck at all, so the ids come from the viewer's hand;
           they are only identities for the panel. */
        ...board.players[0]!.hand.slice(0, 3).map((revealed) => ({
          kind: "cardRevealed" as const,
          seat: 1 as const,
          cardId: revealed.cardId,
          sourceCardId: source.topCard.cardId,
        })),
      ]),
    ]);
  }
  /**
   * The three notice fixes of 2026-09-16, in the order a match raises them.
   *
   * It is the opponent's attack, as the reported match was: a reveal only opens a panel
   * on the side that did NOT make it, so the viewer's own attack could never show both
   * halves of a moment.
   *
   * Beat 1 declares the attack. Beat 2 is the [When Attacking] trigger the declaration
   * fired, carrying both halves of one moment — the clause and the cards it turned up —
   * so the left column leads and the right follows a beat later. Beat 3 is the security
   * check, which now waits for that clause instead of breaking the shield over it. Beat 4
   * passes the turn, and every toast still on screen keeps its own clock through the
   * ribbons rather than being cleared by them.
   */
  /**
   * The opponent's [All Turns] clause deleting the viewer's Digimon — Plutomon, which is
   * already on the demo board.
   *
   * This is the moment the board used to explain worst: nothing asks the viewer anything,
   * so there is no targeting arrow, and the cards simply left while a clause appeared at
   * the far edge of the screen. It is the fixture for the source staying lit through its
   * own clause and for the arrow that points from it at what it took.
   */
  function previewPlutomon() {
    setBatches([]);
    setPhase(Phase.Main);
    setPlutomonDeleted(false);
    setPlutomonRun((run) => run + 1);
    setPlutomonStep(0);
  }
  useEffect(() => {
    if (plutomonStep === null) return;
    if (plutomonStep >= PLUTOMON_GAPS_MS.length) {
      setPlutomonStep(null);
      return;
    }
    const timer = setTimeout(() => {
      const board = createArenaDemoState(drawCounts);
      const plutomon = board.players[1]!.battleArea.find((permanent) => permanent.topCard.cardId === PLUTOMON_CARD_ID);
      const taken = board.players[0]!.battleArea.filter((permanent) =>
        getCardDefinition(permanent.topCard?.cardId ?? "")?.kinds.includes(CardKind.Digimon),
      );
      if (!plutomon || taken.length === 0) {
        setPlutomonStep(null);
        return;
      }
      const beats: readonly ServerEvent[][] = [
        [
          {
            kind: "effectTriggered",
            seat: 1,
            sourceCardId: plutomon.topCard.cardId,
            sourcePermanentId: plutomon.permanentId,
            effectKey: "demo/plutomon/all-turns",
            timing: "AllTurns",
            description: portuguese
              ? "[Todos os Turnos] Exclua os Digimon do oponente com o menor nível."
              : "[All Turns] Delete your opponent's lowest-level Digimon.",
          },
        ],
        [
          {
            kind: "cardsMoved",
            seat: 0,
            from: "battleArea",
            to: "trash",
            instanceIds: taken.map((permanent) => permanent.topCard.instanceId),
            cardIds: taken.map((permanent) => permanent.topCard.cardId),
            /* The board handles are what the arrow points at: by the time this beat is
               narrated the permanents have already left, and only their ids can find
               where they stood. */
            deletedPermanents: taken.map((permanent) => ({
              permanentId: permanent.permanentId,
              instanceId: permanent.topCard.instanceId,
              cardId: permanent.topCard.cardId,
              seat: 0 as const,
            })),
          },
        ],
      ];
      setBatches((previous) => [...previous, singleServerBatch(beats[plutomonStep]! as ServerEvent[])]);
      if (plutomonStep === 1) setPlutomonDeleted(true);
      setPlutomonStep((step) => (step === null ? null : step + 1));
    }, PLUTOMON_GAPS_MS[plutomonStep]!);
    return () => clearTimeout(timer);
    // The board fixture is stable for the length of the preview; only the beat drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plutomonStep, plutomonRun]);
  function previewNoticeOrdering() {
    setBatches([]);
    setPhase(Phase.Main);
    setNoticeOrderRun((run) => run + 1);
    setNoticeOrderStep(0);
  }
  useEffect(() => {
    if (noticeOrderStep === null) return;
    if (noticeOrderStep >= NOTICE_ORDER_GAPS_MS.length) {
      setNoticeOrderStep(null);
      return;
    }
    const timer = setTimeout(() => {
      const board = createArenaDemoState(drawCounts);
      const attacker = board.players[1]!.battleArea[0]!;
      const attackerCardId = attacker.topCard.cardId;
      const beats: readonly ServerEvent[][] = [
        [
          {
            kind: "attackDeclared",
            seat: 1,
            attackerCardId,
            attackerPermanentId: attacker.permanentId,
            target: { kind: "player" },
          },
        ],
        [
          {
            kind: "effectTriggered",
            seat: 1,
            sourceCardId: attackerCardId,
            effectKey: "demo/notice-order/when-attacking",
            /* The engine's own key, not the label: TIMING_LABELS maps it to the
               "When Attacking" the notice prints. */
            timing: "OnUseAttack",
            description: portuguese
              ? "[Ao Atacar] Revele as 3 cartas do topo do seu deck."
              : "[When Attacking] Reveal the top 3 cards of your deck.",
          },
          /* A public snapshot lists no deck at all, and never the opponent's cards, so the
             three ids come from the viewer's hand. They are only identities for the panel. */
          ...board.players[0]!.hand.slice(0, 3).map((revealed) => ({
            kind: "cardRevealed" as const,
            seat: 1 as const,
            cardId: revealed.cardId,
          })),
        ],
        [
          {
            kind: "securityRevealed",
            seat: 0,
            revealedCardId: NOTICE_ORDER_SECURITY_CARD_ID,
            artId: NOTICE_ORDER_SECURITY_CARD_ID,
            attackerArtId: attackerCardId,
            attackerPermanentId: attacker.permanentId,
            attackerDP: attacker.currentDP,
            securityCardDP: 3000,
            hasSecurityEffect: false,
            isDigimon: true,
          },
          {
            kind: "securityChecked",
            seat: 0,
            revealedCardId: NOTICE_ORDER_SECURITY_CARD_ID,
            artId: NOTICE_ORDER_SECURITY_CARD_ID,
            attackerArtId: attackerCardId,
            resolution: "battle",
          },
        ],
        [
          { kind: "turnEnded", endingSeat: 1, nextSeat: 0, turnCount: 6 },
          {
            kind: "phaseChanged",
            phase: Phase.Active,
            turnSeat: 0,
            turnCount: 6,
          },
          {
            kind: "phaseChanged",
            phase: Phase.Draw,
            turnSeat: 0,
            turnCount: 6,
          },
          {
            kind: "phaseChanged",
            phase: Phase.Breeding,
            turnSeat: 0,
            turnCount: 6,
          },
        ],
      ];
      setBatches((previous) => [...previous, singleServerBatch(beats[noticeOrderStep]! as ServerEvent[])]);
      setNoticeOrderStep((step) => (step === null ? null : step + 1));
    }, NOTICE_ORDER_GAPS_MS[noticeOrderStep]!);
    return () => clearTimeout(timer);
    // The board fixture is stable for the length of the preview; only the beat drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeOrderStep, noticeOrderRun]);
  useEffect(() => {
    if (noticeBurstStep === null) return;
    if (noticeBurstStep >= NOTICE_BURST_COUNT) {
      setNoticeBurstStep(null);
      return;
    }
    const timer = setTimeout(
      () => {
        const seat: Seat = noticeBurstStep % 2 === 0 ? 0 : 1;
        const area = state.players[seat]!.battleArea;
        const permanent = area[noticeBurstStep % Math.max(1, area.length)] ?? state.players[0]!.battleArea[0];
        if (permanent) {
          setBatches((previous) => [
            ...previous,
            singleServerBatch([
              {
                kind: "effectTriggered",
                seat,
                sourceCardId: permanent.topCard.cardId,
                effectKey: `demo/burst/${noticeBurstStep}`,
                description: getCardDefinition(permanent.topCard.cardId)?.effectText ?? "",
              },
            ]),
          ]);
        }
        setNoticeBurstStep((step) => (step === null ? null : step + 1));
      },
      noticeBurstStep === 0 ? 0 : NOTICE_BURST_GAP_MS,
    );
    return () => clearTimeout(timer);
    // The board fixture is stable for the length of a burst; only the step drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeBurstStep]);
  useEffect(() => {
    if (securityReplayStep === null) return;
    if (securityReplayStep >= SECURITY_CHECK_REPLAY.length) {
      setSecurityReplayStep(null);
      return;
    }
    const timer = setTimeout(
      () => {
        setBatches((previous) => [...previous, singleServerBatch(SECURITY_CHECK_REPLAY[securityReplayStep]!)]);
        // The board follows the events: the played Tamer enters, then its Xros card goes under.
        setSecurityBoardStep(securityReplayStep + 1);
        setSecurityReplayStep((step) => (step === null ? null : step + 1));
      },
      securityReplayStep === 0 ? 0 : SECURITY_REPLAY_GAP_MS,
    );
    return () => clearTimeout(timer);
  }, [securityReplayStep]);
  const battlefieldId = useSyncExternalStore(subscribeBattlefield, getBattlefieldId, getBattlefieldId);

  return (
    <div className="aegis-arena-demo">
      <header
        className="aegis-arena-demo-toolbar"
        inert={playback.controller.active}
        aria-hidden={playback.controller.active || undefined}
      >
        <div className="aegis-arena-demo-brand">
          <span aria-hidden="true">
            <Icons.Hexagon size={20} />
          </span>
          <strong>{portuguese ? "Prévia da arena" : "Arena preview"}</strong>
        </div>
        <label className="aegis-arena-demo-field">
          <span className="aegis-arena-demo-field-icon" aria-hidden="true">
            <Icons.Map size={16} />
          </span>
          <span className="aegis-arena-demo-field-label">{portuguese ? "Cenário" : "Backdrop"}</span>
          <select value={battlefieldId} onChange={(event) => setBattlefieldId(event.target.value)}>
            {BATTLEFIELDS.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
            {!BATTLEFIELDS.some((field) => field.id === battlefieldId) && (
              <option value={battlefieldId}>{battlefieldById(battlefieldId).label}</option>
            )}
          </select>
        </label>
        <label className="aegis-arena-demo-field aegis-arena-demo-field--phase">
          <span className="aegis-arena-demo-field-icon" aria-hidden="true">
            <Icons.Clock size={16} />
          </span>
          <span className="aegis-arena-demo-field-label">{portuguese ? "Fase" : "Phase"}</span>
          <select
            disabled={turnStartStep !== null}
            value={phase}
            onChange={(event) => previewPhase(event.target.value as Phase)}
          >
            {PHASES.map((item) => (
              <option key={item} value={item}>
                {t(`game.phase.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="aegis-arena-demo-replay"
          type="button"
          onClick={() => previewPhase(phase)}
          disabled={turnStartStep !== null}
          aria-label={portuguese ? "Repetir animação da fase" : "Replay phase animation"}
          title={portuguese ? "Repetir animação da fase" : "Replay phase animation"}
        >
          <span aria-hidden="true">
            <Icons.Play size={16} />
          </span>
          <span className="aegis-arena-demo-replay-label">{portuguese ? "Repetir" : "Replay"}</span>
        </button>
        <ArenaDemoTools
          portuguese={portuguese}
          onHatch={hatchScenario ? previewHatch : undefined}
          onBreedingMove={previewBreedingMove}
          onResult={previewResult}
          onTrashSource={previewTrashSource}
          onHandSource={previewHandSource}
          deckCounts={[state.players[0]!.deckCount, state.players[1]!.deckCount]}
          onKeywords={() => setKeywordEditorOpen(true)}
          onSecurityFlip={
            securityScenario ? () => setSecurityFaceDownCount((count) => (count === 3 ? 0 : count + 1)) : undefined
          }
          securityFaceUpCount={3 - securityFaceDownCount}
          onSuspendTamer={
            crowdedScenario
              ? () =>
                  setCrowdedTamers((current) => ({
                    turnedAmiAiba: current.allReady ? 1 : Math.min(3, current.turnedAmiAiba + 1),
                    allReady: false,
                  }))
              : undefined
          }
          onReadyTamers={crowdedScenario ? () => setCrowdedTamers({ turnedAmiAiba: 0, allReady: true }) : undefined}
          onToggleDeepStack={crowdedScenario ? () => setDeepStackSuspended((current) => !current) : undefined}
          onDraw={drawCard}
          onShuffle={(seat, deck) =>
            setBatches((previous) => [...previous, singleServerBatch([{ kind: "deckShuffled", seat, deck }])])
          }
          onHandTransfer={previewHandTransfer}
          onVisualPlayback={playback.controller.controls.start}
          onSecurityBattle={playback.controller.controls.startSecurityBattle}
          onOpeningSecurityDeal={playback.controller.controls.startOpeningSecurityDeal}
          onTurnStart={previewTurnStart}
          onImperial={previewImperial}
          onEffects={previewEffects}
          onNoticeBurst={previewNoticeBurst}
          onHandSelection={previewHandSelection}
          onMixedSelection={previewMixedSelection}
          onEffectActivation={previewEffectActivation}
          onStackStrip={previewStackStrip}
          onDeckReturn={previewDeckReturn}
          onHandReturn={previewHandReturn}
          onSecurityEffect={previewSecurityEffect}
          onPlainSecurityCheck={previewPlainSecurityCheck}
          onDockedSecurityBattle={previewDockedSecurityBattle}
          onResolvedSecurityEffect={previewResolvedSecurityEffect}
          onNoticeOrdering={previewNoticeOrdering}
          onSplitToasts={previewSplitToasts}
          onPlutomon={previewPlutomon}
          disabled={turnStartStep !== null}
        />
        <span className="aegis-arena-demo-note" role="status">
          {turnStartStep !== null
            ? portuguese
              ? "Reproduzindo início do turno…"
              : "Playing turn start…"
            : portuguese
              ? "Sem partida ativa"
              : "No active match"}
        </span>
        <a className="aegis-arena-demo-back" href="/" aria-label={portuguese ? "Voltar ao início" : "Back to home"}>
          <span aria-hidden="true">
            <Icons.ArrowLeft size={16} />
          </span>
          <span className="aegis-arena-demo-back-label">{portuguese ? "Voltar" : "Back"}</span>
        </a>
      </header>
      {playback.controller.active ? <ArenaVisualPlayer playback={playback.controller} /> : null}
      <GameScreen
        key={`${playback.gameKey}-${turnStartRun}-${effectPreviewRun}`}
        joinOptions={{
          displayName: ARENA_DECKS[0]!.name,
          deck: {
            mainDeck: [...previewRecipe(ARENA_DECKS[0]!.recipeId).decklist.mainDeck],
            eggDeck: [...previewRecipe(ARENA_DECKS[0]!.recipeId).decklist.eggDeck],
          },
        }}
        identityColor="Red"
        onExit={() => window.location.assign("/")}
        demoConnection={{
          room: undefined,
          keywordLabels: playback.connection?.keywordLabels ?? keywordLabels,
          status: "connected",
          state: playback.connection?.state ?? state,
          events: playback.connection?.events ?? events,
          batches: playback.connection?.batches ?? batches,
          snapshots: playback.connection?.snapshots,
          decision,
          respondDecision,
          acknowledgeDecision: () => {},
          error: undefined,
          sessionId: "arena-demo-0",
          roomCode: "",
        }}
      />
      {keywordEditorOpen ? (
        <ArenaKeywordEditor
          digimon={demoDigimon(state)}
          grants={keywordGrants}
          onGrant={(id, grant) => setKeywordGrants((previous) => upsertDemoKeywordGrant(previous, id, grant))}
          onRemove={(id, keyword) => setKeywordGrants((previous) => removeDemoKeywordGrant(previous, id, keyword))}
          onReset={() => setKeywordGrants({})}
          onClose={() => setKeywordEditorOpen(false)}
        />
      ) : null}
    </div>
  );
}
