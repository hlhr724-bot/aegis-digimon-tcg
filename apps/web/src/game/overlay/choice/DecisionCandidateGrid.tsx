import { OpenDecisionCardButton } from "@/game/overlay/choice/OpenDecisionCardButton";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import type { ReactNode } from "react";
import { CardBack, CardFull } from "../../../design/cards";
import { NARROW_DIALOG_QUERY, TOUCH_LAYOUT_QUERY, useMediaQuery } from "../../../design/useMediaQuery";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";

import type { PendingFateBadge } from "../../pendingFate";
import type { CandidateZone } from "../../decisionModel";
import { abstractTargetLabel, cardCopyLabelsByInstance } from "./decisionCandidateLabels";
import type { DecisionCandidate } from "./decisionTypes";
import { playCostBudgetAllowsCandidate } from "./decisionPlayCost";
import { dpBudgetAllowsCandidate } from "./decisionDpBudget";
import { DecisionScrollRow } from "@/game/overlay/choice/DecisionScrollRow";

/** The grid of selectable targets for a `chooseTargets` / `selectCards` decision. */
export function DecisionCandidateGrid({
  candidates,
  picks,
  min,
  max,
  maxTotalPlayCost,
  selectedPlayCost,
  withinPlayCostBudget,
  maxTotalDP,
  selectedDP,
  sourcePicker = false,
  fateBadge,
  onTogglePick,
}: {
  candidates: readonly DecisionCandidate[];
  picks: readonly string[];
  min: number;
  max: number;
  maxTotalPlayCost?: number;
  selectedPlayCost: number;
  withinPlayCostBudget: boolean;
  maxTotalDP?: number;
  selectedDP: number;
  sourcePicker?: boolean;
  fateBadge?: PendingFateBadge;
  onTogglePick: (instanceId: string) => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const narrowDialog = useMediaQuery(NARROW_DIALOG_QUERY);
  const touchLayout = useMediaQuery(TOUCH_LAYOUT_QUERY);
  // Three tiles plus their gaps and the row's own badge gutter have to clear the
  // sheet's padding; on a phone narrower than the grid's breakpoint they only do
  // at the smaller size, and below that the row wraps rather than being clipped.
  let displayedCardWidth = 144;
  if (touchLayout) displayedCardWidth = 110;
  if (narrowDialog) displayedCardWidth = 96;
  const cardCopyLabels = cardCopyLabelsByInstance({ candidates, t });
  // A prompt that reaches into two zones at once (a hand and a trash, say) is
  // unreadable as one undivided row, so each zone gets its own titled section;
  // a single-zone prompt keeps the plain grid it always had.
  const zoneGroups = candidateZoneGroups(candidates).map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => Number(isCandidateSelectable(b)) - Number(isCandidateSelectable(a))),
  }));

  function isCandidateSelectable(cand: DecisionCandidate) {
    return (
      cand.selectable !== false &&
      playCostBudgetAllowsCandidate({
        candidateInstanceId: cand.instanceId,
        picks,
        candidates,
        maxTotalPlayCost,
      }) &&
      dpBudgetAllowsCandidate({
        candidateInstanceId: cand.instanceId,
        picks,
        maxTotalDP,
        dpOf: (id) => candidates.find((candidate) => candidate.instanceId === id)?.currentDP,
      })
    );
  }

  return (
    <div className="decision-overlay__selection" style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ds-text-3)",
          marginBottom: 10,
        }}
      >
        {t("overlay.selectTargets", {
          range: min === max ? max : `${min}–${max}`,
        })}
        <span
          style={{
            float: "right",
            color: picks.length ? "var(--ds-accent)" : "inherit",
          }}
        >
          {t("overlay.chosen", { count: picks.length })}
        </span>
      </div>
      {maxTotalPlayCost !== undefined ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: withinPlayCostBudget ? "var(--ds-text-2)" : "var(--ds-danger)",
            marginBottom: 10,
          }}
        >
          {t("overlay.playCostBudget", {
            selected: selectedPlayCost,
            max: maxTotalPlayCost,
          })}
        </div>
      ) : null}
      {maxTotalDP !== undefined ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: selectedDP <= maxTotalDP ? "var(--ds-text-2)" : "var(--ds-danger)",
            marginBottom: 10,
          }}
        >
          {t("overlay.dpBudget", { selected: selectedDP.toLocaleString(), max: maxTotalDP.toLocaleString() })}
        </div>
      ) : null}
      <div
        className={
          zoneGroups.length > 1 ? "decision-overlay__zones decision-overlay__zones--mixed" : "decision-overlay__zones"
        }
      >
        {zoneGroups.map(({ zone, items }) => (
          <div className="decision-overlay__zone" key={zone ?? "ungrouped"}>
            {zoneGroups.length > 1 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ds-text-2)",
                  marginBottom: 6,
                }}
              >
                <span>{zone ? t(`overlay.candidateZone.${zone}` as const) : t("overlay.candidateZone.other")}</span>
                <span
                  style={{
                    color: "var(--ds-text-3)",
                    fontFamily: "var(--ds-font-mono)",
                  }}
                >
                  {items.length}
                </span>
                <span style={{ flex: 1, height: 1, background: "var(--ds-line)" }} />
              </div>
            ) : null}
            {/* Past six options a row would wrap into rows taller than the sheet, so it
              becomes one scrolling row with a visible track instead (reference #110). */}
            <CandidateRow scrolls={items.length > 6}>
              {items.map((cand) => {
                const on = picks.includes(cand.instanceId);
                const selectable = isCandidateSelectable(cand);
                const abstractLabel = abstractTargetLabel({
                  instanceId: cand.instanceId,
                  t,
                });
                const pendingLabel =
                  cand.pendingEffect && cand.cardId && (cand.zone === "trash" || cand.zone === "opponentTrash")
                    ? t("overlay.pendingEffect")
                    : undefined;
                const usedLabel = cand.oncePerTurnUsed && cand.cardId ? t("overlay.inheritedUsed") : undefined;
                const copyLabel = cardCopyLabels.get(cand.instanceId);
                const sourceLabel =
                  cand.sourceCount === undefined
                    ? undefined
                    : t(cand.sourceCount === 1 ? "overlay.sourceCountOne" : "overlay.sourceCountMany", {
                        count: cand.sourceCount,
                      });
                const liveLabels = [
                  pendingLabel,
                  usedLabel,
                  cand.trashOriginCardId
                    ? t("overlay.trashedFromSources", { name: getCardName(cand.trashOriginCardId) })
                    : undefined,
                  cand.currentDP === undefined ? undefined : `${cand.currentDP.toLocaleString()} DP`,
                  cand.isSuspended === true ? t("overlay.suspended") : undefined,
                  sourceLabel,
                  cand.hostCardId ? getCardName(cand.hostCardId) : undefined,
                ].filter((label): label is string => label !== undefined);
                return (
                  <div key={cand.instanceId} className="decision-candidate-tile">
                    <button
                      className={`decision-overlay__candidate${abstractLabel ? " decision-overlay__candidate--security" : ""}`}
                      data-instance-id={cand.instanceId}
                      type="button"
                      aria-label={`${abstractLabel ?? (cand.cardId ? getCardName(cand.cardId) : t("overlay.card"))}${liveLabels.length ? `, ${liveLabels.join(", ")}` : ""}${copyLabel ? `, ${copyLabel}` : ""}${on ? t("overlay.selected") : ""}`}
                      aria-pressed={on}
                      disabled={!selectable}
                      key={cand.instanceId}
                      style={{
                        width: abstractLabel ? undefined : displayedCardWidth,
                        cursor: selectable ? "pointer" : "not-allowed",
                        opacity: selectable ? 1 : 0.4,
                        filter: selectable ? "none" : "grayscale(0.85)",
                      }}
                      onClick={() => selectable && onTogglePick(cand.instanceId)}
                    >
                      {abstractLabel ? (
                        <span className="decision-security-target">
                          <CardBack width={48} useSelectedSleeve={false} />
                          <span>{abstractLabel}</span>
                          {on ? <Icons.Check size={18} aria-hidden="true" /> : null}
                        </span>
                      ) : (
                        <CardFull
                          cardId={cand.cardId ?? ""}
                          artId={cand.artId}
                          width={displayedCardWidth}
                          selected={on}
                        />
                      )}
                      {cand.hostCardId && !sourcePicker ? (
                        <span className="decision-overlay__source-host" data-host-permanent-id={cand.hostPermanentId}>
                          {getCardName(cand.hostCardId)}
                        </span>
                      ) : null}
                      {copyLabel || pendingLabel || usedLabel || cand.trashOriginCardId ? (
                        <span className="decision-overlay__candidate-details" aria-hidden="true">
                          {copyLabel ? <span>{copyLabel}</span> : null}
                          {pendingLabel ? (
                            <span className="decision-overlay__pending-effect">{pendingLabel}</span>
                          ) : null}
                          {usedLabel ? <span className="decision-overlay__used-effect">{usedLabel}</span> : null}
                          {cand.trashOriginCardId ? (
                            <span>
                              {t("overlay.trashedFromSources", { name: getCardName(cand.trashOriginCardId) })}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {on && max > 1 ? (
                        <span className="decision-overlay__order-badge" aria-hidden="true">
                          {picks.indexOf(cand.instanceId) + 1}
                        </span>
                      ) : null}
                      {selectable && !abstractLabel && max === 1 ? (
                        <span className="decision-overlay__pick-mark" data-picked={on} aria-hidden="true">
                          {on ? <Icons.Check size={14} /> : null}
                        </span>
                      ) : null}
                      {/* What the effect will do to this card, once it has been
                  chosen. Server truth: `options.targetFate` is projected from
                  the IR action that raised the prompt, so the badge never
                  guesses an outcome out of the prompt's English. */}
                      {on && fateBadge ? (
                        <span
                          className={`game-fate-badge game-fate-badge--${fateBadge.tone} decision-overlay__fate`}
                          data-fate={fateBadge.fate}
                          aria-hidden="true"
                        >
                          <i aria-hidden="true">{fateBadge.glyph}</i>
                          {t(fateBadge.labelKey)}
                        </span>
                      ) : null}
                      {!selectable ? (
                        <span
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            color: "var(--ds-text-3)",
                            background: "var(--ds-sheet)",
                            borderRadius: "50%",
                          }}
                        >
                          <Icons.Ban size={16} />
                        </span>
                      ) : null}
                    </button>
                    {cand.cardId && !abstractLabel ? (
                      <span className="decision-overlay__candidate-name">{getCardName(cand.cardId)}</span>
                    ) : null}
                    <OpenDecisionCardButton cardId={abstractLabel ? undefined : cand.cardId} artId={cand.artId} />
                  </div>
                );
              })}
            </CandidateRow>
          </div>
        ))}
      </div>
    </div>
  );
}

type CandidateRowParams = {
  scrolls: boolean;
  children: ReactNode;
};

function CandidateRow({ scrolls, children }: CandidateRowParams) {
  if (scrolls) {
    return (
      <DecisionScrollRow className="decision-overlay__grid decision-overlay__grid--scroll">
        {children}
      </DecisionScrollRow>
    );
  }
  return <div className="decision-overlay__grid">{children}</div>;
}

/** Candidates split by the zone they sit in, each zone keeping the order it arrived in. */
function candidateZoneGroups(
  candidates: readonly DecisionCandidate[],
): { zone: CandidateZone | undefined; items: DecisionCandidate[] }[] {
  const groups: {
    zone: CandidateZone | undefined;
    items: DecisionCandidate[];
  }[] = [];
  for (const candidate of candidates) {
    const group = groups.find((entry) => entry.zone === candidate.zone);
    if (group) group.items.push(candidate);
    else groups.push({ zone: candidate.zone, items: [candidate] });
  }
  return groups;
}
