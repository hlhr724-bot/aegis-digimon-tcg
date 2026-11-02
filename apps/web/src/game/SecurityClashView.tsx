import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
/* The centre-stage security check the reference client plays: the attacking Digimon
   faces the card that was just revealed, their DP is compared, and the outcome
   resolves between them. Decoration only — it never takes pointer input, and the
   contents and the timeline come from ./securityClash. */

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCardDefinition } from "@aegis/shared";
import { CardFull } from "../design/cards";
import { colorKey, type ColorName } from "../design/theme";
import { Icons } from "../design/icons";
import { ClawSlash } from "./piece";
import { CardBurst } from "./CardBurst";
import { CardShatter } from "./CardShatterView";
import { TIMINGS } from "./timings";
import { useTranslation } from "../i18n";
import {
  orderSecurityClashFighters,
  type SecurityBranchScene,
  type SecurityBreakScene,
  type SecurityClashFighter,
  type SecurityClashScene,
} from "./securityClash";

/* The narrow blocks in game.css override both widths, so these are the pointer sizes. */
const CLASH_CARD_WIDTH = 158;

/* A destroyed card stands alone with nothing printed around it, so it takes the room a
   check splits between two cards and their captions. */
const DESTROYED_CARD_WIDTH = 236;

const BRANCH_CARD_WIDTH = 150;

const RESOLUTION_LABEL_KEYS = {
  // The check is still resolving on the server, so the scene says what it knows: this card
  // was revealed, and what it does is happening now.
  pending: "overlay.securityResolving",
  battle: "overlay.securityBattle",
  effect: "overlay.securityEffect",
  trashed: "overlay.securityTrashed",
} as const;

/* A card an effect trashed never had a chance to do anything, so nothing a check's scene
   prints applies: it was not checked, and "no effect" would read as a verdict on a card
   that was never given one. The scene is the card alone — revealed and broken,
   the way the reference client's `DestroySecurityEffect` plays it — and the one line it
   still owes is the accessible name of what happened. */
const DESTRUCTION_ROLE_KEY = "overlay.trashedFromSecurity";

/** The battle verdict for one of the two cards. */
type ClashFate = "none" | "beaten" | "stands";

function ClashCard({
  fighter,
  role,
  fate,
  spent,
  destroyed,
  width,
  lightOwner,
}: {
  fighter: SecurityClashFighter;
  role: "attacker" | "revealed";
  width: number;
  /** `beaten` takes the claw, the shake and the dim; `stands` is emphasized. */
  fate: ClashFate;
  /** This card leaves the board after the beat, whatever the verdict was. */
  spent: boolean;
  /** An effect took this card out of the stack rather than a check flipping it. */
  destroyed: boolean;
  lightOwner?: SecurityClashScene["lightOwner"] & { id: string };
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const fighterName = getCardName(fighter.cardId);
  return (
    <figure
      className="battle-clash__card"
      data-role={role}
      data-side={fighter.side}
      data-fate={fate}
      data-spent={spent ? "true" : undefined}
    >
      <div className="battle-clash__frame">
        {role === "revealed" ? (
          <CardBurst variant="play" color="Blue" className="battle-security-reveal-light" particleLight={false} />
        ) : null}
        <div className="battle-clash__art">
          <CardFull cardId={fighter.cardId} artId={fighter.artId} width={width} />
        </div>
        {/* Drawn outside the art box, which clips its own entrance: the shards and
            the claw both reach past the card's edge. */}
        {spent ? (
          <span className="battle-clash__shatter" aria-hidden="true">
            <CardShatter
              cardId={fighter.cardId}
              artId={fighter.artId}
              width={width}
              color={clashShatterColor(fighter.cardId)}
              lightOwner={lightOwner}
            />
          </span>
        ) : null}
        {fate === "beaten" ? <ClawSlash /> : null}
      </div>
      {destroyed ? null : (
        <figcaption className="battle-clash__caption">
          <span className="battle-clash__role">
            {role === "attacker" ? t("overlay.isAttacking", { name: fighterName }) : t("overlay.revealedFromSecurity")}
          </span>
          <strong className="battle-clash__name">{fighterName}</strong>
          {fighter.dp === undefined ? null : <span className="battle-clash__dp">{fighter.dp.toLocaleString()} DP</span>}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * The verdict each card takes, straight from the server's DP compare. Whichever side
 * lost gets the claw, the shake and the dim, and the side that survived is emphasized
 * — both directions, and a tie beats both. No DP is compared here: the figures on the
 * cards are printed values, not the live ones the engine battled with.
 *
 * With no compare published there is no verdict to draw, so neither card is marked.
 */
function clashFate(scene: SecurityClashScene, role: "attacker" | "revealed"): ClashFate {
  if (scene.resolution !== "battle" || scene.loser === undefined) return "none";
  const lost = role === "attacker" ? scene.loser.attacker : scene.loser.revealed;
  return lost ? "beaten" : "stands";
}

/**
 * A destroyed stack card and a deleted attacker break apart. A checked card instead
 * narrows and rises after its result, whichever side won the compare. An effect card
 * follows its separate execution-slot disposal.
 */
function clashSpent(scene: SecurityClashScene, role: "attacker" | "revealed"): boolean {
  if (role === "attacker") return scene.resolution === "battle" && scene.loser?.attacker === true;
  return scene.cause === "destruction";
}

/** The revealed card breaks in its own colour, the way a deleted permanent does. */
function clashShatterColor(cardId: string): ColorName {
  return colorKey(getCardDefinition(cardId)?.colors[0]);
}

export function SecurityClash({ scene }: { scene: SecurityClashScene }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const lightOwners = useMemo(
    () => ({
      attacker: scene.lightOwner ? { ...scene.lightOwner, id: `security-light-${scene.key}-attacker` } : undefined,
      revealed: scene.lightOwner ? { ...scene.lightOwner, id: `security-light-${scene.key}-revealed` } : undefined,
    }),
    [scene.lightOwner, scene.key],
  );
  const fighters = orderSecurityClashFighters(scene);
  const destroyed = scene.cause === "destruction";
  const cardWidth = destroyed ? DESTROYED_CARD_WIDTH : CLASH_CARD_WIDTH;
  return (
    <div
      className="battle-clash"
      data-testid="security-clash"
      data-scene-key={scene.key}
      data-resolution={scene.resolution}
      data-cause={scene.cause ?? "check"}
      data-departing={scene.departing ? "true" : undefined}
      data-exiting={scene.exiting ? "true" : undefined}
      data-revealed-ready={scene.revealedReady ? "true" : undefined}
      // A scene that names its own outcome beat runs the break and the fade behind it from
      // that moment: zero for a check that held on stage while it resolved and has already
      // spent the lead-in, and the shorter destruction beat for a card no attacker faced.
      style={
        {
          ...(scene.outcomeAtMs === undefined ? {} : { "--t-clash-outcome-at": `${scene.outcomeAtMs}ms` }),
          ...(destroyed ? { "--t-clash-outcome": `${TIMINGS.cardShatter}ms` } : {}),
          ...(scene.loser?.attacker
            ? {
                "--t-clash-stage-out-at":
                  "calc(var(--t-clash-outcome-at, 853ms) + var(--t-clash-outcome, 350ms) + var(--t-card-shatter, 250ms))",
              }
            : {}),
        } as CSSProperties
      }
      role="status"
      aria-live="assertive"
      aria-label={destroyed ? `${t(DESTRUCTION_ROLE_KEY)}: ${getCardName(scene.revealed.cardId)}` : undefined}
    >
      {destroyed ? null : (
        <p className="battle-clash__badge">
          <Icons.Shield size={13} />
          {t("overlay.securityCheck")}
        </p>
      )}
      <div className="battle-clash__stage">
        <ClashCard
          fighter={fighters[0]!.fighter}
          role={fighters[0]!.role}
          fate={clashFate(scene, fighters[0]!.role)}
          spent={clashSpent(scene, fighters[0]!.role)}
          destroyed={destroyed}
          width={cardWidth}
          lightOwner={lightOwners[fighters[0]!.role]}
        />
        {fighters.length > 1 ? (
          <span
            className="battle-clash__mark"
            aria-hidden="true"
            style={{ visibility: scene.resolution === "battle" ? "visible" : "hidden" }}
          >
            {scene.resolution === "battle" ? (
              <>
                VS
                <i className="battle-clash__flash" />
              </>
            ) : null}
          </span>
        ) : null}
        {fighters[1] ? (
          <ClashCard
            fighter={fighters[1].fighter}
            role={fighters[1].role}
            fate={clashFate(scene, fighters[1].role)}
            spent={clashSpent(scene, fighters[1].role)}
            destroyed={destroyed}
            width={cardWidth}
            lightOwner={lightOwners[fighters[1].role]}
          />
        ) : null}
      </div>
      {destroyed ? null : <p className="battle-clash__outcome">{t(RESOLUTION_LABEL_KEYS[scene.resolution])}</p>}
    </div>
  );
}

/**
 * The light that washes in from the defending player's edge of the board while their
 * shield breaks. Pure decoration: it says whose security is being spent without the
 * viewer having to find the shield badge.
 */
export function SecurityEdgeFlash({ scene }: { scene: SecurityBreakScene }) {
  return (
    <div
      className={`battle-edge-flash battle-edge-flash--${scene.side}`}
      data-testid="security-edge-flash"
      data-side={scene.side}
      aria-hidden="true"
    />
  );
}

/**
 * A revealed security card that resolves an effect, held on the half of the screen the
 * side panels do not occupy while its effect notice reads next to it (the notice is
 * mirrored to the same half by `noticeAnchor`, so the two are one moment).
 */
export function SecurityBranch({ scene, compact = false }: { scene: SecurityBranchScene; compact?: boolean }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [transfer, setTransfer] = useState<CSSProperties | null>(null);
  const securityDock = scene.source !== "option" && scene.state === "docked";
  useLayoutEffect(() => {
    if (scene.source === "option" || scene.state !== "docked") return;
    const root = rootRef.current;
    const art = artRef.current;
    if (!root || !art) return;
    const source = root.parentElement?.querySelector<HTMLElement>(
      `.battle-clash[data-scene-key="${scene.key}"][data-departing="true"] .battle-clash__card[data-role="revealed"] .battle-clash__art`,
    );
    const from = source?.getBoundingClientRect();
    const to = art.getBoundingClientRect();
    setTransfer(
      from && to.width > 0 && to.height > 0
        ? ({
            "--security-dock-x": `${from.x + from.width / 2 - to.x - to.width / 2}px`,
            "--security-dock-y": `${from.y + from.height / 2 - to.y - to.height / 2}px`,
            "--security-dock-scale-x": from.width / to.width,
            "--security-dock-scale-y": from.height / to.height,
          } as CSSProperties)
        : {},
    );
    // A closing state retains the completed transfer rather than measuring a new origin.
  }, [scene.key, scene.source, scene.state]);
  const revealedName = getCardName(scene.cardId);
  return (
    <div
      className="battle-security-branch"
      ref={rootRef}
      data-testid="security-branch"
      data-side={scene.side}
      data-source={scene.source ?? "security"}
      data-compact={compact || undefined}
      // The dock is open-ended, so its slide-in and its exit are two animations rather
      // than one fixed clip: the state says which of them the card is playing.
      data-state={scene.state}
      data-transfer={transfer ? "ready" : securityDock ? "measuring" : undefined}
      style={transfer ?? undefined}
      role="status"
    >
      <figure className="battle-security-branch__frame">
        <div ref={artRef} className="battle-security-branch__art">
          <CardFull cardId={scene.cardId} artId={scene.artId} width={compact ? 92 : BRANCH_CARD_WIDTH} />
        </div>
        <figcaption className="battle-security-branch__caption">
          {scene.source === "option" ? t("overlay.optionResolving") : t("overlay.securityResolving")}
          <br />
          {revealedName}
        </figcaption>
      </figure>
    </div>
  );
}
