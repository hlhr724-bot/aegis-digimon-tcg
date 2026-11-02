import { useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand, ManualLocation } from "@aegis/shared/manual/ManualCommand";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Zone, type Seat } from "@aegis/shared/schema/enums";
import "@/game/manual/manualSignals.css";

type Props = {
  state: GameState;
  seat: Seat;
  send: (command: ManualCommand) => void;
  spectating?: boolean;
  disabled?: boolean;
};
type Source = { key: string; cardId: string; from: ManualLocation; zone: Zone };

export function ManualSignalControls({ state, seat, send, spectating, disabled }: Props) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const player = state.players[seat];
  const sources: Source[] = [];
  for (const card of player?.hand ?? []) {
    sources.push({
      key: card.instanceId,
      cardId: card.cardId,
      zone: Zone.Hand,
      from: { zone: Zone.Hand, instanceId: card.instanceId },
    });
  }
  for (const permanent of [...(player?.battleArea ?? []), ...(player?.breeding ? [player.breeding] : [])]) {
    if (!permanent.topCard.faceUp) {
      continue;
    }
    const zone = permanent.inBreeding ? Zone.Breeding : Zone.BattleArea;
    sources.push({
      key: permanent.permanentId,
      cardId: permanent.topCard.cardId,
      zone,
      from: { zone, permanentId: permanent.permanentId },
    });
  }
  const source = sources.find((entry) => entry.key === sourceId);
  const targets = Array.from(state.players).flatMap((entry) =>
    [...entry.battleArea, ...(entry.breeding ? [entry.breeding] : [])]
      .filter((permanent) => permanent.topCard.faceUp)
      .map((permanent) => ({ permanent, player: entry })),
  );
  const table = state.manual;
  const target = targets.find((entry) => entry.permanent.permanentId === table.signalTargetPermanentId);
  let targetName = target ? getCardName(target.permanent.topCard.cardId) : t("manual.combat.missingCard");
  if (table.signalTargetSeat !== -1) {
    targetName = state.players[table.signalTargetSeat]?.displayName ?? "";
  }
  const active = table.signalSeat !== -1;
  const declareSignal = () => {
    if (!source) {
      return;
    }
    if (targetId.startsWith("seat:")) {
      send({ action: ManualAction.SIGNAL.value, from: source.from, targetSeat: Number(targetId.slice(5)) as Seat });
    } else {
      send({ action: ManualAction.SIGNAL.value, from: source.from, targetPermanentId: targetId || undefined });
    }
  };
  return (
    <section className="manual-signals" aria-label={t("manual.signal.title")}>
      {active ? (
        <div className="manual-signals__current" role="status">
          <span>{t("manual.signal.activating", { player: state.players[table.signalSeat]?.displayName ?? "" })}</span>
          <strong>{getCardName(table.signalCardId)}</strong>
          {table.signalTargetPermanentId || table.signalTargetSeat !== -1 ? (
            <p>
              <span aria-hidden="true">→ </span>
              {targetName}
            </p>
          ) : null}
          {!spectating && table.signalSeat === seat ? (
            <button type="button" disabled={disabled} onClick={() => send({ action: ManualAction.CLEAR_SIGNAL.value })}>
              {t("manual.signal.clear")}
            </button>
          ) : null}
        </div>
      ) : null}
      {!spectating ? (
        <div className="manual-signals__form">
          <label>
            {t("manual.signal.source")}
            <select
              aria-label={t("manual.signal.source")}
              value={source?.key ?? ""}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">{t("manual.chooseCard")}</option>
              {sources.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {t(`manual.zone.${entry.zone}`)} · {getCardName(entry.cardId)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("manual.signal.target")}
            <select
              aria-label={t("manual.signal.target")}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">{t("manual.signal.noTarget")}</option>
              {state.players.map((entry) => (
                <option key={entry.seat} value={`seat:${entry.seat}`}>
                  {entry.displayName}
                </option>
              ))}
              {targets.map(({ permanent, player: owner }) => (
                <option key={permanent.permanentId} value={permanent.permanentId}>
                  {owner.displayName} · {getCardName(permanent.topCard.cardId)}
                </option>
              ))}
            </select>
          </label>
          <p className="manual-table__hint">{t("manual.signal.hint")}</p>
          <button type="button" disabled={disabled || !source} onClick={declareSignal}>
            {t("manual.signal.declare")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
