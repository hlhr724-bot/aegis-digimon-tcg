import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AssemblyRequirement, DigiXrosRequirement, Permanent, PlayerState } from "@aegis/shared";
import type { DropTarget } from "../dragIntents";
import type { EvoCostOption } from "../digivolveModel";
import type { AssemblyCandidate, DigiXrosCandidate, DigiXrosEligibleExpander } from "../overlay";
import type { Side } from "../side";
import type { DpPulse } from "../dpPulse";
import type { FreezePulse } from "../freezePulse";
import type { PendingFateBadge } from "../pendingFate";
import type { PermanentBurst } from "../showcases";
import type { TrackingArrow } from "../trackingArrow";
import type { AttackArrowClock } from "../attackArrowClock";
import { DragKind } from "./enums";

/** A solved target arrow: the ids resolved to real positions in board coordinates. */
export interface TrackingArrowGeometry {
  key: string;
  kind: TrackingArrow["kind"];
  from: { x: number; y: number };
  to: { x: number; y: number }[];
  sourcePermanentId?: string;
  targetKeys?: readonly string[];
  clock?: AttackArrowClock;
}

/**
 * `deferred` marks a touch gesture whose direction is not yet known: the pointer is
 * left to the browser until `move` decides between a sideways swipe (scroll the row)
 * and a drag (play / attack). `capture` is the element to capture onto once it does.
 */
export type DragOrigin = { deferred?: boolean; capture?: Element };

/** A drop area under the pointer: the `data-drop` name it carries, and the id it names. */
export type DropZoneHit = { target: DropTarget; id?: string };

export type DragState =
  | ({
      kind: DragKind.Play;
      index: number;
      instanceId: string;
      cardId: string;
      artId?: string;
      x: number;
      y: number;
      ox: number;
      oy: number;
      started: boolean;
    } & DragOrigin)
  | ({
      kind: DragKind.Attack;
      permanentId: string;
      cardId: string;
      artId?: string;
      x: number;
      y: number;
      ox: number;
      oy: number;
      started: boolean;
    } & DragOrigin);

/**
 * A seat as the board shows it. The presentation hands the screen either the live
 * `PlayerState` or a plain object built from one, so the shared shape is the data both
 * carry and never the schema class itself.
 */
export type PresentedPlayer = {
  /** A held phase replays rotation over a plain array, so this is never the schema list. */
  battleArea: readonly Permanent[];
} & Pick<
  PlayerState,
  | "displayName"
  | "breeding"
  | "hand"
  | "handCount"
  | "deckCount"
  | "eggDeckCount"
  | "trash"
  | "security"
  | "securityView"
  | "securityCount"
  | "securityDpDelta"
> &
  Partial<Pick<PlayerState, "fieldEffectsJson">>;

/**
 * Everything both battle rows put on a permanent that comes from the cue hook rather
 * than from the permanent itself. Gathered once, so each row's own props are only what
 * makes that side of the board different.
 */
export interface PermanentChrome {
  /** A card/effect selection is open; all field cards offer a dedicated inspection button. */
  showInspectionControls?: boolean;
  /** Canonical keyword names mapped to printed parameters, in the visual demo only. */
  keywordLabels?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  compact: boolean;
  width: number;
  permanentRefs: RefObject<Record<string, HTMLDivElement | null>>;
  effectSourcePermanentIds: ReadonlySet<string>;
  effectLinkedPermanentIds: ReadonlySet<string>;
  decisionHighlightPermanentId?: string;
  /** Permanents currently picked by a board-answered target decision. */
  decisionPickedInstanceIds: ReadonlySet<string>;
  materialSelectionOrder?: ReadonlyMap<string, number>;
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  pendingPermanentIds: ReadonlySet<string>;
  fateBadges: ReadonlyMap<string, PendingFateBadge>;
  combatImpactIds: ReadonlySet<string>;
  dpPulses: ReadonlyMap<string, DpPulse>;
  dpBadgeSuppressedIds: ReadonlySet<string>;
  freezePulses: ReadonlyMap<string, FreezePulse>;
  heldSuspendedIds: ReadonlySet<string>;
  /** Established physical cards restored only until their departure begins. */
  heldDeletionIds?: ReadonlySet<string>;
  /** The sweep's stagger for the permanent at this position in its owner's row. */
  suspendDelayMs: (index: number) => number;
}

/** A play the viewer asked to confirm before it is sent, and what it would send. */
export type PendingActionConfirmation =
  | {
      kind: "negamon";
      instanceId: string;
      cardId: string;
      sourceInstanceId: string;
      effectKey: string;
      confirmDrop: boolean;
    }
  | { kind: DragKind.Play; instanceId: string; cardId: string }
  | { kind: "digivolve"; instanceId: string; cardId: string; permanentId: string; baseCardId: string }
  | {
      kind: "dna";
      instanceId: string;
      cardId: string;
      materialPermanentIds: string[];
      initialPermanentId?: string;
      normalPermanentId?: string;
    };

/** An armed link declaration: the card to link, and the Digimon it may be plugged into. */
export interface LinkDeclaration {
  instanceId: string;
  cardId: string;
  targetPermanentIds: readonly string[];
}

/** Where a field card's action menu is anchored, and whose card opened it. */
export interface CardMenuAnchor {
  permanentId: string;
  side: Side;
  x: number;
  y: number;
}

/** A dual card whose half the viewer has still to choose. */
export interface DualPlayChoice {
  instanceId: string;
  cardId: string;
}

/** A digivolution with more than one cost to pay, and the paths it may pay it by. */
export interface EvoCostChoice {
  handInstanceId: string;
  permanentId: string;
  handCardId: string;
  baseCardId: string;
  options: EvoCostOption[];
}

/** An Assembly play whose materials the viewer has still to pick. */
export interface AssemblyPick {
  playCostReductionBlocked?: boolean;
  instanceId: string;
  cardId: string;
  requirements: AssemblyRequirement[];
  candidates: AssemblyCandidate[];
}

/** A DigiXros play whose materials and expanders the viewer has still to pick. */
export interface DigiXrosPick {
  playCostReductionBlocked?: boolean;
  instanceId: string;
  cardId: string;
  requirements: DigiXrosRequirement[];
  candidates: DigiXrosCandidate[];
  lockedCandidates: DigiXrosCandidate[];
  eligibleExpanders: DigiXrosEligibleExpander[];
  intrinsicTrashMax: number;
}

/** An App Fusion whose consumed link the viewer has still to choose. */
export interface AppFusionChoice {
  handInstanceId: string;
  hostPermanentId: string;
}

/** The writers an intent sender needs to put a selection down again. */
export interface SelectionControls {
  clearSel: () => void;
  setHandSel: Dispatch<SetStateAction<string | null>>;
  setHandPreview: Dispatch<SetStateAction<string | null>>;
  setSelPerm: Dispatch<SetStateAction<string | null>>;
  setVortexMode: Dispatch<SetStateAction<boolean>>;
  setLinkSel: Dispatch<SetStateAction<LinkDeclaration | null>>;
}

/** The writers an intent sender needs to open or close a surface over the board. */
export interface OverlayControls {
  setCardMenu: Dispatch<SetStateAction<CardMenuAnchor | null>>;
  setStackView: Dispatch<SetStateAction<string | null>>;
  setPicks: Dispatch<SetStateAction<string[]>>;
  setDualPlay: Dispatch<SetStateAction<DualPlayChoice | null>>;
  setActionConfirm: Dispatch<SetStateAction<PendingActionConfirmation | null>>;
  setAssemblyPick: Dispatch<SetStateAction<AssemblyPick | null>>;
  setDigiXrosPick: Dispatch<SetStateAction<DigiXrosPick | null>>;
  setEvoCostChoice: Dispatch<SetStateAction<EvoCostChoice | null>>;
}
