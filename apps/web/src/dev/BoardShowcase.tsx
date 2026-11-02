/* Dev-only gallery of the match screen's presentational pieces, rendered from
   fixtures instead of a live Colyseus room so a styling change can be reviewed
   without playing a match. Reached at /dev/board. */

import { AttackArrow, BreedingSlot, Hand, MemoryGauge, PermanentView, Pile, TurnControl } from "../game/piece";
import { pendingFateBadge } from "../game/pendingFate";
import { buildPermanentDetail } from "../game/permanentDetail";
import { CardShatter } from "../game/CardShatterView";
import { PlayLogSidebar } from "@/game/log/PlayLogSidebar";
import { TARGET_FATES, Phase } from "@aegis/shared";
import { dragIntentLabelKey } from "../game/dragIntents";
import {
  BlockOverlay,
  DecisionOverlay,
  GameOverOverlay,
  MulliganOverlay,
  CardZoomOverlay,
  PermanentDetailInspector,
} from "../game/overlay";
import { BoardOptionalPrompt, BoardSelectionRail, OpponentSelectingPill } from "../game/BoardDecisionRail";
import { CardBurst } from "../game/CardBurst";
import { SecurityBranch, SecurityClash, SecurityEdgeFlash } from "../game/SecurityClashView";
import { ZoneShowcase } from "../game/ZoneShowcase";
import { NoticeStack } from "../game/NoticeStack";
import { SidePanelStack } from "../game/SidePanelStack";
import { NOTICE_LIFETIME_MS } from "../game/notices";
import { SIDE_PANEL_LIFETIME_MS } from "../game/sidePanels";
import { Side } from "../game/side";
import { useTranslation } from "../i18n";
import {
  BATTLE_CLASH,
  CARDS,
  DUAL_COLOR_CARD,
  HAND_SELECTION_DECISION,
  INSPECTED_PERMANENT,
  LARGE_HAND,
  MIXED_HAND,
  NOTICE_CASES,
  PANEL_CASES,
  PERMANENTS,
  SAME_PERMANENT_TRIGGER_DECISION,
  SHOWCASE_LOG_TURNS,
  TARGET_DECISION,
  TRIGGER_DECISION,
  ZONE_SHOWCASES,
  handEntry,
  noop,
  permanent,
  showcaseBurst,
} from "./boardShowcaseFixtures";
import { Case, Section, SpotlightStage, Stage } from "./boardShowcaseLayout";
import "../game/game.css";
import "./boardShowcase.css";

export function BoardShowcase() {
  const { t } = useTranslation();
  return (
    <main className="game-layout board-showcase">
      <header className="board-showcase__intro">
        <h1 className="board-showcase__title">Board showcase</h1>
        <p className="board-showcase__lead">
          Every match-screen piece rendered from fixtures. Nothing here talks to a room, so a styling change can be
          reviewed by scrolling.
        </p>
      </header>

      <Section
        id="showcase-memory-gauge"
        title="memory gauge"
        note="Hex gauge with the lit marker, plus the end-turn orb that rides the band's right edge."
        stacked
      >
        {[-10, -3, 0, 3, 10].map((value) => (
          <Case key={value} label={`memory ${value > 0 ? `+${value}` : value}`}>
            <div className="game-memory-band" style={{ position: "relative" }}>
              <MemoryGauge value={value} phaseLabel="Main" />
              <button className={`game-end-turn-orb${value < 0 ? " game-end-turn-orb--waiting" : ""}`}>
                {value < 0 ? "Opponent's turn" : "End turn"}
              </button>
            </div>
          </Case>
        ))}
        <Case label="compact (narrow viewport)">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <MemoryGauge value={3} compact phaseLabel="Main" />
          </div>
        </Case>
      </Section>

      <Section
        id="showcase-memory-arc"
        title="memory jump"
        note="A change of two chips or more traces a red arc from the chip memory left to the one it landed on, over the ringed chip that marks where memory sits now. A single step keeps the marker pop alone. Reduced motion drops the arc."
        stacked
      >
        <Case label="spent 5 memory (+3 → −2)">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <MemoryGauge value={-2} phaseLabel="Main" arc={{ from: 3, to: -2 }} />
          </div>
        </Case>
        <Case label="gained 9 memory (−6 → +3)">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <MemoryGauge value={3} phaseLabel="Main" arc={{ from: -6, to: 3 }} />
          </div>
        </Case>
        <Case label="unsuspend sweep (phase pill pulses)">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <MemoryGauge value={2} phaseLabel="Active" phaseSweeping />
          </div>
        </Case>
      </Section>

      <Section
        id="showcase-turn-control"
        title="turn control"
        note="One round control rides the memory band through the whole turn: it ends the breeding step, then the turn, then waits out the opponent's. All three send the same endPhase intent the server advances on."
      >
        <Case label="end turn">
          <TurnControl state="endTurn" onEndPhase={noop} />
        </Case>
        <Case label="end breeding">
          <TurnControl state="endBreeding" onEndPhase={noop} />
        </Case>
        <Case label="opponent's turn (disabled)">
          <TurnControl state="waiting" onEndPhase={noop} />
        </Case>
      </Section>

      <Section
        id="showcase-breeding-mode"
        title="breeding step"
        note="During the viewer's own breeding phase (server truth: phase Breeding on their turn) the field dims and the raising slot keeps the accent ring. The dim sits under the memory band and far under every notice, panel and dialog, so nothing readable is greyed out."
        stacked
      >
        <Stage label="field dimmed, raising slot lit" height={260}>
          <div className="game-breeding-mode" />
          <div style={{ position: "absolute", right: 32, bottom: 28 }}>
            <BreedingSlot
              label="Breeding"
              focused
              perm={permanent({ permanentId: "p-breed-focus", cardId: CARDS.rookie, baseDP: 3000 })}
            />
          </div>
        </Stage>
      </Section>

      <Section
        id="showcase-drag-intents"
        title="drag intents"
        note="While a card is in the air, every area that would accept it wears the accent ring and the hovered one floats the name of what release would send. Legality is the server's projection, read through dragIntents.ts."
      >
        {(["play", "evolve", "breeding", "use", "attack"] as const).map((intent) => (
          <Case key={intent} label={intent}>
            <span className="game-drag-intent" data-intent={intent} style={{ position: "relative", translate: "none" }}>
              {t(dragIntentLabelKey(intent))}
            </span>
          </Case>
        ))}
        <Case label="valid drop area (accent ring)">
          <div data-drop="battle-you" data-drag-intent="play" style={{ padding: "18px 26px" }}>
            <PermanentView perm={permanent({ permanentId: "p-drop", cardId: CARDS.champion, baseDP: 4000 })} />
          </div>
        </Case>
      </Section>

      <Section
        id="showcase-hand"
        title="hand"
        note="Playable cards carry the cyan glow the server projection drives; the selected card lifts out of the fan."
        stacked
      >
        <Case label="mixed: playable, not playable, digivolve target">
          <Hand cards={MIXED_HAND} startDrag={noop} selectCard={noop} />
        </Case>
        <Case label="selected card">
          <Hand cards={MIXED_HAND} selectedInstanceId="hand-2" startDrag={noop} selectCard={noop} />
        </Case>
        <Case label="ten cards (fan tightens)">
          <Hand cards={LARGE_HAND} startDrag={noop} selectCard={noop} />
        </Case>
        <Case label="refused play (0.25s shake, frozen)">
          <Hand cards={MIXED_HAND} shakeInstanceId="hand-0" startDrag={noop} selectCard={noop} />
        </Case>
      </Section>

      <Section
        id="showcase-permanents"
        title="permanents"
        note="Digivolution stack depth, DP delta badge, granted keywords, suspension and the attack-candidate glow."
      >
        <Case label="plain">
          <PermanentView perm={permanent({ permanentId: "p-plain", cardId: CARDS.champion, baseDP: 4000 })} />
        </Case>
        <Case label="suspended">
          <PermanentView
            perm={permanent({ permanentId: "p-susp", cardId: CARDS.champion, baseDP: 4000, suspended: true })}
          />
        </Case>
        <Case label="DP gain">
          <PermanentView
            perm={permanent({ permanentId: "p-up", cardId: CARDS.ultimate, baseDP: 7000, currentDP: 10000 })}
          />
        </Case>
        <Case label="DP loss">
          <PermanentView
            perm={permanent({ permanentId: "p-down", cardId: CARDS.ultimate, baseDP: 7000, currentDP: 4000 })}
          />
        </Case>
        <Case label="digivolution stack">
          <PermanentView
            perm={permanent({
              permanentId: "p-stack",
              cardId: CARDS.mega,
              baseDP: 12000,
              stackCardIds: [CARDS.egg, CARDS.rookie, CARDS.champion],
            })}
          />
        </Case>
        <Case label="granted keywords">
          <PermanentView
            perm={permanent({
              permanentId: "p-keywords",
              cardId: CARDS.mega,
              baseDP: 12000,
              grantedKeywords: ["Blocker", "Rush", "Piercing", "Security Attack +1"],
            })}
          />
        </Case>
        <Case label="attack candidate">
          <PermanentView
            perm={permanent({ permanentId: "p-cand", cardId: CARDS.opponentChampion, baseDP: 4000, seat: 1 })}
            candidate
          />
        </Case>
        <Case label="selected (highlight)">
          <PermanentView
            perm={permanent({ permanentId: "p-sel", cardId: CARDS.champion, baseDP: 4000 })}
            highlight
            onClick={noop}
          />
        </Case>
        <Case label="dimmed (illegal target)">
          <PermanentView perm={permanent({ permanentId: "p-dim", cardId: CARDS.champion, baseDP: 4000 })} dimmed />
        </Case>
      </Section>

      <Section id="showcase-breeding" title="breeding slot" note="Empty, occupied, and lit as a hatch/move candidate.">
        <Case label="empty">
          <BreedingSlot label="Breeding" />
        </Case>
        <Case label="occupied">
          <BreedingSlot label="Breeding" perm={permanent({ permanentId: "p-egg", cardId: CARDS.egg, baseDP: 0 })} />
        </Case>
        <Case label="candidate">
          <BreedingSlot label="Breeding" candidate />
        </Case>
        <Case label="compact">
          <BreedingSlot
            label="Breeding"
            compact
            perm={permanent({ permanentId: "p-egg-compact", cardId: CARDS.egg, baseDP: 0 })}
          />
        </Case>
      </Section>

      <Section
        id="showcase-security"
        title="security shields and piles"
        note="Shields are red for the viewer and blue for the opponent; the glow marks an attackable stack."
      >
        <Case label="yours">
          <Pile count={5} label="Security" shield={Side.Viewer} />
        </Case>
        <Case label="opponent">
          <Pile count={3} label="Security" shield={Side.Opponent} />
        </Case>
        <Case label="opponent, attackable">
          <Pile count={3} label="Security" shield={Side.Opponent} glow onClick={noop} />
        </Case>
        <Case label="empty">
          <Pile count={0} label="Security" shield={Side.Viewer} dim />
        </Case>
        <Case label="deck pile">
          <Pile count={40} label="Deck" />
        </Case>
        <Case label="trash pile (top card)">
          <Pile count={7} label="Trash" topCardId={CARDS.option} onClick={noop} />
        </Case>
        <Case label="deck pile, compact">
          <Pile count={12} label="Egg" compact />
        </Case>
      </Section>

      <Section
        id="showcase-shield-break"
        title="shield break"
        note="What an attack on security plays before the reveal: the defender's shield arms, its pane shatters into shards over a blue burst, and the light washes in from the defender's edge of the board. Held mid-sequence here; in a match the three beats run back to back and reduced motion drops them."
      >
        <Case label="armed (attack declared)">
          <Pile count={4} label="Security" shield={Side.Viewer} armed />
        </Case>
        <Case label="breaking (yours)">
          <Pile count={3} label="Security" shield={Side.Viewer} breaking />
        </Case>
        <Case label="breaking (opponent's)">
          <Pile count={2} label="Security" shield={Side.Opponent} breaking />
        </Case>
        <Stage label="edge flash, viewer attacked" height={220}>
          <SecurityEdgeFlash scene={{ key: 1, seat: 0, side: Side.Viewer, seed: 1 }} />
        </Stage>
        <Stage label="edge flash, opponent attacked" height={220}>
          <SecurityEdgeFlash scene={{ key: 2, seat: 1, side: Side.Opponent, seed: 2 }} />
        </Stage>
      </Section>

      <Section
        id="showcase-security-branch"
        title="security-effect branch"
        note="A revealed security card that resolves an effect leaves the centre and holds on the half of the screen the side panels do not occupy, where its effect notice reads beside it."
        stacked
      >
        <Stage label="viewer's security resolving" height={460}>
          <SecurityBranch scene={{ key: 1, cardId: CARDS.option, side: Side.Viewer, state: "docked" }} />
        </Stage>
        <Stage label="opponent's security resolving" height={460}>
          <SecurityBranch scene={{ key: 2, cardId: CARDS.opponentChampion, side: Side.Opponent, state: "settled" }} />
        </Stage>
      </Section>

      <Section
        id="showcase-summoning-ring"
        title="summoning sickness and suspension"
        note="The ring is server truth (`Permanent.summoningSick`): the Digimon entered this turn without ＜Rush＞ and cannot attack yet. Suspension turns the card 90° over 200 ms, staggered by slot when the unsuspend phase sweeps the board."
      >
        <Case label="cannot attack yet">
          <PermanentView
            perm={permanent({ permanentId: "p-sick", cardId: CARDS.champion, baseDP: 4000, summoningSick: true })}
          />
        </Case>
        <Case label="fresh Tamer">
          <PermanentView
            perm={permanent({ permanentId: "p-sick-tamer", cardId: CARDS.tamer, baseDP: 0, summoningSick: true })}
          />
        </Case>
        <Case label="suspended">
          <PermanentView
            perm={permanent({ permanentId: "p-turned", cardId: CARDS.ultimate, baseDP: 6000, suspended: true })}
          />
        </Case>
        <Case label="suspended, late in the sweep">
          <PermanentView
            perm={permanent({ permanentId: "p-turned-late", cardId: CARDS.mega, baseDP: 12000, suspended: true })}
            suspendDelayMs={180}
          />
        </Case>
      </Section>

      <Section
        id="showcase-zone-showcase"
        title="centre-screen showcase"
        note="What the board holds up when the opponent plays or digivolves: the card large in the middle, its destination hidden behind it, and the colour-keyed halo underneath. Held still here; in a match it grows in, waits ~900 ms and clears — a click anywhere skips it, and reduced motion drops it entirely."
        stacked
      >
        {ZONE_SHOWCASES.map(({ label, showcase }) => (
          <Stage key={label} label={label} height={700}>
            <ZoneShowcase showcase={showcase} />
          </Stage>
        ))}
      </Section>

      <Section
        id="showcase-bursts"
        title="colour-keyed bursts"
        note="One burst component for every landing, coloured by the moment: an arrival takes the card's colour, an evolution burns red into orange, a hatch opens white into blue behind a darkened slot, and a turn-start draw lands on the same blue starburst."
      >
        <Case label="play (card colour)">
          <PermanentView
            perm={permanent({ permanentId: "p-burst-play", cardId: CARDS.champion, baseDP: 4000 })}
            burst={showcaseBurst("play", { permanentId: "p-burst-play", color: "Green" })}
          />
        </Case>
        <Case label="evolution (arc rings)">
          <PermanentView
            perm={permanent({
              permanentId: "p-burst-evolve",
              cardId: CARDS.ultimate,
              baseDP: 6000,
              stackCardIds: [CARDS.rookie],
            })}
            burst={showcaseBurst("evolve", { permanentId: "p-burst-evolve" })}
          />
        </Case>
        <Case label="hatch (breeding slot)">
          <BreedingSlot
            label="Breeding"
            perm={permanent({ permanentId: "p-burst-hatch", cardId: CARDS.egg, baseDP: 0 })}
            burst={showcaseBurst("hatch", { permanentId: "p-burst-hatch", inBreeding: true })}
          />
        </Case>
        <Case label="breeding evolution (spotlight)">
          <BreedingSlot
            label="Breeding"
            perm={permanent({ permanentId: "p-burst-breed", cardId: CARDS.rookie, baseDP: 3000 })}
            burst={showcaseBurst("evolve", { permanentId: "p-burst-breed", inBreeding: true })}
          />
        </Case>
        <Stage label="permanent deleted" height={180}>
          <span className="game-delete-burst" style={{ left: 60, top: 30 }}>
            <CardBurst variant="delete" />
          </span>
        </Stage>
        <Stage label="turn-start draw lands" height={180}>
          <span className="game-draw-burst" style={{ left: 90, top: 66 }}>
            <CardBurst variant="draw" />
          </span>
        </Stage>
      </Section>

      <Section
        id="showcase-turn-banner"
        title="turn banner"
        note="The translucent band opens from the middle and the words slide through it. Held still here; in a match it plays once at every turn change."
        stacked
      >
        <Stage label="your turn" height={180}>
          <div className="game-turn-banner game-turn-banner--you" style={{ animation: "none" }}>
            <span>Your turn</span>
          </div>
        </Stage>
        <Stage label="opponent's turn" height={180}>
          <div className="game-turn-banner game-turn-banner--opp" style={{ animation: "none" }}>
            <span>Opponent's turn</span>
          </div>
        </Stage>
      </Section>

      <Section id="showcase-attack-arc" title="attack arc" note="The arc the pointer drags from attacker to target.">
        <Stage label="short arc" height={220}>
          <AttackArrow from={{ x: 60, y: 190 }} to={{ x: 300, y: 40 }} />
        </Stage>
        <Stage label="long arc" height={220}>
          <AttackArrow from={{ x: 40, y: 200 }} to={{ x: 520, y: 30 }} />
        </Stage>
      </Section>

      <Section
        id="showcase-side-panels"
        title="timed side panels"
        note="One panel at a time: the presentation queue decides which moment a slot is showing. The cyan ring erodes clockwise over the fixed reading time the panel opened with, which nothing else on the board shortens."
        stacked
      >
        {PANEL_CASES.map(({ label, panels }) => (
          <Stage key={label} label={label} height={560}>
            {panels.map((panel) => (
              <SidePanelStack key={panel.id} panel={panel} remainingMs={SIDE_PANEL_LIFETIME_MS} onDismiss={noop} />
            ))}
          </Stage>
        ))}
      </Section>

      <Section
        id="showcase-notices"
        title="notice stack"
        note="Corner-framed notices, one per narration slot: the viewer's moments on the left, the opponent's on the right, and a refusal in its own slot because it answers the viewer's own tap."
        stacked
      >
        {NOTICE_CASES.map(({ label, notices }) => (
          <Stage key={label} label={label} height={460}>
            {notices.map((notice) => (
              <NoticeStack key={notice.id} notice={notice} remainingMs={NOTICE_LIFETIME_MS} onDismiss={noop} />
            ))}
          </Stage>
        ))}
      </Section>

      <Section
        id="showcase-board-decisions"
        title="board-mode decisions"
        note="Decisions the board can answer without a dialog: a hand-only selection picks its cards in place beside the left rail, an optional effect asks Use / Not use next to the field it changes, and the pill says the opponent has a decision of their own open."
        stacked
      >
        <Stage label="hand selection rail (cards picked in place)" height={420}>
          <BoardSelectionRail
            prompt={HAND_SELECTION_DECISION.promptText}
            min={0}
            max={2}
            pickCount={1}
            canConfirm
            onConfirm={noop}
            onNoSelection={noop}
            onOpenDialog={noop}
          />
          <div style={{ position: "absolute", right: 24, bottom: 40, width: 460 }}>
            <Hand
              cards={MIXED_HAND}
              startDrag={noop}
              selection={{
                selectableInstanceIds: HAND_SELECTION_DECISION.options?.candidateInstanceIds ?? [],
                pickedInstanceIds: ["hand-1"],
                onToggle: noop,
              }}
            />
          </div>
        </Stage>
        <Stage label="Use / Not use rail" height={420}>
          <BoardOptionalPrompt
            sourceCardId={CARDS.mega}
            clause="Delete 1 of your opponent's Digimon with 5000 DP or less."
            onUse={noop}
            onDecline={noop}
            onOpenDialog={noop}
          />
        </Stage>
        <Stage label="opponent is selecting cards" height={280}>
          <OpponentSelectingPill />
        </Stage>
      </Section>

      <Section
        id="showcase-field-badges"
        title="persistent field badges"
        note="The Blocker shield, the ×N digivolution-source count tinted by the top card, and the DP chip a dual-colour Digimon splits between both of its colours."
      >
        <Case label="blocker">
          <PermanentView
            perm={permanent({ permanentId: "b-1", cardId: CARDS.champion, baseDP: 4000, keywords: ["Blocker"] })}
          />
        </Case>
        <Case label="×3 sources">
          <PermanentView
            perm={permanent({
              permanentId: "b-2",
              cardId: CARDS.mega,
              baseDP: 12000,
              stackCardIds: [CARDS.egg, CARDS.rookie, CARDS.champion],
            })}
          />
        </Case>
        <Case label="dual-colour DP chip">
          <PermanentView perm={permanent({ permanentId: "b-3", cardId: DUAL_COLOR_CARD, baseDP: 13000 })} />
        </Case>
        <Case label="all three at once">
          <PermanentView
            perm={permanent({
              permanentId: "b-4",
              cardId: DUAL_COLOR_CARD,
              baseDP: 13000,
              stackCardIds: [CARDS.rookie, CARDS.champion],
              keywords: ["Blocker"],
            })}
          />
        </Case>
      </Section>

      <Section
        id="showcase-fate-badges"
        title="pending-fate badges"
        note="What the resolving effect will do to a chosen target. The fate is the server's own projection (DecisionRequest.options.targetFate); a prompt that carries none badges nothing."
      >
        {TARGET_FATES.map((fate) => (
          <Case key={fate} label={fate}>
            <PermanentView
              perm={permanent({ permanentId: `fate-${fate}`, cardId: CARDS.opponentChampion, baseDP: 4000, seat: 1 })}
              fate={pendingFateBadge(fate)}
            />
          </Case>
        ))}
      </Section>

      <Section
        id="showcase-combat-impact"
        title="combat impact and DP pulses"
        note="Frozen frames: the claw and the shake a permanent takes for a battle it lost, and the particles a DP change throws off. A debuff that takes the Digimon to nothing holds four times as long."
      >
        <Case label="claw slash">
          <PermanentView perm={permanent({ permanentId: "i-1", cardId: CARDS.champion, baseDP: 4000 })} claw />
        </Case>
        <Case label="buff pulse">
          <PermanentView
            perm={permanent({ permanentId: "i-2", cardId: CARDS.champion, baseDP: 4000, currentDP: 7000 })}
            dpPulse={{ permanentId: "i-2", kind: "buff", from: 4000, to: 7000, key: 1 }}
          />
        </Case>
        <Case label="debuff pulse">
          <PermanentView
            perm={permanent({ permanentId: "i-3", cardId: CARDS.champion, baseDP: 4000, currentDP: 1000 })}
            dpPulse={{ permanentId: "i-3", kind: "debuff", from: 4000, to: 1000, key: 2 }}
          />
        </Case>
        <Case label="debuff that kills (longer hold)">
          <PermanentView
            perm={permanent({ permanentId: "i-4", cardId: CARDS.champion, baseDP: 4000, currentDP: 0 })}
            dpPulse={{ permanentId: "i-4", kind: "debuffFatal", from: 4000, to: 0, key: 3 }}
          />
        </Case>
        <Case label="freeze: can't attack">
          <PermanentView
            perm={permanent({ permanentId: "i-5", cardId: CARDS.champion, baseDP: 4000 })}
            freezePulse={{ permanentId: "i-5", kind: "cannotAttack", key: 4 }}
          />
        </Case>
        <Case label="freeze: can't block">
          <PermanentView
            perm={permanent({ permanentId: "i-6", cardId: CARDS.champion, baseDP: 4000 })}
            freezePulse={{ permanentId: "i-6", kind: "cannotBlock", key: 5 }}
          />
        </Case>
      </Section>

      <Section
        id="showcase-spotlight"
        title="targeting spotlight"
        note="The board darkens around exactly the cards the server offered. A suspended card keeps a turned hole. The mask draws only — every lit card underneath keeps its pointer events."
        stacked
      >
        <Stage label="two legal targets, one of them suspended" height={280}>
          <SpotlightStage litIds={["s-1", "s-2"]}>
            <PermanentView
              perm={permanent({ permanentId: "s-1", cardId: CARDS.opponentChampion, baseDP: 4000, seat: 1 })}
              drop={{ "data-showcase-target": "s-1" }}
            />
            <PermanentView
              perm={permanent({
                permanentId: "s-2",
                cardId: CARDS.opponentUltimate,
                baseDP: 7000,
                seat: 1,
                suspended: true,
              })}
              drop={{ "data-showcase-target": "s-2", "data-showcase-suspended": "true" }}
            />
            <PermanentView perm={permanent({ permanentId: "s-3", cardId: CARDS.champion, baseDP: 4000, seat: 1 })} />
          </SpotlightStage>
        </Stage>
      </Section>

      <Section
        id="showcase-memory-prediction"
        title="memory prediction"
        note="Where memory would land if the held card were played: the same curve, drawn shallower and dashed so it nests inside the solid arc a real change leaves."
        stacked
      >
        {[
          { label: "cost 3 from +4", value: 4, prediction: 1 },
          { label: "cost 6 from +2", value: 2, prediction: -4 },
          { label: "prediction and a real change together", value: 4, prediction: 1, arc: { from: -2, to: 4 } },
        ].map((sample) => (
          <Case key={sample.label} label={sample.label}>
            <div className="game-memory-band" style={{ position: "relative" }}>
              <MemoryGauge value={sample.value} phaseLabel="Main" prediction={sample.prediction} arc={sample.arc} />
            </div>
          </Case>
        ))}
      </Section>

      <Section
        id="showcase-phase-banner"
        title="phase banner and turn control"
        note="The phase card wipes open and shut on a vertical blind. The control turns a ring while it is actionable and stops answering for 1.5s after a click."
        stacked
      >
        {[Phase.Breeding, Phase.Main].map((phase) => (
          <Case key={phase} label={`${phase} phase`}>
            <div className="game-phase-banner" style={{ position: "relative" }}>
              <span style={{ animation: "none" }}>{phase === Phase.Breeding ? "Breeding Phase" : "Main Phase"}</span>
            </div>
          </Case>
        ))}
        <Case label="turn control, actionable">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <TurnControl state="endTurn" onEndPhase={noop} />
          </div>
        </Case>
        <Case label="turn control, covered after a click">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <TurnControl state="endTurn" covered onEndPhase={noop} />
          </div>
        </Case>
        <Case label="turn control, waiting">
          <div className="game-memory-band" style={{ position: "relative" }}>
            <TurnControl state="waiting" onEndPhase={noop} />
          </div>
        </Case>
      </Section>

      <Section
        id="showcase-permanent-inspector"
        title="permanent inspector"
        note="The position as it stands: live DP against the printed figure, the keywords the server resolved (a granted one marked apart), the stack, and any pending fate."
        stacked
      >
        <Stage label="inspector, opposite side of the card" height={520}>
          <PermanentDetailInspector
            detail={buildPermanentDetail(INSPECTED_PERMANENT)}
            fate={pendingFateBadge("delete")}
            anchorX={120}
            anchorY={220}
            inline
          />
        </Stage>
      </Section>

      <Section
        id="showcase-effect-sources"
        title="effect activation, per source zone"
        note="Where the effect came from decides the moment: a permanent glows in place, the trash throws its top card up, an Option rises out of the hand fan."
      >
        <Case label="field permanent (glow + spark)">
          <PermanentView perm={PERMANENTS.champion} effectSource compact />
        </Case>
        <Case label="trash (fly-out, orange outline)">
          <Pile className="game-pile--effect-source" count={5} label="Trash" topCardId={CARDS.option} />
        </Case>
        <Case label="hand Option (rise out of the fan)">
          <div style={{ width: 320 }}>
            <Hand
              cards={[handEntry({ index: 0, cardId: CARDS.option, playable: true })]}
              effectSourceInstanceId="hand-0"
              startDrag={noop}
              cardWidth={104}
            />
          </div>
        </Case>
      </Section>

      <Section
        id="showcase-tracking-arrow"
        title="tracking target arrow"
        note="It flashes twice as it extends and then stays up, re-solving both ends as the cards move. Red for a declared attack, amber for an effect picking its targets."
        stacked
      >
        <Stage label="attack, one target" height={260}>
          <AttackArrow from={{ x: 60, y: 210 }} to={{ x: 300, y: 40 }} tracking />
        </Stage>
        <Stage label="effect, two targets" height={260}>
          <AttackArrow
            from={{ x: 60, y: 210 }}
            to={[
              { x: 250, y: 40 },
              { x: 340, y: 120 },
            ]}
            kind="effect"
            tracking
          />
        </Stage>
      </Section>

      <Section
        id="showcase-security-chrome"
        title="security stack chrome"
        note="A face-up card in the stack is badged; while the stack is a legal target the label says which kind of attack it would be."
      >
        <Stage label="face-up card in the stack" height={160}>
          <Pile count={4} label="Security" shield={Side.Opponent} faceUp />
        </Stage>
        <Stage label="security attack (cards left)" height={160}>
          <Pile count={3} label="Security" shield={Side.Opponent} attackLabel="Security Attack" />
        </Stage>
        <Stage label="direct attack (stack empty)" height={160}>
          <Pile count={0} label="Security" shield={Side.Opponent} attackLabel="Direct Attack" />
        </Stage>
      </Section>

      <Section
        id="showcase-deck-chrome"
        title="deck thickness and riffle"
        note="A pile is as thick as it is deep (a layer per 8 cards) and gone entirely at zero — the reference client's own deck-out warning. A shuffle riffles it."
      >
        {[40, 24, 8, 1, 0].map((count) => (
          <Case key={count} label={`${count} cards`}>
            <Pile count={count} label="Deck" />
          </Case>
        ))}
        <Case label="riffling">
          <Pile count={40} label="Deck" riffling />
        </Case>
      </Section>

      <Section
        id="showcase-shatter"
        title="deletion shatter and landing bounce"
        note="A deleted card breaks into its own art over a colour-matched burst; a card that lands drops on an OutBounce and kicks up dust."
        stacked
      >
        <Stage label="shatter" height={220}>
          <span style={{ position: "absolute", left: 40, top: 30 }}>
            <CardShatter cardId={CARDS.opponentUltimate} width={80} color="Blue" />
          </span>
        </Stage>
        <Case label="landing bounce + dust">
          <PermanentView
            perm={PERMANENTS.champion}
            burst={{ key: 1, permanentId: "p-you-1", variant: "play", color: "Red", inBreeding: false }}
            compact
          />
        </Case>
      </Section>

      <Section
        id="showcase-card-inspect"
        title="card inspection"
        note="A hand card no longer grows under the cursor: hover only lifts it clear of the fan. The first click arms the card as before; clicking the armed card opens the focused overlay the touch layout reaches through its card sheet. Other zones keep their own hover behavior."
        stacked
      >
        <Case label="hand card: hover lifts, never magnifies">
          <div style={{ width: 420 }}>
            <Hand cards={MIXED_HAND} startDrag={noop} cardWidth={104} />
          </div>
        </Case>
        <Stage label="clicking the armed card again opens this" height={520}>
          <CardZoomOverlay cardId={CARDS.mega} onClose={noop} inline />
        </Stage>
      </Section>

      <Section
        id="showcase-security-outcome"
        title="security battle outcome"
        note="The server publishes the DP compare on the check itself, so whichever side lost takes the claw, the shake and the dim while the survivor is lit for a beat — both directions, and a tie beats both. The checked card breaks into its own art whatever the compare said, because CR 13-1-8-4 trashes it either way."
        stacked
      >
        <Stage label="attacker lost (claw on the attacker)" height={420}>
          <SecurityClash scene={{ ...BATTLE_CLASH, loser: { attacker: true, revealed: false } }} />
        </Stage>
        <Stage label="security Digimon lost (claw on the reveal)" height={420}>
          <SecurityClash scene={{ ...BATTLE_CLASH, loser: { attacker: false, revealed: true } }} />
        </Stage>
        <Stage label="tie (both beaten)" height={420}>
          <SecurityClash scene={{ ...BATTLE_CLASH, loser: { attacker: true, revealed: true } }} />
        </Stage>
        <Stage label="no compare published (neither marked)" height={420}>
          <SecurityClash scene={BATTLE_CLASH} />
        </Stage>
      </Section>

      <Section
        id="showcase-play-log"
        title="play log"
        note="The match's whole narration in a drawer that slides out of the right edge; every card name is a link that opens the card."
        stacked
      >
        <Stage label="play log drawer" height={520}>
          <PlayLogSidebar
            turns={SHOWCASE_LOG_TURNS}
            playerNames={{ 0: "Alice", 1: "Bob" }}
            viewerSeat={0}
            onClose={noop}
            onOpenCard={noop}
          />
        </Stage>
      </Section>

      <Section
        id="showcase-result"
        title="result splash"
        note="The match's last moment: the board is hidden behind it, the word scales and lights up once, and the reason line names which of the four endings it was."
        stacked
      >
        {(["win", "loss", "draw"] as const).map((outcome) => (
          <Stage key={outcome} label={outcome} height={520}>
            <GameOverOverlay
              result={outcome}
              reason={outcome === "draw" ? "deckOut" : "surrender"}
              stats={[
                { value: 12, label: "Turns" },
                { value: 3, label: "Security left" },
                { value: "8:42", label: "Duration" },
              ]}
              onMenu={noop}
              onRematch={noop}
            />
          </Stage>
        ))}
      </Section>

      <Section
        id="showcase-dialogs"
        title="dialogs"
        note="Mulligan, block window and the target decision, each on its own framed stage. The result splash has a section of its own."
        stacked
      >
        <Stage label="mulligan" height={560}>
          <MulliganOverlay
            handCardIds={[CARDS.rookie, CARDS.champion, CARDS.tamer, CARDS.option, CARDS.ultimate]}
            turnOrder="second"
            onKeep={noop}
            onMulligan={noop}
          />
        </Stage>
        <Stage label="block window" height={480}>
          <div className="game-modal" style={{ position: "absolute", inset: 0 }}>
            <BlockOverlay
              attackerCardId={CARDS.opponentUltimate}
              blockers={[
                { permanentId: "p-you-1", cardId: CARDS.champion, currentDP: 4000, sourceCount: 1 },
                { permanentId: "p-you-2", cardId: CARDS.ultimate, currentDP: 7000, sourceCount: 3 },
              ]}
              onBlock={noop}
              onDecline={noop}
            />
          </div>
        </Stage>
        <Stage label="target decision" height={760}>
          <div className="game-modal" style={{ position: "absolute", inset: 0 }}>
            <DecisionOverlay
              request={TARGET_DECISION}
              sourceCardId={CARDS.option}
              candidates={[
                { instanceId: "opp-1", cardId: CARDS.opponentChampion, selectable: true, currentDP: 4000 },
                {
                  instanceId: "opp-2",
                  cardId: CARDS.opponentUltimate,
                  selectable: false,
                  currentDP: 7000,
                  isSuspended: true,
                },
              ]}
              picks={["opp-1"]}
              onTogglePick={noop}
              onRespond={noop}
            />
          </div>
        </Stage>
        <Stage label="trigger chooser (multiple effects)" height={700}>
          <div className="game-modal" style={{ position: "absolute", inset: 0 }}>
            <DecisionOverlay
              request={TRIGGER_DECISION}
              candidates={[]}
              picks={[]}
              triggerDetails={[
                { sourceLabel: "Field", summary: "Draw 1 card, then trash 1 card in your hand." },
                {
                  sourceLabel: "Inherited by Omnimon",
                  hostCardId: "BT1-084",
                  summary: "Delete 1 of your opponent's Digimon with 5000 DP or…",
                },
              ]}
              onTogglePick={noop}
              onRespond={noop}
            />
          </div>
        </Stage>
        <Stage label="trigger chooser (one permanent, two windows)" height={700}>
          <div className="game-modal" style={{ position: "absolute", inset: 0 }}>
            <DecisionOverlay
              request={SAME_PERMANENT_TRIGGER_DECISION}
              candidates={[]}
              picks={[]}
              triggerDetails={[
                { sourceLabel: "Field", summary: "Delete 1 of your opponent's level 4 or lower Digimon…" },
                { sourceLabel: "Field", summary: "Delete 1 of your opponent's level 4 or lower Digimon…" },
              ]}
              onTogglePick={noop}
              onRespond={noop}
            />
          </div>
        </Stage>
      </Section>
    </main>
  );
}
