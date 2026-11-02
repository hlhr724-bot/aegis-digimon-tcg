/* Interactive development fixtures for every match prompt surface. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assemblyRequirementFor,
  digiXrosRequirementFor,
  getCardDefinition,
  CombatWindow,
  type DecisionRequest,
} from "@aegis/shared";
import { Button } from "../design/primitives";
import { applyDarkMode, setDarkMode, useDarkMode } from "../design/darkMode";
import { useTranslation } from "../i18n";
import { GameScreen } from "../game/GameScreen";
import type { AegisRoom } from "../net/client";
import { DecisionPrompts } from "../game/screen/layout/DecisionPrompts";
import {
  ActionConfirmationOverlay,
  AssemblyMaterialOverlay,
  BarrierOverlay,
  CounterOverlay,
  DigiXrosMaterialOverlay,
  DualPlayChoiceOverlay,
  EvadeOverlay,
  EvoCostChoiceOverlay,
  MulliganOverlay,
  WaitingOverlay,
} from "../game/overlay";
import { DigiXrosExpanderPrompt } from "../game/overlay/choice/DigiXrosExpanderPrompt";
import { ArenaLookDialog } from "../game/screen/layout/ArenaLookDialog";
import { SurrenderDialog } from "../game/screen/layout/SurrenderDialog";
import { BugReportDialog } from "../bugs/BugReportDialog";
import { AppFusionChoiceOverlay } from "../game/AppFusionChoiceOverlay";
import { ArenaPermanentInspector } from "../game/ArenaPermanentInspector";
import { CardZoomOverlay } from "../game/overlay";
import { buildPermanentDetail } from "../game/permanentDetail";
import { Side } from "../game/side";
import type { CandidateZone } from "../game/decisionModel";
import { createArenaDemoState } from "./ArenaDemo";
import {
  CARDS,
  INSPECTED_PERMANENT,
  TRIGGER_DECISION,
  SAME_PERMANENT_TRIGGER_DECISION,
  permanent,
} from "./boardShowcaseFixtures";
import "../game/game.css";
import "./effectPromptGallery.css";

export const EFFECT_PROMPT_CASES = [
  ["optional-field", "Optional effect · field", "left"],
  ["optional-attack-resolving", "Paildramon · attack already resolving", "left"],
  ["optional-hidden", "Optional effect · hidden/revealed", "left"],
  ["millennium-depth", "Millenniummon · De-Digivolve depth", "left"],
  ["millennium-delete", "Millenniummon · optional deletion / field highlight", "left"],
  ["trash-recovery", "Matt Ishida · select from trash", "center"],
  ["revealed-search", "Davis Motomiya · select revealed cards", "center"],
  ["sukamon-bt11", "Sukamon BT11 · deletion / reveal to hand", "center"],
  ["sukamon-bt3", "Sukamon BT3 · deletion / reveal to field", "center"],
  ["sukamon-ex13", "Sukamon EX13 · deletion / reveal to field", "center"],
  ["choose-yes-no", "Choose option · use / decline", "left"],
  ["choose-clauses", "Choose option · printed clauses", "left"],
  ["choose-effects", "Choose option · borrowed effects", "center"],
  ["choose-revealed", "Choose option · revealed cards", "center"],
  ["select-hand", "Select cards · hand subset", "left"],
  ["choose-targets-hand", "Choose targets · hand", "left"],
  ["select-field", "Choose targets · field", "center"],
  ["select-mixed", "Select cards · mixed zones", "center"],
  ["select-player", "Choose targets · player", "center"],
  ["select-dp-budget", "Choose targets · DP budget", "center"],
  ["select-cost-budget", "Select cards · hand play cost budget", "left"],
  ["select-empty", "Select cards · no legal candidates", "center"],
  ["order-cards", "Order cards · deck bottom", "center"],
  ["order-triggers", "Order triggers · next effect", "center"],
  ["order-same-card", "Order triggers · same permanent", "center"],
  ["resolution-plan", "Order triggers · complete plan", "center"],
  ["partition", "Partition · use / decline", "left"],
  ["confirm-action", "Action confirmation", "left"],
  ["dual-play", "Dual card · option play", "left"],
  ["evo-cost", "Evolution · cost route", "left"],
  ["effect-evo-cost", "Effect evolution · cost route", "left"],
  ["assembly", "Assembly · trash materials", "center"],
  ["digixros", "DigiXros · hand / field / locked materials", "center"],
  ["digixros-expander", "DigiXros · Tamer activation", "left"],
  ["app-fusion", "App Fusion · link card", "center"],
  ["app-fusion-empty", "App Fusion · unavailable route", "center"],
  ["block", "Block · choose blocker on field", "left"],
  ["collision", "Collision · required block on field", "left"],
  ["collision-empty", "Collision · no remaining blocker", "left"],
  ["alliance", "Alliance · choose ally on field", "left"],
  ["alliance-empty", "Alliance · no ally (automatic pass)", "none"],
  ["counter-sources", "Counter · choose source", "center"],
  ["counter-blast", "Counter · multiple Blast routes", "center"],
  ["counter-field", "Counter · single field action", "left"],
  ["barrier", "Barrier · use / decline", "left"],
  ["evade", "Evade · use / decline", "left"],
  ["source-host", "Digivolution cards · choose host on field", "left"],
  ["mulligan-first", "Mulligan · going first", "center"],
  ["mulligan-second", "Mulligan · going second", "center"],
  ["inherited-inspector", "Inspector · inherited effects", "inspector"],
  ["waiting", "Conexão · aguardando partida", "center"],
  ["waiting-error", "Conexão · erro e tentar novamente", "center"],
  ["arena-settings", "Configurações da partida · aparência e áudio", "center"],
  ["feedback", "Feedback · reportar bug", "center"],
  ["surrender", "Desistência · confirmar", "center"],
] as const;
type CaseId = (typeof EFFECT_PROMPT_CASES)[number][0];
const isCaseId = (value: string | null): value is CaseId => EFFECT_PROMPT_CASES.some(([id]) => id === value);
const EXPANDER = { permanentId: "gallery-taiki", cardId: "BT10-087", underTamerMax: 2, trashMax: 0 };
const SELECT_CARDS = [CARDS.rookie, CARDS.champion, CARDS.ultimate, CARDS.tamer, CARDS.option, CARDS.mega];

export function EffectPromptGallery() {
  const params = new URLSearchParams(window.location.search);
  const initialCase = params.get("case");
  const [caseId, setCaseId] = useState<CaseId>(isCaseId(initialCase) ? initialCase : "optional-field");
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(true);
  const [response, setResponse] = useState<unknown>();
  const { locale, setLocale } = useTranslation();
  const dark = useDarkMode();
  useEffect(applyDarkMode, []);
  const state = useMemo(() => {
    const preview = createArenaDemoState();
    if (caseId.startsWith("millennium-")) {
      preview.players[0]!.battleArea.clear();
      preview.players[0]!.battleArea.push(
        permanent({
          permanentId: "gallery-millennium",
          cardId: "P-220",
          baseDP: 14000,
          stackCardIds: ["BT18-015", "BT18-007", "BT18-002"],
        }),
      );
    }
    if (caseId === "source-host") {
      preview.players[0]!.battleArea.clear();
      preview.players[0]!.battleArea.push(
        permanent({
          permanentId: "gallery-proximamon",
          cardId: "EX12-077",
          baseDP: 15000,
          stackCardIds: ["EX12-018", "EX12-007"],
        }),
        permanent({
          permanentId: "gallery-canoweissmon",
          cardId: "EX12-014",
          baseDP: 7000,
          stackCardIds: ["EX12-013", "EX12-007"],
        }),
      );
    }
    if (active && ["alliance", "alliance-empty", "block", "collision", "collision-empty"].includes(caseId)) {
      if (caseId.startsWith("alliance")) {
        const attacker = preview.players[0]!.battleArea[0]!;
        preview.players[0]!.battleArea[0] = permanent({
          permanentId: attacker.permanentId,
          cardId: "EX4-057",
          baseDP: 8000,
          stackCardIds: ["EX4-055", "EX4-052"],
        });
      } else preview.turnSeat = 1;
      const window = new CombatWindow();
      window.kind = caseId.startsWith("alliance") ? "alliance" : "block";
      window.seat = 0;
      window.attackerPermanentId = preview.players[caseId.startsWith("alliance") ? 0 : 1]!.battleArea[0]!.permanentId;
      window.permanentId = window.attackerPermanentId;
      window.mustBlock = caseId.startsWith("collision");
      if (!caseId.endsWith("empty")) window.eligiblePermanentIds.push(preview.players[0]!.battleArea[1]!.permanentId);
      preview.combatWindow = window;
    }
    return preview;
  }, [caseId, active]);
  const combatPreview = ["alliance", "alliance-empty", "block", "collision", "collision-empty"].includes(caseId);
  const boardDecision = useMemo(() => {
    if (caseId.startsWith("millennium-")) {
      const source = state.players[0]!.battleArea[0]!;
      const deletion = caseId === "millennium-delete";
      return {
        decisionId: `gallery-${caseId}-${revision}`,
        seat: 0,
        kind: deletion ? "optional" : "chooseOption",
        sourceCardId: source.topCard.cardId,
        sourceInstanceId: source.topCard.instanceId,
        sourcePermanentId: source.permanentId,
        promptText: "",
        options: {
          timing: "OnPlay",
          effectText: deletion
            ? "Then, you may delete 1 Digimon."
            : "[On Play] [When Digivolving] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          effectTextPart: deletion
            ? "Then, you may delete 1 Digimon."
            : "[On Play] [When Digivolving] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          ...(deletion ? {} : { choices: ["2 cards", "1 card"] }),
        },
      } satisfies DecisionRequest;
    }
    if (caseId === "source-host") {
      const sourceCardId = "EX12-077";
      return {
        decisionId: `gallery-source-host-${revision}`,
        seat: 0,
        kind: "selectCards",
        sourceCardId,
        promptText: locale === "pt-BR" ? "Selecione uma carta das fontes de evolução" : "Select 1 digivolution card",
        options: {
          min: 0,
          max: 1,
          timing: "WhenAttacking",
          effectText: getCardDefinition(sourceCardId)?.effectText,
          candidateInstanceIds: [...state.players[0]!.battleArea].flatMap((host) =>
            [...host.stack]
              .filter((card) => (getCardDefinition(card.cardId)?.playCost ?? Infinity) <= 10)
              .map((card) => card.instanceId),
          ),
        },
      } satisfies DecisionRequest;
    }
    if (!["select-hand", "choose-targets-hand", "select-cost-budget"].includes(caseId)) return undefined;
    const hand = state.players[0]!.hand;
    const candidates =
      caseId === "select-hand"
        ? hand.filter((_, index) => index % 2 === 0)
        : caseId === "choose-targets-hand"
          ? hand.slice(0, 3)
          : hand;
    const portuguese = locale === "pt-BR";
    return {
      decisionId: `gallery-${caseId}-${revision}`,
      seat: 0,
      kind: caseId === "choose-targets-hand" ? "chooseTargets" : "selectCards",
      promptText: portuguese ? "Selecione até 2 cartas da sua mão" : "Select up to 2 cards from your hand",
      sourceCardId: state.players[0]!.battleArea[0]!.topCard.cardId,
      options: {
        candidateInstanceIds: candidates.map((card) => card.instanceId),
        min: caseId === "choose-targets-hand" ? 0 : 1,
        max: 2,
        ...(caseId === "select-cost-budget" ? { maxTotalPlayCost: 7 } : {}),
        timing: "Main",
        effectText: portuguese
          ? "Prévia visual: escolha as cartas destacadas da mão. Nada é descartado."
          : "Visual preview: choose the highlighted cards in hand. Nothing is trashed.",
      },
    } satisfies DecisionRequest;
  }, [state, caseId, revision, locale]);
  const boardRef = useRef<HTMLDivElement>(null);
  const current = EFFECT_PROMPT_CASES.find(([id]) => id === caseId)!;
  function selectCase(id: CaseId) {
    setCaseId(id);
    setRevision((value) => value + 1);
    setActive(true);
    setResponse(undefined);
    const next = new URL(window.location.href);
    next.searchParams.set("case", id);
    window.history.replaceState(null, "", next);
  }
  function respond(value: unknown) {
    setResponse(value);
    setActive(false);
  }
  return (
    <main className="effect-prompt-gallery" data-controls={params.get("controls") !== "0"}>
      <header className="effect-prompt-gallery__toolbar">
        <strong>{locale === "pt-BR" ? "Efeitos" : "Effects"}</strong>
        <label>
          <span className="sr-only">{locale === "pt-BR" ? "Cenário" : "Scenario"}</span>
          <select value={caseId} onChange={(event) => selectCase(event.target.value as CaseId)}>
            {EFFECT_PROMPT_CASES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" onClick={() => selectCase(caseId)}>
          {locale === "pt-BR" ? "Reabrir" : "Replay"}
        </Button>
        <select
          aria-label="Language"
          value={locale}
          onChange={(event) => setLocale(event.target.value as "en" | "pt-BR")}
        >
          <option value="pt-BR">Português</option>
          <option value="en">English</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => setDarkMode(!dark)}>
          {dark ? "Light" : "Dark"}
        </Button>
        <output
          title={
            caseId === "digixros"
              ? locale === "pt-BR"
                ? "Ative ou recuse o domador à esquerda; depois selecione materiais no centro."
                : "Accept or decline the Tamer on the left; then select materials in the center."
              : undefined
          }
        >
          {caseId === "digixros" ? "left → center" : current[2]}
        </output>
        <a href="/">{locale === "pt-BR" ? "Voltar" : "Back"}</a>
      </header>
      <div ref={boardRef} className="effect-prompt-gallery__board">
        <GameScreen
          key={`${caseId}-${revision}`}
          joinOptions={{ displayName: "Effect gallery", deck: { mainDeck: [], eggDeck: [] } }}
          identityColor="Red"
          onExit={() => window.location.assign("/")}
          demoConnection={{
            room: combatPreview
              ? ({
                  connection: { isOpen: true },
                  state,
                  onMessage: () => () => {},
                  send: (type: string, payload: object) => {
                    if (type === "respondAlliance" || type === "declareBlock") respond({ type, ...payload });
                  },
                } as unknown as AegisRoom)
              : undefined,
            status: "connected",
            state,
            events: [],
            batches: [],
            decision: active ? boardDecision : undefined,
            respondDecision: respond,
            acknowledgeDecision: () => {},
            error: undefined,
            sessionId: "arena-demo-0",
            roomCode: "",
          }}
        />
        {active ? (
          boardDecision || combatPreview ? null : (
            <GalleryPrompt key={`${caseId}-${revision}`} caseId={caseId} board={boardRef.current} onRespond={respond} />
          )
        ) : (
          <section className="effect-prompt-gallery__response" role="status">
            <strong>{locale === "pt-BR" ? "Resposta enviada" : "Response sent"}</strong>
            <pre>{JSON.stringify(response, null, 2)}</pre>
            <Button onClick={() => selectCase(caseId)}>
              {locale === "pt-BR" ? "Reabrir cenário" : "Replay scenario"}
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

function GalleryPrompt({
  caseId,
  board,
  onRespond,
}: {
  caseId: CaseId;
  board: HTMLElement | null;
  onRespond: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [picks, setPicks] = useState<string[]>([]);
  const [counterSource, setCounterSource] = useState<string>();
  const [zoom, setZoom] = useState<string>();
  const [optionalDialog, setOptionalDialog] = useState(false);
  const permanents = useMemo(
    () => [
      permanent({
        permanentId: "gallery-host-1",
        cardId: CARDS.champion,
        baseDP: 4000,
        stackCardIds: [CARDS.egg, CARDS.rookie],
      }),
      permanent({
        permanentId: "gallery-host-2",
        cardId: CARDS.ultimate,
        baseDP: 7000,
        stackCardIds: [CARDS.rookie, CARDS.champion],
      }),
      permanent({
        permanentId: "gallery-host-3",
        cardId: CARDS.opponentChampion,
        baseDP: 5000,
        seat: 1,
        suspended: true,
      }),
    ],
    [],
  );
  const close = () => onRespond({ action: "cancel" });
  const yesNo = (action: string) => onRespond({ action });
  if (caseId === "waiting" || caseId === "waiting-error")
    return (
      <WaitingOverlay
        title={caseId === "waiting" ? "Conectando à partida" : "Não foi possível conectar"}
        detail={
          caseId === "waiting" ? "Aguarde enquanto a conexão é estabelecida." : "Confira sua conexão e tente novamente."
        }
        spinner={caseId === "waiting"}
        actionLabel={caseId === "waiting-error" ? "Tentar novamente" : undefined}
        onAction={() => yesNo("retry")}
        cancelLabel={t("common.cancel")}
        onCancel={close}
      />
    );
  if (caseId === "arena-settings")
    return <ArenaLookDialog deckColors={{ player: "Red", opponent: "Purple" }} onClose={close} />;
  if (caseId === "feedback") return <BugReportDialog signedIn={false} matchLogId="modal-preview" onClose={close} />;
  if (caseId === "surrender") return <SurrenderDialog onConfirm={() => yesNo("surrender")} onClose={close} />;
  if (caseId === "barrier" || caseId === "evade") {
    const Component = caseId === "barrier" ? BarrierOverlay : EvadeOverlay;
    return <Component onAccept={() => yesNo("accept")} onDecline={() => yesNo("decline")} />;
  }
  if (caseId.startsWith("counter-")) {
    const eligibleCounters =
      caseId === "counter-field"
        ? [
            {
              instanceId: "field-counter",
              effectKey: "gallery/counter",
              description: getCardDefinition("BT10-083")?.effectText ?? "[Counter] Activate this effect.",
            },
          ]
        : caseId === "counter-blast"
          ? [
              {
                instanceId: "blast-hand",
                effectKey: "blast-digivolve:gallery-host-1",
                description: "Blast Digivolve",
              },
              {
                instanceId: "blast-hand",
                effectKey: "blast-digivolve:gallery-host-2",
                description: "Blast Digivolve",
              },
            ]
          : [
              {
                instanceId: "blast-hand",
                effectKey: "blast-digivolve:gallery-host-1",
                description: "Blast Digivolve",
              },
              {
                instanceId: "field-counter",
                effectKey: "gallery/counter",
                description: "[Counter] Activate this effect.",
              },
            ];
    return (
      <CounterOverlay
        eligibleCounters={eligibleCounters}
        getCardId={(id) =>
          permanents.find((entry) => entry.permanentId === id)?.topCard.cardId ??
          (id === "blast-hand" ? "BT12-017" : "BT10-083")
        }
        fieldPermanentOf={(id) => (id === "field-counter" ? "gallery-host-1" : undefined)}
        selectedInstanceId={counterSource ?? (caseId === "counter-blast" ? "blast-hand" : undefined)}
        onSelectInstance={setCounterSource}
        handInstanceIds={["blast-hand"]}
        onActivate={(instanceId, effectKey) => onRespond({ action: "counter", instanceId, effectKey })}
        onPass={() => yesNo("pass")}
      />
    );
  }
  if (caseId === "confirm-action")
    return (
      <ActionConfirmationOverlay
        cardId={CARDS.mega}
        title={t("overlay.confirmActionTitle")}
        detail={t("overlay.confirmPlayDetail", { card: getCardDefinition(CARDS.mega)?.nameEn ?? CARDS.mega })}
        confirmLabel={t("overlay.confirmPlay")}
        onConfirm={() => yesNo("play")}
        onCancel={close}
      />
    );
  if (caseId === "dual-play")
    return (
      <DualPlayChoiceOverlay
        cardId="EX13-066"
        onChoose={(useAs) => onRespond({ action: "dualPlay", useAs })}
        onCancel={close}
      />
    );
  if (caseId === "evo-cost")
    return (
      <EvoCostChoiceOverlay
        evolvingCardId={CARDS.ultimate}
        baseCardId={CARDS.champion}
        memory={3}
        options={[
          { type: "normal", label: "Normal", cost: 4 },
          { type: "alternate", label: "Alternate requirement", cost: 2, alternateRequirementIndex: 0 },
        ]}
        onConfirm={(route) => onRespond({ action: "digivolve", route })}
        onCancel={close}
      />
    );
  if (caseId === "assembly")
    return (
      <AssemblyMaterialOverlay
        playingCardId="EX13-014"
        requirements={assemblyRequirementFor("EX13-014") ?? []}
        candidates={["BT20-014", "BT13-013", "BT20-008", "BT1-010"].map((cardId, index) => ({
          instanceId: `trash-${index}`,
          cardId,
        }))}
        onConfirm={(instanceIds) => onRespond({ action: "assembly", instanceIds })}
        onSkip={() => yesNo("normalPlay")}
        onCancel={close}
      />
    );
  if (caseId === "digixros-expander")
    return (
      <DigiXrosExpanderPrompt
        expander={EXPANDER}
        copyIndex={1}
        copyCount={1}
        onAnswer={(accept) => onRespond({ action: "expander", accept })}
      />
    );
  if (caseId === "digixros")
    return (
      <DigiXrosMaterialOverlay
        playingCardId="BT10-024"
        requirements={digiXrosRequirementFor("BT10-024") ?? []}
        candidates={[
          { instanceId: "mailbirdramon-hand", cardId: "BT10-021", zone: "hand" },
          { instanceId: "greymon-field", cardId: "BT10-019", zone: "battle" },
        ]}
        lockedCandidates={[{ instanceId: "greymon-under", cardId: "BT10-019", zone: "underTamer" }]}
        eligibleExpanders={[EXPANDER]}
        onConfirm={(instanceIds, expanders) => onRespond({ action: "digiXros", instanceIds, expanders })}
        onSkip={() => yesNo("normalPlay")}
        onCancel={close}
      />
    );
  if (caseId.startsWith("app-fusion"))
    return (
      <AppFusionChoiceOverlay
        resultCardId="BT23-021"
        hostCardId="BT23-016"
        routes={
          caseId === "app-fusion-empty"
            ? []
            : [
                { linkedInstanceId: "link-1", linkedCardId: "BT23-039", projectedCost: 2 },
                { linkedInstanceId: "link-2", linkedCardId: "BT23-007", projectedCost: 3 },
              ]
        }
        onConfirm={(linkedInstanceId) => onRespond({ action: "appFusion", linkedInstanceId })}
        onNormalEvolution={() => yesNo("normalEvolution")}
        onCancel={close}
      />
    );
  if (caseId.startsWith("mulligan-"))
    return (
      <MulliganOverlay
        handCardIds={SELECT_CARDS.slice(0, 5)}
        turnOrder={caseId === "mulligan-first" ? "first" : "second"}
        onKeep={() => yesNo("keep")}
        onMulligan={() => yesNo("mulligan")}
      />
    );
  if (caseId === "inherited-inspector")
    return (
      <>
        <ArenaPermanentInspector
          detail={buildPermanentDetail(INSPECTED_PERMANENT, { viewerSeat: 0 })}
          inspection={{ side: Side.Viewer, container: board }}
          onClose={close}
          onZoom={setZoom}
          zoomed={zoom !== undefined}
        />
        {zoom ? <CardZoomOverlay cardId={zoom} onClose={() => setZoom(undefined)} /> : null}
      </>
    );

  let candidates: { instanceId: string; cardId?: string; zone?: CandidateZone }[] = SELECT_CARDS.map(
    (cardId, index) => ({ instanceId: `hand-${index}`, cardId, zone: "hand" }),
  );
  const request: DecisionRequest = {
    decisionId: `gallery-${caseId}`,
    seat: 0,
    kind: "optional",
    promptText: "",
    sourceCardId: CARDS.champion,
    options: { timing: "OnUseAttack", effectText: getCardDefinition(CARDS.champion)?.effectText, min: 0, max: 2 },
  };
  if (caseId.startsWith("optional-")) candidates = [];
  if (caseId === "optional-attack-resolving") {
    request.sourceCardId = "BT20-016";
    request.options = {
      timing: "OnPlay",
      effectText: getCardDefinition("BT20-016")?.effectText,
      effectTextPart: "Then, this Digimon may attack.",
      promptKey: "attackAlreadyResolving",
      activationConfirmation: true,
    };
  }
  if (["trash-recovery", "revealed-search"].includes(caseId) || caseId.startsWith("sukamon-")) {
    const trash = caseId === "trash-recovery";
    const sukamon = caseId.startsWith("sukamon-");
    const sourceCardId = trash
      ? "BT2-090"
      : !sukamon
        ? "BT3-093"
        : caseId === "sukamon-bt11"
          ? "BT11-040"
          : caseId === "sukamon-bt3"
            ? "BT3-063"
            : "EX13-028";
    const cardIds = trash
      ? ["BT2-069", "BT2-108", "BT1-010"]
      : sukamon
        ? ["BT3-061", caseId === "sukamon-bt3" ? "BT3-061" : "BT14-034", "BT1-010"]
        : ["BT1-027", "BT1-064", "BT1-010"];
    candidates = cardIds.map((cardId, index) => ({
      instanceId: `gallery-search-${index}`,
      cardId,
      ...(trash ? { zone: "trash" as const } : {}),
    }));
    request.kind = "selectCards";
    request.sourceCardId = sourceCardId;
    request.options = {
      min: 0,
      max: 1,
      timing: trash || !sukamon ? "OnPlay" : "OnDeletion",
      effectText: getCardDefinition(sourceCardId)?.effectText,
      candidateInstanceIds: (caseId === "revealed-search" ? candidates.slice(0, 1) : candidates.slice(0, 2)).map(
        (card) => card.instanceId,
      ),
    };
  }

  if (caseId === "choose-yes-no") {
    request.kind = "chooseOption";
    request.options = { choices: [t("overlay.use"), t("overlay.notUse")], declineIndex: 1 };
    candidates = [];
  }
  if (caseId === "choose-clauses") {
    request.kind = "chooseOption";
    request.sourceCardId = "BT22-013";
    request.options = {
      choices: ["Digivolve", "Delete", "Don't use"],
      timing: "WhenDigivolving",
      effectText: getCardDefinition("BT22-013")?.effectText,
      choiceClauses: [
        "1 of your [Gabumon] may digivolve into [MetalGarurumon] in the hand, ignoring digivolution requirements and without paying the cost.",
        "Delete 1 of your opponent's Digimon with the lowest DP.",
        "",
      ],
      declineIndex: 2,
    };
    candidates = [];
  }
  if (caseId === "choose-effects") {
    request.kind = "chooseOption";
    request.options = {
      choices: ["Agumon effect", "Greymon effect"],
      choiceEffects: [
        { cardId: CARDS.rookie, isInherited: true },
        { cardId: CARDS.champion, isInherited: true },
      ],
    };
    candidates = [];
  }
  if (caseId === "choose-revealed") {
    request.kind = "chooseOption";
    request.options = { choices: ["top", "bottom"], topBottomZone: "deck" };
    candidates = candidates.slice(0, 3);
  }
  if (caseId.startsWith("select-")) {
    request.kind = "selectCards";
    if (caseId === "select-field" || caseId === "select-dp-budget") {
      request.kind = "chooseTargets";
      candidates = permanents.map((entry) => ({
        instanceId: entry.permanentId,
        cardId: entry.topCard.cardId,
        zone: entry.controllerSeat === 0 ? "battle" : "opponentBattle",
      }));
    }
    if (caseId === "select-mixed")
      candidates = candidates.map((entry, index) => ({
        ...entry,
        zone: ["hand", "trash", "battle", "digivolutionCards", "security", "opponentBattle"][index] as CandidateZone,
      }));
    if (caseId === "select-player") {
      request.kind = "chooseTargets";
      request.sourcePermanentId = "gallery-host-1";
      candidates = [{ instanceId: "player" }];
      request.options = { min: 1, max: 1, candidateInstanceIds: ["player"], selectionContext: "attackTarget" };
    }
    if (caseId === "select-empty") candidates = [];
    if (caseId === "select-dp-budget") request.options = { min: 1, max: 3, maxTotalDP: 12000, targetFate: "delete" };
    if (caseId === "select-cost-budget") request.options = { min: 0, max: 3, maxTotalPlayCost: 7 };
    request.options = { ...request.options, candidateInstanceIds: candidates.map((entry) => entry.instanceId) };
  }
  if (caseId === "order-cards") {
    request.kind = "orderCards";
    request.options = { orderDestination: "deckBottom" };
    candidates = candidates.slice(0, 4);
  }
  if (["order-triggers", "order-same-card", "resolution-plan"].includes(caseId)) {
    Object.assign(request, caseId === "order-same-card" ? SAME_PERMANENT_TRIGGER_DECISION : TRIGGER_DECISION);
    request.decisionId = `gallery-${caseId}`;
    request.options = {
      ...request.options,
      acceptsResolutionPlan: caseId === "resolution-plan",
      triggerDescriptions: [
        getCardDefinition(CARDS.champion)?.effectText ?? "",
        getCardDefinition(CARDS.ultimate)?.effectText ?? "",
      ],
      triggerIsOptional: [true, false],
      waitingTriggerCardIds: caseId === "resolution-plan" ? [CARDS.rookie] : [],
    };
    candidates = [];
  }
  if (caseId === "partition") {
    request.kind = "selectCards";
    candidates = candidates.slice(0, 1);
    request.options = {
      min: 0,
      max: 1,
      selectionContext: "partitionActivation",
      candidateInstanceIds: [candidates[0]!.instanceId],
    };
  }
  if (caseId === "effect-evo-cost") {
    request.kind = "chooseOption";
    request.options = {
      choices: ["Normal", "Alternate"],
      digivolveCostChoice: { fromCardId: CARDS.champion, intoCardId: CARDS.ultimate, costs: [4, 2], costDelta: -1 },
    };
    candidates = [];
  }
  return (
    <DecisionPrompts
      decision={request}
      answerOnBoard={caseId === "optional-field" && !optionalDialog}
      permanents={permanents}
      sourceCardId={request.sourceCardId}
      candidates={candidates}
      allowsPick={(id) =>
        picks.includes(id) ||
        ((request.options?.candidateInstanceIds?.includes(id) ?? true) && picks.length < (request.options?.max ?? 1))
      }
      picks={picks}
      min={request.options?.min ?? 1}
      max={request.options?.max ?? 1}
      triggerDetails={[]}
      opponentSecurityCount={5}
      onTogglePick={(id) =>
        setPicks((selected) => (selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]))
      }
      onRespond={onRespond}
      onOpenDialog={() => setOptionalDialog(true)}
    />
  );
}
