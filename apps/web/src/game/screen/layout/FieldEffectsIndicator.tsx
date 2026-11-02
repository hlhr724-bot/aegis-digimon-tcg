import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { CardKind } from "@aegis/shared/schema/enums";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type FieldEffectView } from "@aegis/shared";
import { Layers, Clock } from "lucide-react";
import { fieldEffectExpiry } from "@/game/fieldEffectExpiry";
import { readFieldEffects } from "@/game/readFieldEffects";
import { useTranslation, type TranslationKey } from "../../../i18n";
import "./fieldEffects.css";

const restrictionLabels: Record<string, TranslationKey> = {
  attack: "game.restriction.cannotAttack",
  block: "game.restriction.cannotBlock",
  suspend: "game.restriction.cannotSuspend",
  beSuspended: "game.restriction.cannotSuspend",
  unsuspend: "game.restriction.cannotUnsuspend",
  digivolve: "game.restriction.cannotDigivolve",
  dpImmune: "game.restriction.protectedFromDpReduction",
  beAffected: "game.restriction.immuneToOpponentEffects",
  beDeleted: "game.restriction.protectedFromEffectDeletion",
  beReturned: "game.restriction.protectedFromEffectReturn",
  playByEffects: "game.restriction.cannotPlayByEffects",
  play: "game.restriction.cannotPlay",
  playOrMove: "game.restriction.cannotPlay",
};

export function FieldEffectsIndicator({
  json,
  ownField,
  playerNames,
}: {
  json: string | undefined;
  ownField: boolean;
  playerNames: readonly [string, string];
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const effects = readFieldEffects(json);
  const anchor = useRef<HTMLSpanElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement>();
  const [corner, setCorner] = useState<{ right: number; top: number }>();
  useLayoutEffect(() => {
    // Fixed positioning escapes battle-row clipping. The badge must stay inside the
    // board: the arena board isolates its own stacking context, so a badge portalled
    // beside it would paint over every notice and prompt inside it.
    setPortalHost(
      anchor.current?.closest<HTMLElement>(".game-board") ??
        anchor.current?.closest<HTMLElement>("#aegis-stage") ??
        document.body,
    );
    const field = anchor.current?.closest(".game-field");
    const row = field?.querySelector(ownField ? ".game-battle-row--you" : ".game-battle-row--opp");
    if (!row || !field) return;
    function measure() {
      const bounds = row!.getBoundingClientRect();
      const visible = field!.getBoundingClientRect();
      // The outer edge is outside the cards and their paging controls. A portal
      // keeps the touch target clear of row clipping without reserving lane space.
      const compact = window.matchMedia("(max-width: 959px)").matches;
      const top = compact ? (ownField ? bounds.bottom - 30 : bounds.top - 28) : bounds.top + 4;
      const next =
        top >= visible.top && top + 44 <= visible.bottom
          ? { right: Math.max(8, window.innerWidth - Math.min(bounds.right, visible.right) + 4), top }
          : undefined;
      setCorner((previous) => (previous?.right === next?.right && previous?.top === next?.top ? previous : next));
    }
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(row);
    observer?.observe(field);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [ownField, effects.length]);
  useEffect(() => {
    if (effects.length === 0) return;
    function dismissOutside(event: PointerEvent) {
      const panel = details.current;
      if (panel?.open && event.target instanceof Node && !panel.contains(event.target)) panel.open = false;
    }
    function dismissWithEscape(event: KeyboardEvent) {
      const panel = details.current;
      if (event.key !== "Escape" || event.defaultPrevented || !panel?.open) return;
      panel.open = false;
      // A decision may have taken focus since this explanation opened. Do not
      // send it back behind the modal when that decision handles Escape.
      if (panel.contains(document.activeElement)) {
        panel.querySelector("summary")?.focus();
        event.preventDefault();
      }
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [effects.length]);
  const title = t(ownField ? "game.fieldEffects.yours" : "game.fieldEffects.opponent");
  function label(effect: FieldEffectView): string {
    if (effect.kind === "dp")
      return `DP ${Number(effect.value) >= 0 ? "+" : "−"}${Math.abs(Number(effect.value)).toLocaleString()}`;
    if (
      effect.kind === "restriction" &&
      effect.value === "beAffected" &&
      effect.byOpponentEffectsOnly &&
      effect.fromSourceKind?.length === 1
    ) {
      if (effect.fromSourceKind[0] === CardKind.Digimon) {
        return t("game.restriction.immuneToOpponentDigimonEffects");
      }
      if (effect.fromSourceKind[0] === CardKind.Option) {
        return t("game.restriction.immuneToOpponentOptionEffects");
      }
    }
    if (effect.kind === "restriction")
      return t(restrictionLabels[String(effect.value)] ?? "game.fieldEffects.restriction");
    return `${effect.value}${effect.amount === undefined ? "" : ` ${effect.amount >= 0 ? "+" : "−"}${Math.abs(effect.amount)}`}`;
  }
  function duration(effect: FieldEffectView): string {
    const expiry = fieldEffectExpiry(effect);
    switch (expiry.kind) {
      case "whileActive":
        return t("game.fieldEffects.whileActive");
      case "turnEnd":
        return t(expiry.next ? "game.fieldEffects.untilPlayerNextTurnEnd" : "game.fieldEffects.untilPlayerTurnEnd", {
          player: playerNames[expiry.seat],
        });
      case "attackEnd":
        return t("game.fieldEffects.untilAttackEnd");
      case "battleEnd":
        return t("game.fieldEffects.untilBattleEnd");
      case "activePhase":
        return t("game.fieldEffects.untilActivePhase", { player: playerNames[expiry.seat] });
      case "costCalculated":
        return t("game.fieldEffects.untilCost");
      case "thisTurn":
        return t("game.fieldEffects.untilTurnEnd");
    }
  }
  const summary = effects.length === 1 ? label(effects[0]!) : t("game.fieldEffects.count", { count: effects.length });
  const harmful = effects.some(
    (effect) => effect.kind === "restriction" || (effect.kind === "dp" && Number(effect.value) < 0),
  );
  if (effects.length === 0) return null;
  const badge = (
    <details
      ref={details}
      className={`game-field-effects${harmful ? " game-field-effects--warning" : ""}${ownField ? " game-field-effects--own" : ""}`}
      style={{ position: "fixed", ...corner }}
    >
      <summary aria-label={`${title}: ${summary}`}>
        <span className="game-field-effects__chip">
          <Layers size={15} aria-hidden="true" />
          <span key={json} className="game-field-effects__count" aria-hidden="true">
            {effects.length}
          </span>
        </span>
      </summary>
      <ul className="game-field-effects__list" aria-label={title}>
        <li className="game-field-effects__heading">
          <strong>{title}</strong>
          {effects.length > 1 ? <span>{t("game.fieldEffects.count", { count: effects.length })}</span> : null}
        </li>
        {effects.map((effect, index) => (
          <li key={`${effect.sourceCardId}-${effect.kind}-${index}`}>
            <strong>{label(effect)}</strong>
            {effect.sourceCardId ? (
              <span className="game-field-effects__source">
                {getCardName(effect.sourceCardId)} · {effect.sourceCardId}
              </span>
            ) : null}
            {effect.effectText ? <p>{effect.effectText}</p> : null}
            <small>
              <Clock size={12} aria-hidden="true" />
              {duration(effect)}
            </small>
          </li>
        ))}
      </ul>
    </details>
  );
  return (
    <>
      <span ref={anchor} hidden />
      {corner && portalHost ? createPortal(badge, portalHost) : null}
    </>
  );
}
