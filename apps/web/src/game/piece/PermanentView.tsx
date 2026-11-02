import { ManualStatus } from "@aegis/shared/manual/ManualStatus";
import "@/game/manual/manualFeatures.css";
import { PermanentDpDeltaHint } from "@/game/piece/PermanentDpDeltaHint";
import { CardAceBadge } from "@/design/CardAceBadge";
import { useRef, type CSSProperties } from "react";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { useFieldReferenceVisible } from "@/design/fieldReference/useFieldReferenceVisible";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { getCardDefinition, type Permanent } from "@aegis/shared";
import { CardMini } from "../../design/cards";
import { Icons } from "../../design/icons";
import { useTranslation } from "../../i18n";
import { linkCardOverhang, sourceFanStepLimit } from "../boardModel";
import { CardBurst } from "../CardBurst";
import { useFieldShatterOrigin } from "../fieldShatter";
import { useCardLanding, CARD_LANDING_DEPTH } from "../cardLanding";
import { forcedAttackGrants, hasBlocker, restrictionBadges, sourceCountBadge } from "../fieldBadges";
import type { PendingFateBadge } from "../pendingFate";
import type { DpPulse } from "../dpPulse";
import type { FreezePulse } from "../freezePulse";
import type { PermanentBurst } from "../showcases";
import { ClawSlash } from "./ClawSlash";
import { DpPulseParticles } from "./DpPulseParticles";
import { permanentAriaLabel } from "./permanentAccessibility";
import { permanentClassName } from "./permanentClassName";
import { resolvePermanentKeywordEntries } from "./permanentKeywords";
import { PermanentBlockerBadge } from "./PermanentBlockerBadge";
import { PermanentCardStack } from "./PermanentCardStack";
import { COPY_EDGE_STEP, copyEdgeCount, PermanentCopiesBadge, PermanentCopyEdges } from "./PermanentCopies";
import { PermanentFateBadge } from "./PermanentFateBadge";
import { PermanentKeywordBadges } from "./PermanentKeywordBadges";
import { PermanentLinkedCards } from "./PermanentLinkedCards";
import { PermanentRestrictionBadges } from "./PermanentRestrictionBadges";
import { PermanentSourceBadge } from "./PermanentSourceBadge";
import { PermanentSparkles } from "./PermanentSparkles";
import { PermanentSummoningRing } from "./PermanentSummoningRing";
import { originalDP, permanentTransformation } from "../transformation";
import type { DropAttrs } from "./types";
import { usePermanentInspection } from "./usePermanentInspection";
import "./fieldBadges.css";

export function PermanentView({
  perm,
  copies = 1,
  fieldReferenceIds,
  entranceKey,
  quietEntrance = false,
  heldDeletion = false,
  keywordLabels,
  highlight,
  selectionOrder,
  candidate,
  picked = false,
  dimmed,
  compact,
  burst,
  pending,
  fate,
  shake,
  claw,
  dpPulse,
  dpBadgeSuppressed = false,
  freezePulse,
  effectSource,
  effectLinked,
  suspendDelayMs,
  heldSuspended = false,
  width,
  refCb,
  onClick,
  drop,
  onPointerDown,
  onKeyboardActivate,
  onInspect,
  showInspect = false,
  useSelectedSleeve = true,
}: {
  perm: Permanent;
  /** Identical permanents drawn as this one card, itself included. */
  copies?: number;
  fieldReferenceIds?: readonly string[];
  /**
   * What restarts the entrance, in place of the permanent id. A group passes its own
   * key, so a copy leaving it does not replay the entrance on the copies that stay.
   */
  entranceKey?: string;
  /** The card was already on the field (it split off a group), so it skips the entrance. */
  quietEntrance?: boolean;
  /** Preserve a deletion target's printed pose through selection, focus and break. */
  heldDeletion?: boolean;
  keywordLabels?: Readonly<Record<string, string>>;
  highlight?: boolean;
  selectionOrder?: number;
  candidate?: boolean;
  picked?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  /** What an effect currently resolving is about to do to this permanent (server-projected). */
  fate?: PendingFateBadge;
  /** Shake the card: a refused action, or a battle it just lost. */
  shake?: boolean;
  /** Sweep the claw across the card, on the losing side of a battle. */
  claw?: boolean;
  /** The DP change this permanent is currently pulsing over. */
  dpPulse?: DpPulse;
  dpBadgeSuppressed?: boolean;
  /** The attack/block lock that just landed on this permanent, which jolts the card. */
  freezePulse?: FreezePulse;
  /** This permanent's own effect is activating: it glows and throws a small particle. */
  effectSource?: boolean;
  /**
   * The clause this permanent raised is on screen. The activation punch is over; what is
   * left is a steady light saying "this card is the one that toast is about", so the two
   * are read as one moment rather than as a flash and, later, a sentence somewhere else.
   */
  effectLinked?: boolean;
  /** The colour-keyed burst this permanent is playing, behind the card. */
  burst?: PermanentBurst;
  /** Held back while the card is still being announced centre-screen. */
  pending?: boolean;
  /** Staggers the suspend rotation so an unsuspend phase sweeps across the board. */
  suspendDelayMs?: number;
  /** Visual pre-unsuspend hold; legality still comes from the live permanent. */
  heldSuspended?: boolean;
  /** Explicit card width; overrides the `compact` default. */
  width?: number;
  refCb?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  drop?: DropAttrs;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Keyboard fallback for drag-only interactions (select to play or attack). */
  onKeyboardActivate?: () => void;
  /** Read the permanent without declaring an action or changing a pending choice. */
  onInspect?: () => void;
  /** Show the magnifier while the board is being used to choose a card or effect. */
  showInspect?: boolean;
  useSelectedSleeve?: boolean;
}) {
  const stationaryDeparture =
    heldDeletion || fate?.fate === "delete" || fate?.fate === "trash" || fate?.fate === "effectTarget";
  const permanentWidth = width ?? (compact ? 76 : 116);
  const isVisuallySuspended = heldSuspended || perm.isSuspended;
  const suspendedInlineMargin = Math.ceil(permanentWidth * 0.2);
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const beginInspection = usePermanentInspection(onInspect);
  const fieldReferenceVisible = useFieldReferenceVisible();
  const movedEntrance = useRef<string | undefined>(undefined);
  const fieldIdentity = entranceKey ?? perm.permanentId;
  const fieldReferences = (fieldReferenceIds ?? [perm.permanentId]).map((id) => `#${id.replace(/^perm-/, "")}`);
  const fieldReference = fieldReferences.join(", ");
  const shortFieldReference =
    fieldReferences.length > 1 ? `${fieldReferences[0]} +${fieldReferences.length - 1}` : fieldReferences[0];
  const landingBurst = burst?.moveFromBreeding ? undefined : burst;
  if (burst?.moveFromBreeding) movedEntrance.current = fieldIdentity;
  else if (landingBurst) movedEntrance.current = undefined;
  const quietMove = movedEntrance.current === fieldIdentity;
  const entranceBurst = useRef<number | undefined>(undefined);
  if (landingBurst) entranceBurst.current = landingBurst.key;
  const topId = perm.topCard?.cardId;
  const faceDown = perm.topCard?.faceUp === false;
  const faceRef = useFieldShatterOrigin(perm.permanentId, perm.topCard?.instanceId ?? perm.permanentId, refCb);
  const arrivalKey = `${fieldIdentity}:${entranceBurst.current ?? "first"}:${pending ? "held" : "shown"}`;
  // A departure hold can release before the presented board removes its face.
  // Keep that arrival quiet; a genuine later arrival gets its own entrance again.
  const quietedEntrance = useRef({ key: arrivalKey, quiet: quietEntrance });
  if (quietedEntrance.current.key !== arrivalKey) quietedEntrance.current = { key: arrivalKey, quiet: quietEntrance };
  else if (quietEntrance) quietedEntrance.current.quiet = true;
  const landingRef = useCardLanding(arrivalKey);
  if (!perm.topCard || (!topId && !faceDown)) return null;
  const def = topId ? getCardDefinition(topId) : undefined;
  const delta = perm.currentDP - originalDP(perm);
  const hasDpDelta = delta !== 0;
  const activeKeywords = resolvePermanentKeywordEntries({ perm, keywordLabels });
  // Server truth (`Permanent.keywords`): the resolved keyword list already folds a
  // ＜Blocker＞ this Digimon only has because something granted it, so the shield is
  // never read off the printed art.
  const blocker = hasBlocker(perm);
  const sources = sourceCountBadge(perm);
  // Server truth as well (`Permanent.cannotAttack` and friends): the standing debuffs
  // an effect has imposed, worn for as long as they hold rather than only jolting the
  // card once when they land.
  const restrictions = restrictionBadges(perm);
  // Server truth as well (`Permanent.originalNameOverride` / `originalColorsOverride`): what
  // this position currently COUNTS AS after an effect rewrote its original card information.
  const transformation = permanentTransformation(perm);

  const cardName = faceDown
    ? t("game.faceDownSource")
    : getTranslatedCardName({ name: transformation?.name || def?.nameEn || topId || "", translations });
  const statuses = Object.values(ManualStatus).filter((entry) => perm.manualStatuses?.includes(entry.value));
  const statusLabels = statuses.map((entry) => t(`manual.features.status.${entry.value}`));
  const annotations = [...statusLabels, perm.manualMarker ?? ""].filter(Boolean).map((label) => ({
    label,
    description: t("manual.features.statusHint"),
  }));
  const activate = onKeyboardActivate ?? onClick;
  const interactive = !!activate || !!onPointerDown;
  return (
    <div
      ref={faceRef}
      onClick={(event) => {
        if (event.detail === 0 && activate) {
          activate();
        } else {
          onClick?.();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerDownCapture={beginInspection}
      onContextMenu={
        onInspect
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onInspect();
            }
          : undefined
      }
      onKeyDown={
        activate
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              activate();
            }
          : undefined
      }
      // Non-interactive permanents stay unlabeled: the card art inside already
      // exposes the card name, and a second name on the wrapper reads twice.
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive && candidate ? picked : undefined}
      aria-label={
        interactive
          ? permanentAriaLabel({
              perm,
              heldSuspended,
              restrictions,
              fate,
              cardName: [
                cardName,
                topId ? `(${topId})` : undefined,
                t("game.fieldReference", { reference: fieldReference }),
                ...statusLabels,
                perm.manualMarker,
              ]
                .filter(Boolean)
                .join(", "),
              copies,
              delta,
              hasDpDelta,
              t,
            })
          : undefined
      }
      className={permanentClassName({
        shake,
        freezePulse,
        effectSource,
        effectLinked,
        candidate,
        picked,
        threatened: fate?.fate === "effectTarget",
      })}
      {...(drop ?? {})}
      data-stationary-departure={stationaryDeparture || undefined}
      data-suspended={isVisuallySuspended || undefined}
      data-tap-target={candidate || highlight || !!onPointerDown || undefined}
      data-combat-impact={(shake && claw) || undefined}
      data-permanent-id={perm.permanentId}
      data-inspectable={!!onInspect || undefined}
      style={{
        // The badges size themselves from the card, so a phone's smaller card gets smaller badges.
        ...({ "--permanent-width": `${permanentWidth}px` } as CSSProperties),
        position: "relative",
        cursor: interactive ? "pointer" : "default",
        touchAction: "pan-x",
        opacity: dimmed ? 0.4 : 1,
        // The reference client hides the destination until the centre-screen
        // announcement is over, rather than flying the card across the board.
        visibility: pending ? "hidden" : undefined,
        transform: !stationaryDeparture && (highlight || effectSource || effectLinked) ? "translateY(-6px)" : "none",
        marginInlineStart: perm.stack.length
          ? `max(${isVisuallySuspended ? suspendedInlineMargin : 0}px, calc(4px + ${perm.stack.length - 1} * min(var(--arena-source-step, 4px), ${sourceFanStepLimit(permanentWidth, perm.stack.length)}px)))`
          : isVisuallySuspended
            ? suspendedInlineMargin
            : 0,
        marginInlineEnd:
          (isVisuallySuspended ? suspendedInlineMargin : 0) +
          linkCardOverhang(perm.linked.length, permanentWidth) +
          copyEdgeCount(copies) * COPY_EDGE_STEP,
        transition: stationaryDeparture
          ? "opacity 160ms"
          : "transform 160ms, opacity 160ms, margin-inline-start 200ms, margin-inline-end 200ms",
      }}
    >
      {def || !fieldReferenceVisible ? null : (
        <span
          className="game-permanent__field-reference"
          title={t("game.fieldReference", { reference: fieldReference })}
          aria-label={t("game.fieldReference", {
            reference: fieldReference,
          })}
        >
          {shortFieldReference}
        </span>
      )}
      {copies > 1 ? (
        <PermanentCopyEdges
          cardId={faceDown ? "" : (topId ?? "")}
          copies={copies}
          width={permanentWidth}
          suspended={isVisuallySuspended}
        />
      ) : null}
      {selectionOrder !== undefined ? (
        <span
          className="game-permanent__material-order"
          aria-label={t("overlay.dnaMaterialOrder", { number: selectionOrder })}
        >
          {selectionOrder}
        </span>
      ) : picked && candidate ? (
        <span className="game-permanent__picked-mark" aria-hidden="true">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
        </span>
      ) : null}
      <PermanentCardStack stack={perm.stack} width={permanentWidth} />
      <PermanentLinkedCards linked={perm.linked} width={permanentWidth} useSelectedSleeve={useSelectedSleeve} />
      {/* Re-keying on an accepted arrival remounts the wrapper, which is what
          restarts the CSS entrance: the card sparkles when it reaches the board
          and again on every digivolution. `pending` is part of the signature
          because the permanent mounts while it is still hidden behind the
          centre-screen showcase — without it the entrance ran out its whole
          duration under `visibility: hidden` and the card simply appeared. */}
      <div
        key={arrivalKey}
        ref={landingRef}
        className={`game-card-enter${quietedEntrance.current.quiet || quietMove || (!landingBurst && entranceBurst.current !== undefined) ? " game-card-enter--quiet" : ""}${landingBurst ? " game-card-landing" : ""}`}
        data-testid={landingBurst?.variant === "play" ? "confirmed-play-landing" : undefined}
        data-card-id={landingBurst?.variant === "play" ? topId : undefined}
        data-permanent-id={landingBurst?.variant === "play" ? perm.permanentId : undefined}
        style={
          {
            position: "relative",
            zIndex: 1,
            "--card-landing-start-depth": CARD_LANDING_DEPTH,
          } as CSSProperties
        }
      >
        {landingBurst ? (
          <CardBurst
            key={landingBurst.key}
            cueKey={landingBurst.key}
            variant={landingBurst.variant}
            color={landingBurst.color}
            landing={landingBurst.variant === "play" || landingBurst.variant === "evolve"}
          />
        ) : null}
        <CardMini
          cardId={topId}
          faceDown={faceDown}
          useSelectedSleeve={useSelectedSleeve}
          artId={perm.topCard?.artId}
          width={permanentWidth}
          suspended={isVisuallySuspended}
          suspendDelayMs={suspendDelayMs}
          selected={highlight}
          attackable={candidate}
          dp={perm.currentDP}
          dpDelta={hasDpDelta && !dpBadgeSuppressed ? delta : undefined}
          renderDpDelta={(node) => (
            <PermanentDpDeltaHint delta={delta} baseDp={originalDP(perm)}>
              {node}
            </PermanentDpDeltaHint>
          )}
          identity={transformation}
          reference={fieldReferenceVisible ? shortFieldReference : undefined}
          info
          zoomOnHover={false}
        />
        <PermanentSparkles />
        {perm.summoningSick ? <PermanentSummoningRing /> : null}
        {/* The claw the reference client sweeps over a permanent that lost its
            battle, a beat before the shatter. Purely decorative, so it sits above
            the art and takes no pointer events. */}
        {claw ? <ClawSlash key={`claw-${perm.permanentId}`} fixedFieldAnchor /> : null}
        {dpPulse ? <DpPulseParticles key={dpPulse.key} pulse={dpPulse} /> : null}
      </div>
      <CardAceBadge cardId={topId} />
      {sources ? <PermanentSourceBadge sources={sources} /> : null}
      {copies > 1 ? <PermanentCopiesBadge copies={copies} /> : null}
      {blocker ? <PermanentBlockerBadge /> : null}
      {fate ? <PermanentFateBadge fate={fate} /> : null}
      {activeKeywords.length > 0 || annotations.length > 0 ? (
        <PermanentKeywordBadges
          keywords={activeKeywords}
          annotations={annotations}
          securityAttackModifier={perm.securityAttackModifier}
          cardWidth={permanentWidth}
        />
      ) : null}
      {restrictions.length > 0 ? (
        <PermanentRestrictionBadges restrictions={restrictions} forcedAttackGrants={forcedAttackGrants(perm)} />
      ) : null}
      {onInspect && showInspect ? (
        <button
          type="button"
          className="game-permanent__inspect"
          data-arena-inspect
          aria-label={t("game.inspectCard", { card: cardName })}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onInspect();
          }}
        >
          <Icons.Search size={14} />
        </button>
      ) : null}
    </div>
  );
}
