/* Every in-match surface the mobile lab renders, one specimen each. A specimen is the
   component on its own over a plain board surface, or — in the Board group — the real
   match screen fed a fabricated connection, the same way the arena demo drives it. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CombatWindow,
  PendingDecision,
  Phase,
  getCardDefinition,
  type ServerEvent,
  type DecisionRequest,
  type GameState,
} from "@aegis/shared";
import { useTranslation, type Locale } from "../i18n";
import { singleServerBatch } from "../net/serverBatches";
import { GameScreen } from "../game/GameScreen";
import { CardOpenerProvider } from "../game/cardLinks";
import { CardMini } from "../design/cards";
import {
  ActionConfirmationOverlay,
  CardActionMenu,
  CardZoomOverlay,
  DecisionOverlay,
  DualPlayChoiceOverlay,
  EvoCostChoiceOverlay,
  GameOverOverlay,
  MulliganOverlay,
  OpponentDroppedOverlay,
  StackViewerOverlay,
  TrashViewerOverlay,
  type TriggerDetail,
} from "../game/overlay";
import type { DecisionCandidate } from "../game/overlay/choice/decisionTypes";
import {
  BoardAlliancePrompt,
  BoardBlockPrompt,
  BoardOptionalPrompt,
  BoardSelectionRail,
  OpponentSelectingPill,
} from "../game/BoardDecisionRail";
import { NarrationStack } from "../game/NarrationStack";
import { AttackAnnouncementBanner, SidePanelStack } from "../game/SidePanelStack";
import { PlayLogSidebar } from "@/game/log/PlayLogSidebar";
import { SecurityClash } from "../game/SecurityClashView";
import { ZoneShowcase } from "../game/ZoneShowcase";
import { HandCardPreview } from "../game/screen/layout/HandCardPreview";
import { MemoryBand } from "../game/screen/layout/MemoryBand";
import { PlayerDock } from "../game/screen/layout/PlayerDock";
import { TurnBanner } from "../game/screen/layout/TurnBanner";
import { useArenaLayout } from "../game/screen/hooks/useArenaLayout";
import type { NarrationItem } from "../game/narration";
import type { MatchNotice } from "../game/notices";
import type { SidePanel } from "../game/sidePanels";
import type { TurnControlState } from "../game/turnControl";
import type { HandEntry } from "../game/piece";
import { Side } from "../game/side";
import { printedCardName } from "../game/overlay";
import { createArenaDemoState } from "./ArenaDemo";
import { BATTLE_CLASH, CARDS, noop } from "./boardShowcaseFixtures";
import {
  FULL_HAND,
  LAB_LOG_TURNS,
  NOTICE_SAMPLES,
  ORDER_CANDIDATES,
  PHONE_HAND,
  REVEALED_CANDIDATES,
  SELECT_CANDIDATES,
  TARGET_CANDIDATES,
  TRIGGER_DETAILS,
  chooseLongDecision,
  chooseRevealedDecision,
  chooseShortDecision,
  deletedPanel,
  effectChoiceDecision,
  effectNarration,
  optionalDecision,
  orderCardsDecision,
  orderTriggersDecision,
  queuedNarration,
  rejectionNotice,
  revealedPanel,
  selectDecision,
  targetDecision,
  trashedPanel,
} from "./mobileLabFixtures";

export const SPECIMEN_GROUPS = ["Decisions", "Narration", "Board", "Controls", "Overlays"] as const;

export type SpecimenGroup = (typeof SPECIMEN_GROUPS)[number];

export interface Specimen {
  id: string;
  group: SpecimenGroup;
  title: string;
  note?: string;
  /** `match` specimens are the whole match screen and bring their own layout. */
  surface: "board" | "match";
  render: (locale: Locale) => ReactNode;
}

/**
 * The plain board a lone component sits on: the match layout's classes, so every rule
 * scoped under them applies, and the card opener every card link expects.
 */
export function BoardSurface({ children }: { children: ReactNode }) {
  const [zoomCardId, setZoomCardId] = useState<string>();
  return (
    <CardOpenerProvider onOpenCard={setZoomCardId}>
      <main className="game-layout mobile-lab-surface">
        <div className="game-board mobile-lab-surface__board">{children}</div>
      </main>
      {zoomCardId ? <CardZoomOverlay cardId={zoomCardId} onClose={() => setZoomCardId(undefined)} /> : null}
    </CardOpenerProvider>
  );
}

/** Holds the picks a real prompt would, so a specimen can be clicked through. */
function DecisionSpecimen({
  request,
  candidates = [],
  initialPicks = [],
  triggerDetails,
}: {
  request: DecisionRequest;
  candidates?: DecisionCandidate[];
  initialPicks?: string[];
  triggerDetails?: readonly TriggerDetail[];
}) {
  const [picks, setPicks] = useState(initialPicks);
  const max = request.options?.max ?? 1;
  return (
    <DecisionOverlay
      request={request}
      sourceCardId={request.sourceCardId}
      candidates={candidates}
      picks={picks}
      triggerDetails={triggerDetails}
      onTogglePick={(instanceId) =>
        setPicks((current) =>
          current.includes(instanceId)
            ? current.filter((id) => id !== instanceId)
            : [...current, instanceId].slice(-max),
        )
      }
      onRespond={noop}
    />
  );
}

function NarrationSpecimen({
  items,
  rejection = null,
  expand = false,
  decision,
}: {
  items: NarrationItem[];
  rejection?: MatchNotice | null;
  expand?: boolean;
  decision?: DecisionRequest;
}) {
  const layout = useArenaLayout();
  const root = useRef<HTMLDivElement>(null);
  const [narration] = useState(() => new Map(items.map((item) => [item.id, item])));
  // The column opens only from a tap on the folded band, which is exactly what this does.
  useEffect(() => {
    if (expand) root.current?.querySelector<HTMLButtonElement>(".narration-peek")?.click();
  }, [expand]);
  return (
    <div ref={root} className={`mobile-lab-fill${decision ? " aegis-stage" : ""}`}>
      <NarrationStack
        narration={narration}
        rejection={rejection}
        compact={layout.collapseNotices}
        onAdvance={noop}
        onDismissRejection={noop}
      />
      {decision ? (
        <BoardOptionalPrompt
          sourceCardId={decision.sourceCardId}
          clause={decision.options?.effectText}
          onUse={noop}
          onDecline={noop}
          onOpenDialog={noop}
        />
      ) : null}
    </div>
  );
}

function PanelSpecimen({ panel }: { panel: SidePanel }) {
  const [shown] = useState(panel);
  return <SidePanelStack panel={shown} remainingMs={60 * 60 * 1000} onDismiss={noop} />;
}

function MemoryBandSpecimen({
  state,
  covered = false,
  memory = 3,
  prediction,
}: {
  state: TurnControlState;
  covered?: boolean;
  memory?: number;
  prediction?: number;
}) {
  const layout = useArenaLayout();
  return (
    <div className="mobile-lab-center">
      <MemoryBand
        phaseBanner={null}
        memory={memory}
        compact={layout.compactPiles}
        displayedPhase={state === "endBreeding" ? Phase.Breeding : Phase.Main}
        phaseSweeping={false}
        memoryPrediction={prediction}
        turnControlState={state}
        endPhaseBlocked={covered}
        onEndPhase={noop}
      />
    </div>
  );
}

function DockSpecimen({
  cards,
  selectedInstanceId,
  selection,
  children,
}: {
  cards: HandEntry[];
  selectedInstanceId?: string;
  selection?: {
    selectable: readonly string[];
    picked: readonly string[];
    onToggle?: (instanceId: string) => void;
    onInspect?: (instanceId: string) => void;
  };
  children?: ReactNode;
}) {
  const layout = useArenaLayout();
  const handDockRef = useRef<HTMLDivElement>(null);
  const selectedCardId = cards.find((card) => card.instanceId === selectedInstanceId)?.cardId;
  return (
    <>
      <div className="mobile-lab-fill">{children}</div>
      <PlayerDock
        breedingDock={null}
        pileDock={null}
        handDockRef={handDockRef}
        cardWidth={layout.handCardWidth}
        minExposure={layout.handMinExposure}
        cards={cards}
        selectedInstanceId={selectedInstanceId}
        selection={
          selection
            ? {
                selectableInstanceIds: selection.selectable,
                pickedInstanceIds: selection.picked,
                onToggle: selection.onToggle ?? noop,
                onInspect: selection.onInspect ?? noop,
              }
            : undefined
        }
        actionBar={selection ? undefined : { selCardId: selectedCardId, hasBase: false, onCancel: noop }}
        eggDeckCount={4}
        handCount={cards.length}
        deckCount={31}
        trashCount={6}
        startDrag={noop}
        selectCard={noop}
        onHoverChange={noop}
      />
    </>
  );
}

function NarrationHandSelectionSpecimen({ locale }: { locale: Locale }) {
  const request = selectDecision(locale);
  const [picks, setPicks] = useState<string[]>([]);
  const [inspectedCard, setInspectedCard] = useState<string>();
  return (
    <>
      <div className="game-opponent-bar" aria-hidden />
      <DockSpecimen
        cards={FULL_HAND}
        selection={{
          selectable: FULL_HAND.map((card) => card.instanceId),
          picked: picks,
          onToggle: (instanceId) =>
            setPicks((current) =>
              current.includes(instanceId)
                ? current.filter((id) => id !== instanceId)
                : [...current, instanceId].slice(-2),
            ),
          onInspect: (instanceId) => setInspectedCard(FULL_HAND.find((card) => card.instanceId === instanceId)?.cardId),
        }}
      >
        <NarrationSpecimen items={queuedNarration()} />
        <BoardSelectionRail
          sourceCardId={request.sourceCardId}
          prompt={request.promptText}
          min={0}
          max={2}
          pickCount={picks.length}
          canConfirm={picks.length > 0}
          onConfirm={noop}
          onNoSelection={noop}
          onOpenDialog={noop}
        />
      </DockSpecimen>
      {inspectedCard ? <CardZoomOverlay cardId={inspectedCard} onClose={() => setInspectedCard(undefined)} /> : null}
    </>
  );
}

/** The whole match screen over a fabricated connection, as the arena demo builds it. */
function MatchSpecimen({
  configure,
  decision,
  previewEvents = [],
}: {
  previewEvents?: ServerEvent[];
  configure?: (state: GameState) => void;
  decision?: DecisionRequest;
}) {
  const [state] = useState(() => {
    const next = createArenaDemoState();
    configure?.(next);
    return next;
  });
  const [batches, setBatches] = useState<ReturnType<typeof singleServerBatch>[]>([]);
  return (
    <>
      {previewEvents.length > 0 && batches.length === 0 ? (
        <button
          type="button"
          style={{ position: "fixed", top: "50%", left: "25%", zIndex: 1000 }}
          onClick={() => setBatches([singleServerBatch(previewEvents)])}
        >
          Show opponent effect
        </button>
      ) : null}
      <GameScreen
        joinOptions={{ displayName: "Mobile lab", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Red"
        onExit={noop}
        demoConnection={{
          room: undefined,
          status: "connected",
          state,
          events: batches.flatMap((batch) => batch.events),
          batches,
          decision,
          respondDecision: noop,
          acknowledgeDecision: noop,
          error: undefined,
          sessionId: "arena-demo-0",
          roomCode: "",
        }}
      />
    </>
  );
}

const LONG_EFFECT_LABELS: Record<"en" | "pt-BR" | "es", string[]> = {
  en: [
    "[Main] By suspending this Digimon, delete 1 of your opponent's Digimon with 6000 DP or less.",
    "[Main] [Once Per Turn] Trash 1 card in your hand to draw 2 cards.",
  ],
  "pt-BR": [
    "[Principal] Ao suspender este Digimon, delete 1 dos Digimon do seu oponente com 6000 DP ou menos.",
    "[Principal] [Uma Vez Por Turno] Descarte 1 carta da sua mão para comprar 2 cartas.",
  ],
  es: [
    "[Main] Al suspender este Digimon, elimina 1 de los Digimon de tu oponente con 6000 DP o menos.",
    "[Main] [Once Per Turn] Descarta 1 carta de tu mano para robar 2 cartas.",
  ],
};

const decision = (id: string, title: string, render: Specimen["render"], note?: string): Specimen => ({
  id,
  group: "Decisions",
  title,
  note,
  surface: "board",
  render,
});

export const SPECIMENS: readonly Specimen[] = [
  decision("decision-choose-short", "Choose option, short labels", () => (
    <DecisionSpecimen request={chooseShortDecision()} />
  )),
  decision("decision-millennium-depth", "Millenniummon De-Digivolve depth", () => (
    <DecisionSpecimen
      request={{
        decisionId: "lab-millennium-depth",
        seat: 0,
        kind: "chooseOption",
        sourceCardId: "P-220",
        promptText: "Choose De-Digivolve depth.",
        options: {
          timing: "OnPlay",
          choices: ["2 cards", "1 card"],
          effectText: "[On Play] [When Digivolving] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
        },
      }}
    />
  )),
  decision(
    "decision-choose-long",
    "Choose option, long effect sentences",
    (locale) => <DecisionSpecimen request={chooseLongDecision(locale)} />,
    "The case that overflowed the bottom sheet at 390px.",
  ),
  decision("decision-choose-revealed", "Choose option over revealed cards", () => (
    <DecisionSpecimen request={chooseRevealedDecision()} candidates={REVEALED_CANDIDATES} />
  )),
  decision("decision-optional", "Optional effect (use / decline)", (locale) => (
    <DecisionSpecimen request={optionalDecision(locale)} />
  )),
  decision("decision-optional-rail", "Optional effect on the board rail", (locale) => {
    const request = optionalDecision(locale);
    return (
      <BoardOptionalPrompt
        sourceCardId={request.sourceCardId}
        clause={request.options?.effectText}
        onUse={noop}
        onDecline={noop}
        onOpenDialog={noop}
      />
    );
  }),
  decision("decision-targets", "Choose targets (candidate grid)", (locale) => (
    <DecisionSpecimen request={targetDecision(locale)} candidates={TARGET_CANDIDATES} initialPicks={["opp-1"]} />
  )),
  decision("decision-trash-cards", "Discord 1557059213266522233 · select from trash", (locale) => (
    <DecisionSpecimen
      request={{
        ...selectDecision(locale),
        promptText: locale === "en" ? "Select up to 2 cards from your trash." : "Selecione até 2 cartas do lixo.",
      }}
      candidates={SELECT_CANDIDATES.map((candidate) => ({ ...candidate, zone: "trash" }))}
      initialPicks={["hand-1"]}
    />
  )),
  decision("decision-select-cards", "Select cards (8 candidates)", (locale) => (
    <DecisionSpecimen request={selectDecision(locale)} candidates={SELECT_CANDIDATES} initialPicks={["hand-1"]} />
  )),
  decision("decision-selection-rail", "Hand selection on the board rail", (locale) => {
    const request = selectDecision(locale);
    return (
      <DockSpecimen
        cards={PHONE_HAND}
        selection={{ selectable: PHONE_HAND.map((card) => card.instanceId), picked: ["hand-1"] }}
      >
        <BoardSelectionRail
          sourceCardId={request.sourceCardId}
          prompt={request.promptText}
          min={0}
          max={2}
          pickCount={1}
          canConfirm
          onConfirm={noop}
          onNoSelection={noop}
          onOpenDialog={noop}
        />
      </DockSpecimen>
    );
  }),
  decision("decision-field-budget", "Field selection with a play-cost budget", () => (
    <BoardSelectionRail
      fieldSelection
      sourceCardId="BT11-095"
      prompt="Hades Force"
      clause="Delete any number of your opponent's Digimon and Tamers within the play-cost budget."
      min={0}
      max={3}
      pickCount={1}
      canConfirm
      budgetText="Play cost: 12 / 12"
      onConfirm={noop}
      onNoSelection={noop}
    />
  )),
  decision("decision-order-cards", "Order cards", (locale) => (
    <DecisionSpecimen request={orderCardsDecision(locale)} candidates={ORDER_CANDIDATES} />
  )),
  decision("decision-order-triggers", "Order triggers (pick one)", () => (
    <DecisionSpecimen request={orderTriggersDecision()} triggerDetails={TRIGGER_DETAILS} />
  )),
  decision("decision-effect-choice", "Effect choice (choiceEffects)", () => (
    <DecisionSpecimen request={effectChoiceDecision()} />
  )),
  decision("decision-opponent-selecting", "Opponent is selecting", () => <OpponentSelectingPill />),
  decision("decision-evo-cost", "Digivolution cost choice", () => (
    <EvoCostChoiceOverlay
      evolvingCardId={CARDS.ultimate}
      baseCardId={CARDS.champion}
      memory={3}
      options={[
        { type: "normal", label: "Digivolve from a level 4 red Digimon", cost: 3 },
        { type: "alternate", label: "Digivolve from a Digimon with [Greymon] in its name", cost: 2 },
      ]}
      onConfirm={noop}
      onCancel={noop}
    />
  )),
  decision("decision-dual-play", "Dual card: play as Digimon or Option", () => (
    <DualPlayChoiceOverlay cardId={CARDS.option} onChoose={noop} onCancel={noop} />
  )),
  decision("decision-action-confirmation", "Action confirmation", () => <ConfirmationSpecimen />),

  {
    id: "narration-single",
    group: "Narration",
    title: "Narration band, one moment",
    surface: "board",
    render: () => <NarrationSpecimen items={[effectNarration()]} />,
  },
  {
    id: "narration-queued",
    group: "Narration",
    title: "Narration band, +N queued",
    surface: "board",
    render: () => <NarrationSpecimen items={queuedNarration()} />,
  },
  {
    id: "narration-expanded",
    group: "Narration",
    title: "Narration column, expanded",
    surface: "board",
    render: () => <NarrationSpecimen items={queuedNarration()} expand />,
  },
  {
    id: "narration-decision",
    group: "Narration",
    title: "Two complete toasts beside a decision",
    surface: "board",
    render: (locale) => <NarrationSpecimen items={queuedNarration()} decision={optionalDecision(locale)} />,
  },
  {
    id: "narration-hand-selection",
    group: "Narration",
    title: "Two complete toasts above a selectable hand",
    surface: "board",
    render: (locale) => <NarrationHandSelectionSpecimen locale={locale} />,
  },
  {
    id: "narration-rejection",
    group: "Narration",
    title: "Refused action",
    surface: "board",
    render: (locale) => <NarrationSpecimen items={[effectNarration()]} rejection={rejectionNotice(locale)} />,
  },
  {
    id: "narration-notice-kinds",
    group: "Narration",
    title: "Notice kinds, expanded",
    surface: "board",
    render: () => (
      <NarrationSpecimen
        expand
        items={NOTICE_SAMPLES.map(({ notice }) => {
          const shown = notice();
          return {
            id: shown.id,
            side: shown.side,
            batchId: "lab-batch",
            createdAt: Date.now(),
            lifetimeMs: 60 * 60 * 1000,
            notice: shown,
          };
        })}
      />
    ),
  },
  {
    id: "panel-trashed",
    group: "Narration",
    title: "Side panel: trashed cards",
    surface: "board",
    render: () => <PanelSpecimen panel={trashedPanel()} />,
  },
  {
    id: "panel-revealed",
    group: "Narration",
    title: "Side panel: 5 revealed cards",
    surface: "board",
    render: () => <PanelSpecimen panel={revealedPanel()} />,
  },
  {
    id: "panel-deleted",
    group: "Narration",
    title: "Side panel: deleted card (opponent)",
    surface: "board",
    render: () => <PanelSpecimen panel={deletedPanel()} />,
  },
  {
    id: "attack-announcement-viewer",
    group: "Narration",
    title: "Attack announcement (viewer)",
    surface: "board",
    render: () => (
      <AttackAnnouncementBanner
        announcement={{ id: "attack-you", cardId: CARDS.mega, side: Side.Viewer, createdAt: Date.now() }}
      />
    ),
  },
  {
    id: "attack-announcement-opponent",
    group: "Narration",
    title: "Attack announcement (opponent)",
    surface: "board",
    render: () => (
      <AttackAnnouncementBanner
        announcement={{ id: "attack-opp", cardId: "BT26-059", side: Side.Opponent, createdAt: Date.now() }}
      />
    ),
  },
  {
    id: "turn-banner",
    group: "Narration",
    title: "Turn banner",
    surface: "board",
    render: () => <TurnBanner transition={{ endingSeat: 1, nextSeat: 0, turnCount: 6 }} viewerSeat={0} />,
  },

  {
    id: "board-opponent-narration",
    group: "Board",
    title: "Opponent effect while selecting cards",
    surface: "match",
    render: () => (
      <MatchSpecimen
        configure={(state) => {
          state.turnSeat = 1;
          state.pendingDecision = Object.assign(new PendingDecision(), {
            decisionId: "lab-opponent-selection",
            seat: 1,
            kind: "selectCards",
          });
        }}
        previewEvents={[
          {
            kind: "effectTriggered",
            timing: "Main",
            seat: 1,
            sourceCardId: "EX12-041",
            effectKey: "main",
            description: getCardDefinition("EX12-041")?.effectText ?? "",
          },
        ]}
      />
    ),
  },
  {
    id: "board-opponent-block",
    group: "Board",
    title: "Opponent deciding whether to block",
    surface: "match",
    render: () => (
      <MatchSpecimen
        configure={(state) => {
          state.combatWindow = Object.assign(new CombatWindow(), { kind: "block", seat: 1 });
        }}
      />
    ),
  },
  {
    id: "board-main",
    group: "Board",
    title: "Full board, main phase",
    surface: "match",
    render: () => <MatchSpecimen />,
  },
  {
    id: "board-breeding",
    group: "Board",
    title: "Full board, breeding phase",
    surface: "match",
    render: () => <MatchSpecimen configure={(state) => (state.phase = Phase.Breeding)} />,
  },
  {
    id: "board-opponent-turn",
    group: "Board",
    title: "Full board, opponent's turn",
    surface: "match",
    render: () => (
      <MatchSpecimen
        configure={(state) => {
          state.turnSeat = 1;
          state.memory = -2;
        }}
      />
    ),
  },
  {
    id: "board-decision-long",
    group: "Board",
    title: "Full board + long choose option",
    surface: "match",
    render: (locale) => <MatchSpecimen decision={chooseLongDecision(locale)} />,
  },
  {
    id: "board-decision-effect-choice",
    group: "Board",
    title: "Full board + effect choice",
    surface: "match",
    render: () => <MatchSpecimen decision={effectChoiceDecision()} />,
  },
  {
    id: "board-decision-optional",
    group: "Board",
    title: "Full board + optional effect",
    surface: "match",
    render: (locale) => <MatchSpecimen decision={optionalDecision(locale)} />,
  },

  ...(["endBreeding", "endTurn", "waiting"] as const).map((state): Specimen => ({
    id: `turn-control-${state}`,
    group: "Controls",
    title: `Memory band, turn control: ${state}`,
    surface: "board",
    render: () => <MemoryBandSpecimen state={state} memory={state === "waiting" ? -3 : 3} />,
  })),
  {
    id: "turn-control-covered",
    group: "Controls",
    title: "Memory band, turn control: covered",
    surface: "board",
    render: () => <MemoryBandSpecimen state="endTurn" covered />,
  },
  {
    id: "memory-prediction",
    group: "Controls",
    title: "Memory band with play prediction",
    surface: "board",
    render: () => <MemoryBandSpecimen state="endTurn" memory={4} prediction={-3} />,
  },
  {
    id: "hand-dock",
    group: "Controls",
    title: "Hand dock, 6 cards",
    surface: "board",
    render: () => <DockSpecimen cards={PHONE_HAND} />,
  },
  {
    id: "hand-selected",
    group: "Controls",
    title: "Hand dock, card selected (action bar)",
    surface: "board",
    render: () => <DockSpecimen cards={PHONE_HAND} selectedInstanceId="hand-2" />,
  },
  {
    id: "hand-full",
    group: "Controls",
    title: "Hand dock, 10 cards",
    surface: "board",
    render: () => <DockSpecimen cards={FULL_HAND} />,
  },

  {
    id: "card-action-sheet",
    group: "Overlays",
    title: "Card action sheet",
    surface: "board",
    render: (locale) => (
      <CardActionMenu
        sheet
        x={0}
        y={0}
        cardId={CARDS.mega}
        dp={13000}
        baseDP={12000}
        keywords={["Blocker", "Piercing", "SecurityAttack"]}
        stackCards={[
          { cardId: CARDS.mega, role: "top" },
          { cardId: CARDS.ultimate, role: "stack" },
          { cardId: CARDS.champion, role: "stack" },
          { cardId: CARDS.rookie, role: "stack" },
        ]}
        effects={LONG_EFFECT_LABELS[locale === "pt-BR" || locale === "es" ? locale : "en"].map((label) => ({
          label,
          onActivate: noop,
        }))}
        canAttack
        onViewStack={noop}
        onAttack={noop}
        onClose={noop}
      />
    ),
  },
  {
    id: "stack-viewer-sheet",
    group: "Overlays",
    title: "Digivolution stack viewer",
    surface: "board",
    render: () => (
      <StackViewerOverlay
        sheet
        title={printedCardName(CARDS.mega)}
        cards={[
          { cardId: CARDS.mega, role: "top" },
          { cardId: CARDS.ultimate, role: "stack" },
          { cardId: CARDS.champion, role: "stack" },
          { cardId: CARDS.rookie, role: "stack" },
          { cardId: CARDS.egg, role: "stack" },
        ]}
        canAttack
        onAttack={noop}
        onClose={noop}
      />
    ),
  },
  {
    id: "trash-viewer-sheet",
    group: "Overlays",
    title: "Trash viewer",
    surface: "board",
    render: () => <TrashSpecimen />,
  },
  {
    id: "card-zoom",
    group: "Overlays",
    title: "Card zoom",
    surface: "board",
    render: () => <CardZoomOverlay cardId="BT26-067" onClose={noop} />,
  },
  {
    id: "play-log",
    group: "Overlays",
    title: "Play log drawer",
    surface: "board",
    render: () => (
      <PlayLogSidebar
        turns={LAB_LOG_TURNS}
        playerNames={{ 0: "Alice", 1: "Bob" }}
        viewerSeat={0}
        onClose={noop}
        onOpenCard={noop}
      />
    ),
  },
  {
    id: "mulligan",
    group: "Overlays",
    title: "Mulligan",
    surface: "board",
    render: () => (
      <MulliganOverlay
        handCardIds={[CARDS.rookie, CARDS.champion, CARDS.tamer, CARDS.option, CARDS.ultimate]}
        turnOrder="second"
        onKeep={noop}
        onMulligan={noop}
      />
    ),
  },
  {
    id: "block-prompt",
    group: "Overlays",
    title: "Block window (board prompt)",
    surface: "board",
    render: () => <BoardBlockPrompt attackerCardId="BT26-059" mustBlock={false} onDecline={noop} />,
  },
  {
    id: "alliance-prompt",
    group: "Overlays",
    title: "Alliance window (board prompt)",
    surface: "board",
    render: () => <BoardAlliancePrompt attackerCardId="BT22-052" onPass={noop} />,
  },
  ...(["BT22-052", "EX5-030"] as const).map((cardId): Specimen => ({
    id: `hand-inspector-${cardId}`,
    group: "Overlays",
    title: `Hand card inspector: ${cardId}`,
    surface: "board",
    render: () => (
      <HandCardPreview
        arenaInspection={{ side: Side.Viewer, container: null }}
        cardId={cardId}
        activatableEffects={[]}
        canPlay
        canDigivolve
        onPlay={noop}
        onActivateEffect={noop}
        onChooseBase={noop}
        onCancel={noop}
      />
    ),
  })),
  {
    id: "alliance-flow",
    group: "Overlays",
    title: "Alliance window → confirmation",
    note: "Tap the ally: the confirmation replaces the prompt. Cancel brings the prompt back.",
    surface: "board",
    render: () => <AllianceFlowSpecimen />,
  },
  {
    id: "alliance-confirmation",
    group: "Overlays",
    title: "Alliance confirmation",
    surface: "board",
    render: () => <AllianceConfirmationSpecimen />,
  },
  {
    id: "security-clash",
    group: "Overlays",
    title: "Security check battle",
    surface: "board",
    render: () => <SecurityClash scene={{ ...BATTLE_CLASH, loser: { attacker: false, revealed: true } }} />,
  },
  {
    id: "zone-showcase",
    group: "Overlays",
    title: "Opponent played a card",
    surface: "board",
    render: () => (
      <ZoneShowcase
        showcase={{ key: 1, cardId: CARDS.opponentChampion, seat: 1, mine: false, kind: "play", color: "Blue" }}
      />
    ),
  },
  ...(["win", "loss"] as const).map((result): Specimen => ({
    id: `game-over-${result}`,
    group: "Overlays",
    title: `Game over: ${result}`,
    surface: "board",
    render: () => <GameOverSpecimen result={result} />,
  })),
  {
    id: "opponent-dropped",
    group: "Overlays",
    title: "Opponent disconnected",
    surface: "board",
    render: () => <OpponentDroppedOverlay onLeave={() => undefined} />,
  },
];

/** Mirrors MatchOverlays: the Alliance rail is withdrawn while its confirmation is open. */
function AllianceFlowSpecimen() {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mobile-lab-ally"
        aria-label={printedCardName("BT22-057")}
        onClick={() => setConfirming(true)}
      >
        <CardMini cardId="BT22-057" width={72} zoomOnHover={false} />
      </button>
      {confirming ? (
        <AllianceConfirmationSpecimen onDone={() => setConfirming(false)} />
      ) : (
        <BoardAlliancePrompt attackerCardId="BT22-052" onPass={noop} />
      )}
    </>
  );
}

function AllianceConfirmationSpecimen({ onDone = noop }: { onDone?: () => void }) {
  const { t } = useTranslation();
  return (
    <ActionConfirmationOverlay
      cardId="BT22-057"
      title={t("overlay.confirmAllianceTitle")}
      detail={t("overlay.confirmAllianceDetail", { name: printedCardName("BT22-057"), dp: (4000).toLocaleString() })}
      showSummary={false}
      confirmLabel={t("overlay.confirmAlliance")}
      onConfirm={onDone}
      onCancel={onDone}
    />
  );
}

function ConfirmationSpecimen() {
  const { t } = useTranslation();
  return (
    <ActionConfirmationOverlay
      cardId={CARDS.ultimate}
      title={t("overlay.confirmActionTitle")}
      detail={t("overlay.confirmDigivolveDetail", {
        card: printedCardName(CARDS.ultimate),
        base: printedCardName(CARDS.champion),
      })}
      confirmLabel={t("overlay.confirmDigivolve")}
      alternateLabel={t("overlay.digivolveNormally")}
      onConfirm={noop}
      onAlternate={noop}
      onCancel={noop}
    />
  );
}

function TrashSpecimen() {
  const { t } = useTranslation();
  const cardIds = [CARDS.rookie, CARDS.option, CARDS.champion, CARDS.tamer, CARDS.ultimate, CARDS.egg, CARDS.mega];
  return (
    <TrashViewerOverlay sheet title={t("game.oppTrash", { name: "Plutomon Bot" })} cardIds={cardIds} onClose={noop} />
  );
}

function GameOverSpecimen({ result }: { result: "win" | "loss" }) {
  return (
    <GameOverOverlay
      result={result}
      reason={result === "win" ? "security" : "deckOut"}
      stats={[
        { value: 12, label: "Turns" },
        { value: 3, label: "Security left" },
        { value: "8:42", label: "Duration" },
      ]}
      onMenu={noop}
      onRematch={noop}
    />
  );
}

export function specimenById(id: string | null): Specimen | undefined {
  return SPECIMENS.find((specimen) => specimen.id === id);
}
