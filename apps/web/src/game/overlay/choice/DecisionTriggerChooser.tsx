import { encodeTriggerResolutionPlan } from "@aegis/shared/protocol/encodeTriggerResolutionPlan";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { useState } from "react";
import { DecisionReorderHandle } from "./DecisionReorderHandle";
import { reorderDecisionItems, useDecisionReorder } from "./useDecisionReorder";
import { parseTriggerKey, type DecisionResponse } from "@aegis/shared";
import { EffectText } from "../../EffectText";
import { CardFull } from "../../../design/cards";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { triggerCardId, triggerLabels } from "../../boardModel";
import {
  cardEffectClauseForTiming,
  cardEffectClausesForTiming,
  playerFacingEffectClause,
  printedTimingLabel,
} from "../effectText";
import type { TriggerDetail } from "../types";
import { DecisionViewBoardButton } from "./DecisionViewBoardButton";
import { TriggerChooserScrollCue } from "./TriggerChooserScrollCue";
import { scrollToNextEntry } from "./scrollToNextEntry";
import { useContentBelow } from "./useContentBelow";

/** Preset answer for an effect's yes/no questions; absent means the engine asks. */
type Preset = "yes" | "no";

export interface WaitingTrigger {
  cardId: string;
  description: string | undefined;
  isInherited: boolean;
}

/**
 * The chooser for an `orderTriggers` decision. A plain prompt picks the one effect that fires
 * next. A prompt that accepts a resolution plan lets the player click effects in resolution
 * order, like Assembly materials, and preset each effect's yes/no questions.
 */
export function DecisionTriggerChooser({
  triggerKeys,
  triggerCardIds,
  triggerDetails,
  wideDialog,
  timing,
  triggerTimings,
  triggerDescriptions,
  triggerReasons,
  triggerIsInherited,
  triggerIsOptional,
  waitingTriggers,
  acceptsResolutionPlan,
  acceptsIndexedResolutionPlan = false,
  onRespond,
  onOpenBoard,
}: {
  triggerKeys: readonly string[];
  triggerCardIds: readonly string[];
  /** Aligned to `triggerKeys`; empty means the chooser shows names only. */
  triggerDetails: readonly TriggerDetail[];
  wideDialog: boolean;
  timing: string | undefined;
  triggerTimings: readonly string[] | undefined;
  triggerDescriptions: readonly string[] | undefined;
  /** Aligned to `triggerKeys`: the printed condition that armed each entry, when it differs. */
  triggerReasons: readonly string[] | undefined;
  triggerIsInherited: readonly boolean[] | undefined;
  triggerIsOptional: readonly boolean[] | undefined;
  /** Older pending effects that resolve after every offered entry. Shown, never chosen. */
  waitingTriggers: readonly WaitingTrigger[];
  acceptsResolutionPlan: boolean;
  acceptsIndexedResolutionPlan?: boolean;
  onRespond: (response: DecisionResponse) => void;
  onOpenBoard: () => void;
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const translateCardText = useTranslatedCardText();
  const [order, setOrder] = useState<string[]>([]);
  const [presets, setPresets] = useState<Readonly<Record<string, Preset>>>({});
  const triggerKeyLabels = triggerLabels(triggerKeys, t, triggerCardIds, getCardName);
  // Two effects of ONE permanent reach the chooser with the same name and art; the
  // window each fired in is the only honest thing that separates them.
  const triggerTimingLabels = triggerKeys.map((_key, index) =>
    printedTimingLabel(triggerTimings?.[index] || timing || undefined),
  );
  const commonTriggerTiming =
    triggerTimingLabels.length > 0 && triggerTimingLabels.every((label) => label === triggerTimingLabels[0])
      ? triggerTimingLabels[0]
      : undefined;
  const entryClauses = distinctTriggerClauses(
    triggerKeys.map((key, index) => {
      const cardId = triggerCardIds[index] ?? triggerCardId(key);
      const entryTiming = triggerTimings?.[index] || timing || undefined;
      const isInherited = triggerIsInherited?.[index];
      return {
        cardId,
        timing: entryTiming,
        isInherited,
        sourceInstanceId: parseTriggerKey(key).instanceId,
        effectIdentity: parseTriggerKey(key).effectKey.replace(/\/activation-\d+$/, ""),
        hasDescription: Boolean(triggerDescriptions?.[index]?.trim()),
        clause:
          playerFacingEffectClause({
            cardId,
            timing: entryTiming,
            description: triggerDescriptions?.[index],
            isInherited,
          }) ?? cardEffectClauseForTiming(cardId, entryTiming, isInherited),
      };
    }),
  );

  const visibleIndexes = onceActivatableIndexes(triggerKeys, entryClauses);
  const optionCount = visibleIndexes.length;
  const visibleKeys = visibleIndexes.map((index) => triggerKeys[index]!);
  const displayedKeys = acceptsResolutionPlan
    ? [...order, ...visibleKeys.filter((key) => !order.includes(key))]
    : visibleKeys;
  const reorder = (from: string, to: string) => {
    if (acceptsResolutionPlan) setOrder(reorderDecisionItems(displayedKeys, from, to));
  };
  const drag = useDecisionReorder(reorder);
  const contentBelow = useContentBelow(drag.listRef, displayedKeys.length);
  const revealNextEntry = () => {
    if (drag.listRef.current) scrollToNextEntry(drag.listRef.current, ".trigger-chooser__entry");
  };
  const optionalKeys = acceptsResolutionPlan
    ? visibleIndexes.filter((index) => triggerIsOptional?.[index] === true).map((index) => triggerKeys[index]!)
    : [];

  // Missing optionality metadata is unknown, never evidence of a mandatory effect.
  const mandatoryKeys = acceptsResolutionPlan
    ? visibleIndexes.filter((index) => triggerIsOptional?.[index] === false).map((index) => triggerKeys[index]!)
    : [];
  const canSelectMandatory = mandatoryKeys.length < optionCount && mandatoryKeys.some((key) => !order.includes(key));

  const toggle = (key: string) => {
    if (!acceptsResolutionPlan) {
      setOrder((current) => (current[0] === key ? [] : [key]));
      return;
    }
    setOrder((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  };
  const orderRemaining = () =>
    setOrder((current) => [...current, ...visibleKeys.filter((key) => !current.includes(key))]);
  const orderMandatory = () =>
    setOrder((current) => [...current, ...mandatoryKeys.filter((key) => !current.includes(key))]);
  const setPreset = (key: string, preset: Preset | undefined) =>
    setPresets((current) => {
      const { [key]: _previous, ...rest } = current;
      return preset === undefined ? rest : { ...rest, [key]: preset };
    });
  const presetAll = (preset: Preset) => {
    orderRemaining();
    setPresets(Object.fromEntries(optionalKeys.map((key) => [key, preset])));
  };

  // With no effect picked, a plan resolves the list as shown: the Yes/No presets already
  // answer each effect, so making the player click every row again adds nothing.
  const submittedOrder = acceptsResolutionPlan && order.length === 0 ? displayedKeys : order;
  const canResolve = acceptsResolutionPlan ? submittedOrder.length > 0 : order.length === 1;
  const respond = () => {
    const optionalAnswers = Object.fromEntries(Object.entries(presets).map(([key, preset]) => [key, preset === "yes"]));
    onRespond(
      encodeTriggerResolutionPlan({
        supportsIndexes: acceptsIndexedResolutionPlan,
        triggerKeys,
        response:
          acceptsResolutionPlan && Object.keys(optionalAnswers).length > 0
            ? { kind: "orderTriggers", order: [...submittedOrder], optionalAnswers }
            : { kind: "orderTriggers", order: [...submittedOrder] },
      }),
    );
  };
  const resolveLabel =
    optionCount === 1
      ? t("overlay.resolveEffect")
      : submittedOrder.length > 1
        ? t("overlay.resolveInOrder")
        : t("overlay.resolveNextEffect");

  return (
    <div className="trigger-chooser__layout">
      {acceptsResolutionPlan && optionCount > 1 ? null : (
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
          {t(optionCount === 1 ? "overlay.confirmPendingEffect" : "overlay.chooseNextEffect")}
        </div>
      )}
      {commonTriggerTiming || optionalKeys.length > 0 ? (
        <div className="trigger-chooser__toolbar">
          <div className="trigger-chooser__intro">
            {commonTriggerTiming ? <span className="trigger-chooser__context">{commonTriggerTiming}</span> : null}
            {acceptsResolutionPlan && optionCount > 1 ? (
              <span className="trigger-chooser__hint">{t("overlay.orderNextEffects")}</span>
            ) : null}
          </div>
          {optionalKeys.length > 0 ? (
            <div className="trigger-chooser__bulk" role="group">
              <Button size="sm" variant="secondary" onClick={() => presetAll("yes")}>
                {t("overlay.presetYesAll")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => presetAll("no")}>
                {t("overlay.presetNoAll")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={order.length === 0 && Object.keys(presets).length === 0}
                onClick={() => {
                  setOrder([]);
                  setPresets({});
                }}
              >
                {t("overlay.presetReset")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={drag.listRef}
        role={acceptsResolutionPlan ? "list" : undefined}
        aria-label={acceptsResolutionPlan ? t("overlay.orderPendingEffects") : undefined}
        className={`trigger-chooser${acceptsResolutionPlan ? " trigger-chooser--plan" : ""}`}
      >
        {displayedKeys.map((key, displayIndex) => {
          const i = triggerKeys.indexOf(key);
          const position = order.indexOf(key);
          const chosen = position >= 0;
          const isOptional = optionalKeys.includes(key);
          const cardId = triggerCardIds[i] ?? triggerCardId(key);
          const detail = triggerDetails[i];
          const timingLabel = triggerTimingLabels[i];
          const activeClause = entryClauses[i];
          const reason = triggerReasons?.[i] ? translateCardText({ text: triggerReasons[i], cardId }) : undefined;
          return (
            <div
              key={key}
              role={acceptsResolutionPlan ? "listitem" : undefined}
              data-reorder-id={acceptsResolutionPlan ? key : undefined}
              data-dragging={drag.dragging === key || undefined}
              data-drop-target={(drag.dropTarget === key && drag.dragging !== key) || undefined}
              className={`trigger-chooser__entry${chosen ? " trigger-chooser__entry--chosen" : ""}`}
            >
              {acceptsResolutionPlan && optionCount > 1 ? (
                <DecisionReorderHandle
                  position={displayIndex + 1}
                  onCancel={drag.cancel}
                  onRestore={(originalPosition) => {
                    const target = displayedKeys[originalPosition - 1];
                    if (target) {
                      reorder(key, target);
                    }
                  }}
                  {...drag.handleProps(key)}
                  onMove={(delta) => {
                    const target = displayedKeys[displayIndex + delta];
                    if (target) reorder(key, target);
                  }}
                />
              ) : null}
              <button
                type="button"
                className={`trigger-chooser__option${chosen ? " trigger-chooser__option--chosen" : ""}`}
                aria-label={[timingLabel, triggerKeyLabels[i], detail?.sourceLabel, reason].filter(Boolean).join(", ")}
                aria-pressed={chosen}
                onClick={() => toggle(key)}
              >
                <span className="trigger-chooser__heading">
                  <span className="trigger-chooser__card">
                    <CardFull
                      cardId={cardId}
                      width={acceptsResolutionPlan ? 64 : wideDialog ? 96 : 72}
                      zoomOnHover={false}
                    />
                    {acceptsResolutionPlan && chosen ? (
                      <span className="decision-overlay__order-badge" aria-hidden="true">
                        {position + 1}
                      </span>
                    ) : null}
                  </span>
                  <span className="trigger-chooser__meta">
                    <span className="trigger-chooser__name">{triggerKeyLabels[i]}</span>
                    <span className="trigger-chooser__id">{cardId}</span>
                    {detail?.hostCardId ? (
                      <span className="trigger-chooser__host">
                        <span className="trigger-chooser__host-art">
                          <CardFull cardId={detail.hostCardId} width={28} zoomOnHover={false} />
                        </span>
                        <span className="trigger-chooser__source">{detail.sourceLabel}</span>
                      </span>
                    ) : detail?.sourceLabel ? (
                      <span className="trigger-chooser__source">{detail.sourceLabel}</span>
                    ) : null}
                    {reason ? (
                      <span className="trigger-chooser__reason">{t("overlay.triggerReason", { reason })}</span>
                    ) : null}
                  </span>
                  {chosen && !acceptsResolutionPlan ? (
                    <span className="trigger-chooser__check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </span>
                {activeClause ? (
                  <span className="trigger-chooser__section">
                    <span className="trigger-chooser__effect-text">
                      <EffectText
                        text={activeClause}
                        cardId={cardId}
                        timing={triggerTimings?.[i] || timing}
                        surface="trigger-order"
                        allowContext
                      />
                    </span>
                  </span>
                ) : null}
              </button>
              {acceptsResolutionPlan ? (
                isOptional ? (
                  <PresetControl
                    label={t("overlay.presetLabel", { name: triggerKeyLabels[i] ?? cardId })}
                    value={presets[key]}
                    onChange={(preset) => setPreset(key, preset)}
                  />
                ) : triggerIsOptional?.[i] === false ? (
                  <span className="trigger-chooser__mandatory">{t("overlay.presetMandatory")}</span>
                ) : null
              ) : null}
            </div>
          );
        })}
      </div>
      {contentBelow ? <TriggerChooserScrollCue onClick={revealNextEntry} /> : null}
      {waitingTriggers.length > 0 ? <WaitingTriggerList entries={waitingTriggers} timing={timing} /> : null}
      <div className="trigger-chooser__footer">
        <DecisionViewBoardButton onOpenBoard={onOpenBoard} />
        {acceptsResolutionPlan && optionCount > 1 ? (
          <div className="trigger-chooser__status" aria-live="polite">
            <span>{t("overlay.orderedCount", { ordered: order.length, total: optionCount })}</span>
            {order.length === 0 ? (
              <Button size="sm" variant="secondary" onClick={orderRemaining}>
                {t("overlay.orderAllTopToBottom")}
              </Button>
            ) : null}
            {canSelectMandatory ? (
              <Button size="sm" variant="secondary" onClick={orderMandatory}>
                {t("overlay.orderMandatoryTopToBottom")}
              </Button>
            ) : null}
            {order.length > 0 && order.length < optionCount ? (
              <>
                <span className="trigger-chooser__status-hint">{t("overlay.orderedRestLater")}</span>
                <Button size="sm" variant="secondary" onClick={orderRemaining}>
                  {t("overlay.orderRemaining")}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        <Button size="lg" icon={Icons.Check} disabled={!canResolve} onClick={respond}>
          {resolveLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Two effects of one card under one timing (EX13-036 prints [When Digivolving] twice)
 * both resolve to the FIRST printed clause when the engine sends no description for them.
 * Hand the n-th such entry the n-th printed clause instead, so the chooser never shows the
 * same words twice for two different effects of that instance. Supplied descriptions and
 * separate copies must retain their own clause, even when their words are identical.
 */
function distinctTriggerClauses(
  entries: readonly {
    cardId: string;
    timing: string | undefined;
    isInherited?: boolean;
    clause: string | undefined;
    sourceInstanceId: string;
    effectIdentity: string;
    hasDescription: boolean;
  }[],
): (string | undefined)[] {
  const clauses = entries.map((entry) => entry.clause);
  const seen = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (entry.clause === undefined || entry.hasDescription || entry.sourceInstanceId === "") return;
    const key = `${entry.sourceInstanceId}\u0000${entry.cardId}\u0000${entry.timing ?? ""}\u0000${entry.isInherited === true}\u0000${entry.clause}`;
    seen.set(key, [...(seen.get(key) ?? []), index]);
  });
  for (const indexes of seen.values()) {
    if (indexes.length < 2) continue;
    // Multiple occurrences of one effect still name one clause, even without descriptions.
    if (new Set(indexes.map((index) => entries[index]!.effectIdentity)).size !== indexes.length) continue;
    const first = entries[indexes[0]!]!;
    const printed = cardEffectClausesForTiming(first.cardId, first.timing, first.isInherited);
    if (printed.length < indexes.length) continue;
    indexes.forEach((entryIndex, position) => {
      clauses[entryIndex] = printed[position];
    });
  }
  return clauses;
}

/**
 * One [Once Per Turn] clause can be pending twice when separate events trigger it, such as
 * BT25-060 Rebootmon getting linked and then unsuspending. Only the first can activate, so
 * the chooser offers it once; the engine drops the other copy after it resolves.
 */
function onceActivatableIndexes(triggerKeys: readonly string[], clauses: readonly (string | undefined)[]): number[] {
  const seen = new Set<string>();
  return triggerKeys.flatMap((key, index) => {
    const clause = clauses[index];
    if (clause === undefined || !clause.includes("[Once Per Turn]")) return [index];
    const identity = `${parseTriggerKey(key).instanceId}\u0000${clause}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [index];
  });
}

/**
 * Effects that triggered before the offered ones. The rules resolve every newer effect first
 * (CR §15-4-5-2/3), so without this list a player sees their earlier effects vanish from the
 * prompt and may think the game dropped them. Identical entries collapse into one counted row:
 * three Tamers watching the same event would otherwise repeat one long clause until the list
 * crowds out the effects the player can actually choose.
 */
function WaitingTriggerList({ entries, timing }: { entries: readonly WaitingTrigger[]; timing: string | undefined }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const groups = groupWaitingTriggers(entries, timing);
  return (
    <section className="trigger-chooser__waiting" aria-label={t("overlay.waitingEffects")}>
      <div className="trigger-chooser__waiting-title">{t("overlay.waitingEffects")}</div>
      <p className="trigger-chooser__waiting-hint">{t("overlay.waitingEffectsHint")}</p>
      <ul className="trigger-chooser__waiting-list">
        {groups.map(({ cardId, clause, count }, index) => (
          <li key={`${cardId}-${index}`} className="trigger-chooser__waiting-entry">
            <CardFull cardId={cardId} width={40} zoomOnHover={false} />
            <span className="trigger-chooser__meta">
              <span className="trigger-chooser__name">
                {getCardName(cardId)}
                {count > 1 ? <span className="trigger-chooser__waiting-count">×{count}</span> : null}
              </span>
              {clause ? (
                <span className="trigger-chooser__effect-text">
                  <EffectText text={clause} cardId={cardId} timing={timing} surface="waiting-trigger" allowContext />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function groupWaitingTriggers(
  entries: readonly WaitingTrigger[],
  timing: string | undefined,
): { cardId: string; clause: string | undefined; count: number }[] {
  const groups = new Map<string, { cardId: string; clause: string | undefined; count: number }>();
  for (const entry of entries) {
    const clause =
      playerFacingEffectClause({
        cardId: entry.cardId,
        timing,
        description: entry.description,
        isInherited: entry.isInherited,
      }) ?? entry.description;
    const key = `${entry.cardId}\u0000${clause ?? ""}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { cardId: entry.cardId, clause, count: 1 });
  }
  return [...groups.values()];
}

/** Ask / Yes / No for the yes/no questions one pending effect will ask. */
function PresetControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Preset | undefined;
  onChange: (preset: Preset | undefined) => void;
}) {
  const { t } = useTranslation();
  const options: { preset: Preset | undefined; text: string }[] = [
    { preset: undefined, text: t("overlay.presetAsk") },
    { preset: "yes", text: t("overlay.presetYes") },
    { preset: "no", text: t("overlay.presetNo") },
  ];
  return (
    <div className="trigger-chooser__preset" role="group" aria-label={label}>
      {options.map(({ preset, text }) => (
        <button
          key={text}
          type="button"
          className="trigger-chooser__preset-option"
          aria-pressed={value === preset}
          onClick={() => onChange(preset)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
