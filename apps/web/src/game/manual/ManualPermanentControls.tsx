import { ManualStatusControls } from "@/game/manual/ManualStatusControls";
import { ManualModifierControls } from "@/game/manual/ManualModifierControls";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { ManualMarkerPreset } from "@/game/manual/ManualMarkerPreset";
import { useId, useState } from "react";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { useTranslation } from "@/i18n/useTranslation";
import { getCardDefinition } from "@aegis/shared/cards/registry";

type Props = {
  permanent: Permanent;
  opponent: PlayerState;
  send: (command: ManualCommand) => void;
  combatActive?: boolean;
  canDeclareAttack?: boolean;
  deckCount?: number;
};

export function ManualPermanentControls({
  permanent,
  opponent,
  send,
  combatActive,
  deckCount,
  canDeclareAttack = true,
}: Props) {
  const { t } = useTranslation();
  const markerListId = useId();
  const [dp, setDp] = useState(String(permanent.currentDP));
  const [marker, setMarker] = useState(permanent.manualMarker ?? "");
  const [target, setTarget] = useState("");
  const definition = getCardDefinition(permanent.topCard.cardId);
  const modifiersKey = JSON.stringify([
    permanent.securityAttackModifier,
    Array.from(permanent.keywords),
    Array.from(permanent.originalColorsOverride),
  ]);
  return (
    <section className="manual-table__group manual-table__permanent" aria-label={t("manual.permanent")}>
      <header className="manual-table__card-heading">
        <span>{t("manual.permanent")}</span>
        <strong>{getCardDefinition(permanent.topCard.cardId)?.nameEn ?? permanent.topCard.cardId}</strong>
      </header>
      <div className="manual-table__dp-adjust">
        <button
          type="button"
          aria-label={t("manual.decreaseDp")}
          disabled={permanent.currentDP < -998999}
          onClick={() =>
            send({
              action: ManualAction.DP.value,
              permanentId: permanent.permanentId,
              value: permanent.currentDP - 1000,
            })
          }
        >
          −1.000
        </button>
        <output aria-label={t("manual.currentDp")}>
          {permanent.currentDP.toLocaleString()}
          <span>DP</span>
        </output>
        <button
          type="button"
          aria-label={t("manual.increaseDp")}
          disabled={permanent.currentDP > 998999}
          onClick={() =>
            send({
              action: ManualAction.DP.value,
              permanentId: permanent.permanentId,
              value: permanent.currentDP + 1000,
            })
          }
        >
          +1.000
        </button>
      </div>
      <button
        type="button"
        onClick={() =>
          send({
            action: ManualAction.SUSPEND.value,
            permanentId: permanent.permanentId,
            suspended: !permanent.isSuspended,
          })
        }
      >
        {t(permanent.isSuspended ? "manual.unsuspend" : "manual.suspend")}
      </button>
      <label>
        DP
        <input type="number" min={-999999} max={999999} value={dp} onChange={(event) => setDp(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => send({ action: ManualAction.DP.value, permanentId: permanent.permanentId, value: Number(dp) })}
      >
        {t("manual.setDp")}
      </button>
      <label>
        {t("manual.marker")}
        <input
          list={markerListId}
          autoComplete="off"
          aria-describedby={`${markerListId}-hint`}
          placeholder={t("manual.markerExample")}
          maxLength={120}
          value={marker}
          onChange={(event) => setMarker(event.target.value)}
        />
      </label>
      <datalist id={markerListId}>
        {Object.values(ManualMarkerPreset).map((entry) => (
          <option key={entry.value} value={t(entry.label)} />
        ))}
      </datalist>
      <span className="manual-table__marker-hint" id={`${markerListId}-hint`}>
        {t("manual.markerHint")}
      </span>
      <button
        type="button"
        onClick={() => send({ action: ManualAction.MARKER.value, permanentId: permanent.permanentId, text: marker })}
      >
        {t("manual.setMarker")}
      </button>
      {permanent.manualMarker ? <p>{permanent.manualMarker}</p> : null}
      <ManualStatusControls permanent={permanent} send={send} />
      <ManualModifierControls key={modifiersKey} permanent={permanent} send={send} />
      <button
        type="button"
        onClick={() => send({ action: ManualAction.RESET_MODIFIERS.value, permanentId: permanent.permanentId })}
      >
        {t("manual.features.resetModifiers")}
      </button>
      {!permanent.inBreeding ? (
        <button
          type="button"
          disabled={!deckCount}
          onClick={() => send({ action: ManualAction.TRAINING.value, permanentId: permanent.permanentId })}
        >
          {t("manual.features.training")}
        </button>
      ) : null}
      {definition?.isToken ? (
        <button
          type="button"
          disabled={permanent.stack.length > 0 || permanent.linked.length > 0}
          title={
            permanent.stack.length > 0 || permanent.linked.length > 0 ? t("manual.features.tokenAttached") : undefined
          }
          onClick={() => send({ action: ManualAction.REMOVE_TOKEN.value, permanentId: permanent.permanentId })}
        >
          {t("manual.features.removeToken")}
        </button>
      ) : null}
      <label>
        {t("manual.target")}
        <select aria-label={t("manual.target")} value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t("manual.opponent")}</option>
          {opponent.battleArea.map((candidate) => (
            <option key={candidate.permanentId} value={candidate.permanentId}>
              {getCardDefinition(candidate.topCard.cardId)?.nameEn}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!canDeclareAttack || combatActive || permanent.inBreeding || permanent.topCard.faceUp === false}
        onClick={() =>
          send({
            action: ManualAction.ATTACK.value,
            permanentId: permanent.permanentId,
            targetPermanentId: target || undefined,
          })
        }
      >
        {t("manual.attack")}
      </button>
      {(["source", "link"] as const).map((part) => {
        const cards = Array.from(part === "source" ? permanent.stack : permanent.linked);
        return cards.length > 1 ? (
          <div key={part}>
            <span>{t(`manual.${part}`)}</span>
            <ol>
              {cards.map((card, index) => (
                <li key={card.instanceId}>
                  {getCardDefinition(card.cardId)?.nameEn}
                  <button
                    type="button"
                    aria-label={t("manual.moveUp")}
                    disabled={index === 0}
                    onClick={() => {
                      const order = cards.map((entry) => entry.instanceId);
                      [order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
                      send({
                        action: ManualAction.REORDER.value,
                        permanentId: permanent.permanentId,
                        part,
                        instanceIds: order,
                      });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("manual.moveDown")}
                    disabled={index === cards.length - 1}
                    onClick={() => {
                      const order = cards.map((entry) => entry.instanceId);
                      [order[index], order[index + 1]] = [order[index + 1]!, order[index]!];
                      send({
                        action: ManualAction.REORDER.value,
                        permanentId: permanent.permanentId,
                        part,
                        instanceIds: order,
                      });
                    }}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null;
      })}
    </section>
  );
}
