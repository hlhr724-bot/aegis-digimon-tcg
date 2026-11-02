import { ManualQuickActions } from "@/game/manual/ManualQuickActions";
import "@/game/manual/manualFeatures.css";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { CardMini } from "@/design/cards";
import { useState } from "react";
import type { ManualCommand, ManualDestination } from "@aegis/shared/manual/ManualCommand";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";
import { Zone } from "@aegis/shared/schema/enums";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getManualSources } from "@/game/manual/getManualSources";
import { ManualPermanentControls } from "@/game/manual/ManualPermanentControls";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  player: PlayerState;
  opponent: PlayerState;
  send: (command: ManualCommand) => void;
  combatActive?: boolean;
  canDeclareAttack?: boolean;
  selectedHand?: string | null;
  selectedPermanent?: string | null;
};

export function ManualCardControls({
  player,
  opponent,
  send,
  selectedHand,
  selectedPermanent,
  combatActive,
  canDeclareAttack,
}: Props) {
  const { t } = useTranslation();
  const sources = getManualSources({ player, t });
  let chosen = selectedHand ?? undefined;
  if (!chosen && selectedPermanent) {
    chosen = sources.find((source) => source.permanent?.permanentId === selectedPermanent)?.key;
  }
  const [selected, setSelected] = useState(chosen ?? "");
  const [destination, setDestination] = useState<string>(Zone.BattleArea);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [wholePile, setWholePile] = useState(false);
  const [previousChosen, setPreviousChosen] = useState(chosen);
  if (chosen !== previousChosen) {
    setPreviousChosen(chosen);
    if (chosen) {
      setSelected(chosen);
    }
  }
  const source = sources.find((entry) => entry.key === selected);
  const destinations: { key: string; label: string; to: ManualDestination }[] = Object.values(Zone).map((zone) => ({
    key: zone,
    label: t(`manual.zone.${zone}`),
    to: { zone },
  }));
  for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
    for (const part of ["top", "source", "link"] as const) {
      destinations.push({
        key: `${permanent.permanentId}:${part}`,
        label: `${getCardDefinition(permanent.topCard.cardId)?.nameEn} · ${t(`manual.${part}`)}`,
        to: { zone: permanent.inBreeding ? Zone.Breeding : Zone.BattleArea, permanentId: permanent.permanentId, part },
      });
    }
  }
  const to = destinations.find((entry) => entry.key === destination)?.to;
  return (
    <section className="manual-table__group">
      <label>
        {t("manual.card")}
        <select
          aria-label={t("manual.card")}
          value={source?.key ?? ""}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t("manual.chooseCard")}</option>
          {sources.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {source ? (
        <>
          {source.permanent ? (
            <ManualPermanentControls
              key={`${source.permanent.permanentId}:${source.permanent.currentDP}:${source.permanent.manualMarker}`}
              deckCount={player.deckCount}
              canDeclareAttack={canDeclareAttack}
              combatActive={combatActive}
              permanent={source.permanent}
              opponent={opponent}
              send={send}
            />
          ) : null}
          {source.from.instanceId
            ? (() => {
                const inspected: { instanceId: string; cardId: string; artId: string }[] = JSON.parse(
                  player.manualInspectionJson || "[]",
                );
                const card = [
                  ...player.hand,
                  ...player.trash,
                  ...inspected,
                  ...Array.from(player.battleArea).flatMap((entry) => [entry.topCard, ...entry.stack, ...entry.linked]),
                  ...(player.breeding
                    ? [player.breeding.topCard, ...player.breeding.stack, ...player.breeding.linked]
                    : []),
                ].find((entry) => entry.instanceId === source.from.instanceId);
                return card ? <CardMini cardId={card.cardId} artId={card.artId} width={64} /> : null;
              })()
            : null}
          <ManualQuickActions source={source} send={send} />
          <label>
            {t("manual.destination")}
            <select
              aria-label={t("manual.destination")}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              {destinations.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("manual.position")}
            <select
              aria-label={t("manual.position")}
              value={position}
              onChange={(event) => setPosition(event.target.value as "top" | "bottom")}
            >
              <option value="top">{t("manual.top")}</option>
              <option value="bottom">{t("manual.bottom")}</option>
            </select>
          </label>
          {source.permanent && source.from.part === "top" ? (
            <label className="manual-table__check">
              <input type="checkbox" checked={wholePile} onChange={(event) => setWholePile(event.target.checked)} />
              {t("manual.wholePile")}
            </label>
          ) : null}
          <button
            type="button"
            className="manual-table__primary"
            disabled={!to}
            onClick={() => {
              if (to) {
                send({
                  action: ManualAction.MOVE.value,
                  from: source.from,
                  to: { ...to, position },
                  wholePile: source.from.part === "top" && wholePile,
                });
              }
            }}
          >
            {t("manual.move")}
          </button>
          {[Zone.Security, Zone.Delay, Zone.BattleArea, Zone.Breeding].includes(source.from.zone) ? (
            <div className="manual-features__row">
              <button
                type="button"
                onClick={() => send({ action: ManualAction.FLIP.value, from: source.from, faceUp: true })}
              >
                {t("manual.features.faceUp")}
              </button>
              <button
                type="button"
                onClick={() => send({ action: ManualAction.FLIP.value, from: source.from, faceUp: false })}
              >
                {t("manual.features.faceDown")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
