import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { BoardPromptRail, type BoardPromptVariant } from "../../BoardDecisionRail";
import { CardArt } from "../CardArt";
import { CardPromptFrame } from "./CardPromptFrame";

import { useBoardPreview } from "../choice/useBoardPreview";
import { DecisionViewBoardButton } from "../choice/DecisionViewBoardButton";

type CounterChoice = { instanceId: string; effectKey: string; description: string };

/** Wider than the rail's default, so the viewer's own counter card reads at a glance.
    The opponent's attacker is not shown: it is already on the board. */
const COUNTER_ART_WIDTH = 120;

/** Decode server-provided legal choices without deriving any card rules in the client. */
export function counterTargetIds(effectKey: string): { permanentId: string; handInstanceId?: string } | undefined {
  if (effectKey.startsWith("blast-digivolve:")) return { permanentId: effectKey.slice("blast-digivolve:".length) };
  if (effectKey.startsWith("blast-dna-digivolve:")) {
    try {
      const [permanentId, , handInstanceId] = JSON.parse(effectKey.slice("blast-dna-digivolve:".length));
      return { permanentId, handInstanceId };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Where each legal counter comes from, as the viewer picks it: a card in the hand, or a
 * Digimon on the field (whose top, digivolution or linked card carries the [Counter]).
 */
export function counterSources({
  eligibleCounters,
  handInstanceIds,
  fieldPermanentOf,
}: {
  eligibleCounters: readonly CounterChoice[];
  handInstanceIds: readonly string[];
  fieldPermanentOf: (instanceId: string) => string | undefined;
}) {
  const sourceKeyOf = (instanceId: string) =>
    handInstanceIds.includes(instanceId) ? `hand:${instanceId}` : `field:${fieldPermanentOf(instanceId) ?? instanceId}`;
  const sourceKeys = [...new Set(eligibleCounters.map((choice) => sourceKeyOf(choice.instanceId)))];
  const fieldSourceByPermanent = new Map<string, string>();
  for (const choice of eligibleCounters) {
    const permanentId = handInstanceIds.includes(choice.instanceId) ? undefined : fieldPermanentOf(choice.instanceId);
    if (permanentId && !fieldSourceByPermanent.has(permanentId))
      fieldSourceByPermanent.set(permanentId, choice.instanceId);
  }
  return { sourceKeyOf, sourceKeys, fieldSourceByPermanent, mustPickSource: sourceKeys.length > 1 };
}

const SOURCE_ART_WIDTH = 96;

type CounterSource = {
  key: string;
  instanceId: string;
  zone: "field" | "hand";
  cardId: string;
  copies: number;
  effects: string[];
};

type CounterAttack = { attackerCardId?: string; attackerDp?: number; targetCardId?: string };

function CounterSourcePicker({
  sources,
  selectedKey,
  onPick,
}: {
  sources: readonly CounterSource[];
  selectedKey?: string;
  onPick: (instanceId: string) => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const groups = (["field", "hand"] as const)
    .map((zone) => ({
      zone,
      label: t(zone === "field" ? "overlay.counterZoneField" : "overlay.counterZoneHand"),
      items: sources.filter((source) => source.zone === zone),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="counter-sources">
      {groups.map((group) => (
        <section className="counter-sources__group" key={group.zone} aria-label={group.label}>
          <h3 className="counter-sources__zone">{group.label}</h3>
          <div className="counter-sources__grid">
            {group.items.map((source) => {
              const name = getCardName(source.cardId);
              return (
                <button
                  type="button"
                  key={source.key}
                  className="counter-sources__card"
                  aria-pressed={source.key === selectedKey}
                  aria-label={t(
                    group.zone === "hand" ? "overlay.counterSourceInHand" : "overlay.counterSourceOnField",
                    { card: name },
                  )}
                  onClick={() => onPick(source.instanceId)}
                >
                  <span className="counter-sources__art">
                    <CardArt cardId={source.cardId} width={SOURCE_ART_WIDTH} />
                    {source.copies > 1 ? <span className="counter-sources__copies">×{source.copies}</span> : null}
                  </span>
                  <strong className="counter-sources__name">{name}</strong>
                  {source.effects.map((effect) => (
                    <span className="counter-sources__effect" key={effect}>
                      {effect}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * With one source the rail asks and confirms beside the board. With several, a centered
 * dialog lists every source with its effect, and Activate confirms the picked one. Blast
 * hosts are chosen in a card gallery, since same-name hosts differ only by their art.
 * Every submitted route is one the server offered.
 */
export function CounterOverlay({
  eligibleCounters,
  getCardId,
  fieldPermanentOf = () => undefined,
  selectedInstanceId,
  onSelectInstance,
  handInstanceIds,
  onActivate,
  onPass,
  attack,
}: {
  eligibleCounters: CounterChoice[];
  getCardId: (instanceId: string) => string | undefined;
  fieldPermanentOf?: (instanceId: string) => string | undefined;
  selectedInstanceId?: string;
  selectedTargetPermanentId?: string;
  onSelectInstance: (instanceId?: string) => void;
  handInstanceIds: readonly string[];
  onActivate: (instanceId: string, effectKey: string) => void;
  onPass: () => void;
  attack?: CounterAttack;
}) {
  const getCardName = useTranslatedCardName();
  const translations = useCardTranslations({ includePrintedText: true });
  const { t } = useTranslation();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  if (isViewingBoard) return boardReturn;
  const { sourceKeyOf, sourceKeys, mustPickSource } = counterSources({
    eligibleCounters,
    handInstanceIds,
    fieldPermanentOf,
  });
  const onlySource = sourceKeys.length === 1 && sourceKeys[0]!.startsWith("field:") ? sourceKeys[0] : undefined;
  const selectedSource = selectedInstanceId ? sourceKeyOf(selectedInstanceId) : onlySource;
  const choices = selectedSource
    ? eligibleCounters.filter((choice) => sourceKeyOf(choice.instanceId) === selectedSource)
    : [];
  const selectedBlast = choices.some((choice) => counterTargetIds(choice.effectKey));

  const inlineChoices = choices;
  // Identical hand partners offer the same action. Keep one server-provided route
  // per card while preserving distinct hosts, field sources and DNA ingredient order.
  const uniqueChoices = new Map<string, CounterChoice>();
  for (const choice of inlineChoices) {
    const target = counterTargetIds(choice.effectKey);
    const partnerCardId = target?.handInstanceId ? getCardId(target.handInstanceId) : undefined;
    const route = partnerCardId
      ? JSON.parse(choice.effectKey.slice("blast-dna-digivolve:".length)).map((id: unknown, index: number) =>
          index === 2 ? partnerCardId : id,
        )
      : choice.effectKey;
    const key = JSON.stringify([choice.instanceId, route]);
    if (!uniqueChoices.has(key)) uniqueChoices.set(key, choice);
  }
  const blastLabel = choices.some((choice) => choice.effectKey.startsWith("blast-dna-digivolve:"))
    ? t("decision.choice.counterBlastDnaTitle")
    : t("decision.choice.counterBlastTitle");
  const loneChoice = !selectedBlast && inlineChoices.length === 1 ? inlineChoices[0] : undefined;
  const sourceCardId = selectedInstanceId
    ? getCardId(selectedInstanceId)
    : choices[0]
      ? getCardId(choices[0].instanceId)
      : undefined;
  const loneCardId = loneChoice ? getCardId(loneChoice.instanceId) : undefined;
  // With another source to pick, the confirm step backs out to that pick instead of passing.
  const cancelsToPick = mustPickSource && selectedInstanceId !== undefined && !selectedBlast;
  const pickingInHand = !selectedSource && sourceKeys.some((key) => key.startsWith("hand:"));
  const pickingOnField = !selectedSource && sourceKeys.some((key) => key.startsWith("field:"));
  const variant: BoardPromptVariant = pickingInHand
    ? "selection"
    : pickingOnField || selectedBlast
      ? "field-selection"
      : "prompt";
  const prompt = selectedBlast
    ? t("overlay.counterChooseField")
    : loneCardId
      ? t("overlay.counterActivatePrompt", { card: getCardName(loneCardId) })
      : pickingInHand && pickingOnField
        ? t("overlay.counterChooseSource")
        : pickingInHand
          ? t("overlay.counterChooseHand")
          : pickingOnField
            ? t("overlay.counterChooseFieldSource")
            : t("overlay.counterPrompt");
  const choiceLabel = (choice: CounterChoice) => {
    if (choice.effectKey.startsWith("blast-dna-digivolve:")) {
      return t("decision.choice.counterBlastDnaShort");
    }
    if (choice.effectKey.startsWith("blast-digivolve:")) {
      return t("decision.choice.counterBlastTitle");
    }
    const cardId = getCardId(choice.instanceId);
    const description = getTranslatedCardText({ text: choice.description, translations, cardId });
    return `${getCardName(cardId ?? "")} · ${description}`;
  };
  const effectLabel = (choice: CounterChoice) =>
    counterTargetIds(choice.effectKey) ? t("overlay.counterKindBlastAce") : t("overlay.counterKindCounter");
  const pickerKeyOf = (instanceId: string) =>
    sourceKeyOf(instanceId).startsWith("hand:")
      ? `hand-card:${getCardId(instanceId) ?? instanceId}`
      : sourceKeyOf(instanceId);
  if (mustPickSource && !selectedBlast) {
    const sources = new Map<string, CounterSource>();
    for (const key of sourceKeys) {
      const sourceChoices = eligibleCounters.filter((choice) => sourceKeyOf(choice.instanceId) === key);
      const instanceId = sourceChoices[0]!.instanceId;
      const pickerKey = pickerKeyOf(instanceId);
      const existing = sources.get(pickerKey);
      if (existing) {
        existing.copies += 1;
        continue;
      }
      sources.set(pickerKey, {
        key: pickerKey,
        instanceId,
        zone: key.startsWith("hand:") ? "hand" : "field",
        cardId: getCardId(instanceId) ?? "",
        copies: 1,
        effects: [...new Set(sourceChoices.map(effectLabel))],
      });
    }
    const attackerName = attack?.attackerCardId ? getCardName(attack.attackerCardId) : undefined;
    const attackSummary = attackerName
      ? attack?.targetCardId
        ? t("overlay.counterAttackOnDigimon", {
            attacker: attackerName,
            dp: (attack.attackerDp ?? 0).toLocaleString(),
            target: getCardName(attack.targetCardId),
          })
        : t("overlay.counterAttackOnYou", { attacker: attackerName, dp: (attack?.attackerDp ?? 0).toLocaleString() })
      : t("overlay.counterPrompt");
    return (
      <CardPromptFrame
        surface="center"
        className="counter-overlay--sources"
        cardId={attack?.attackerCardId}
        label={t("overlay.counterTiming")}
        eyebrow={t("decision.choice.counterMarker")}
        title={t("overlay.counterChooseCard")}
        description={attackSummary}
        onBack={selectedInstanceId ? () => onSelectInstance(undefined) : undefined}
        reserveHand={false}
        boardAction={false}
      >
        <CounterSourcePicker
          sources={[...sources.values()]}
          selectedKey={selectedInstanceId ? pickerKeyOf(selectedInstanceId) : undefined}
          onPick={onSelectInstance}
        />
        <div className="counter-overlay__confirm">
          <DecisionViewBoardButton onOpenBoard={openBoard} />
          <Button className="counter-overlay__pass" variant="secondary" onClick={onPass}>
            {t("overlay.passCounterShort")}
          </Button>
          {uniqueChoices.size > 1 ? (
            [...uniqueChoices.values()].map((choice) => (
              <Button
                key={`${choice.instanceId}-${choice.effectKey}`}
                className="counter-overlay__activate"
                icon={Icons.Sparkles}
                onClick={() => onActivate(choice.instanceId, choice.effectKey)}
              >
                {choiceLabel(choice)}
              </Button>
            ))
          ) : (
            <Button
              className="counter-overlay__activate"
              icon={Icons.Sparkles}
              disabled={!loneChoice}
              onClick={() => loneChoice && onActivate(loneChoice.instanceId, loneChoice.effectKey)}
            >
              {t("overlay.activateCounter")}
            </Button>
          )}
        </div>
      </CardPromptFrame>
    );
  }
  if (selectedBlast) {
    const offered = [...uniqueChoices.values()];
    const changeCardLabel = mustPickSource ? t("overlay.counterBack") : t("common.cancel");
    if (offered.every((choice) => choice.effectKey.startsWith("blast-digivolve:"))) {
      return (
        <BoardPromptRail
          variant="field-selection"
          className="board-prompt--counter"
          label={t("overlay.counterTiming")}
          eyebrow={blastLabel}
          art={sourceCardId}
          artWidth={COUNTER_ART_WIDTH}
          prompt={t("overlay.counterChooseField")}
          onOpenDialog={() => onSelectInstance(undefined)}
        >
          <Button full variant="secondary" onClick={() => onSelectInstance(undefined)}>
            {changeCardLabel}
          </Button>
          <Button className="board-prompt__decline" full variant="secondary" onClick={onPass}>
            {t("overlay.passCounterShort")}
          </Button>
        </BoardPromptRail>
      );
    }
    return (
      <CardPromptFrame
        surface={mustPickSource ? "center" : "left"}
        cardId={sourceCardId}
        label={t("overlay.counterTiming")}
        eyebrow={blastLabel}
        title={t("overlay.counterChooseField")}
        description={t("overlay.counterPrompt")}
        onBack={selectedInstanceId ? () => onSelectInstance(undefined) : undefined}
      >
        <div className="counter-overlay__gallery block-overlay__gallery">
          {offered.map((choice, index) => {
            const target = counterTargetIds(choice.effectKey);
            const cardId = target ? getCardId(target.permanentId) : getCardId(choice.instanceId);
            const partnerCardId = target?.handInstanceId ? getCardId(target.handInstanceId) : undefined;
            return (
              <button
                type="button"
                className="counter-overlay__card"
                key={`${choice.instanceId}-${choice.effectKey}`}
                onClick={() => onActivate(choice.instanceId, choice.effectKey)}
              >
                {cardId ? <CardArt cardId={cardId} width={112} /> : null}
                <strong>{getCardName(cardId ?? "")}</strong>
                <span>{choiceLabel(choice)}</span>
                {partnerCardId ? <span>+ {getCardName(partnerCardId)}</span> : null}
                <span className="counter-overlay__card-id">
                  {index + 1} / {offered.length}
                </span>
              </button>
            );
          })}
        </div>
        {selectedInstanceId ? (
          <Button full variant="ghost" onClick={() => onSelectInstance(undefined)}>
            {mustPickSource ? t("overlay.counterBack") : t("common.cancel")}
          </Button>
        ) : null}
        <Button full variant="secondary" onClick={onPass}>
          {t("overlay.passCounterShort")}
        </Button>
      </CardPromptFrame>
    );
  }
  return (
    <BoardPromptRail
      variant={variant}
      className="board-prompt--counter"
      handSpace="keepVisible"
      label={t("overlay.counterTiming")}
      eyebrow={selectedBlast ? blastLabel : t("decision.choice.counterMarker")}
      art={sourceCardId}
      artWidth={COUNTER_ART_WIDTH}
      prompt={prompt}
      onOpenDialog={selectedInstanceId ? () => onSelectInstance(undefined) : undefined}
    >
      {loneChoice ? (
        <Button
          className="board-prompt__use"
          full
          icon={Icons.Sparkles}
          onClick={() => onActivate(loneChoice.instanceId, loneChoice.effectKey)}
        >
          {t("overlay.activateCounter")}
        </Button>
      ) : (
        [...uniqueChoices.values()].map((choice) => (
          <Button
            key={`${choice.instanceId}-${choice.effectKey}`}
            full
            variant="secondary"
            onClick={() => onActivate(choice.instanceId, choice.effectKey)}
          >
            {choiceLabel(choice)}
          </Button>
        ))
      )}
      {cancelsToPick ? (
        <Button className="board-prompt__decline" full variant="secondary" onClick={() => onSelectInstance(undefined)}>
          {t("common.cancel")}
        </Button>
      ) : (
        <Button className="board-prompt__decline" full variant="secondary" onClick={onPass}>
          {t("overlay.passCounterShort")}
        </Button>
      )}
      <DecisionViewBoardButton onOpenBoard={openBoard} />
    </BoardPromptRail>
  );
}
