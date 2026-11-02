import { useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import "@/game/manual/manualCombat.css";

type Props = {
  state: GameState;
  seat: Seat;
  send: (command: ManualCommand) => void;
  spectating?: boolean;
  compact?: boolean;
};

const phases = Object.values(Phase).filter((phase) => phase !== Phase.None);
const stages = Object.values(ManualCombatStage).filter((entry) => entry.value !== ManualCombatStage.NONE.value);

export function ManualCombatControls({ state, seat, send, spectating, compact }: Props) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const [blockerId, setBlockerId] = useState("");
  const table = state.manual;
  const turnPhase = table.turnPhase === Phase.None ? Phase.Main : table.turnPhase;
  const stage = table.combatStage;
  const active = stage !== ManualCombatStage.NONE.value;
  const attacker = state.players.find((player) => player.seat === table.attackerSeat);
  const defender = state.players.find((player) => player.seat !== table.attackerSeat);
  const attackerCard = attacker?.battleArea.find((permanent) => permanent.permanentId === table.attackerPermanentId);
  const targetCard = defender?.battleArea.find((permanent) => permanent.permanentId === table.attackTargetPermanentId);
  const blockerCard = defender?.battleArea.find((permanent) => permanent.permanentId === table.blockerPermanentId);
  const selectedBlocker = defender?.battleArea.find((permanent) => permanent.permanentId === blockerId);
  const defendingStage = stage === ManualCombatStage.COUNTER.value || stage === ManualCombatStage.BLOCK.value;
  const actor = defendingStage ? defender : attacker;
  const canAct = !spectating && actor?.seat === seat;
  const disabled =
    state.gameOver ||
    state.turnCount === 0 ||
    table.undoRequester !== -1 ||
    table.resultRequester !== -1 ||
    table.restartRequester !== -1;
  let targetName = t("manual.combat.player");
  if (table.attackTargetPermanentId) {
    targetName = targetCard ? getCardName(targetCard.topCard.cardId) : t("manual.combat.missingCard");
  }
  const stageIndex = stages.findIndex((entry) => entry.value === stage);
  const nextStage = stages[stageIndex + 1]?.value;
  const canAdvance =
    nextStage &&
    !(nextStage === ManualCombatStage.SECURITY.value && (table.attackTargetPermanentId || table.blockerPermanentId));
  const advance = () => {
    if (nextStage) {
      send({ action: ManualAction.COMBAT.value, stage: nextStage });
    }
  };
  if (compact && !active) {
    return null;
  }
  return (
    <section className="manual-combat" aria-label={t("manual.combat.title")}>
      {!compact ? (
        <section className="manual-combat__phases" aria-label={t("manual.combat.phase")}>
          <p className="manual-combat__hint" role="status">
            {t("manual.turn.currentPhase", {
              phase: t(`manual.combat.phase.${turnPhase}`),
              player: state.players[state.turnSeat]?.displayName ?? "",
            })}
          </p>
          <ol className="manual-combat__progress" aria-label={t("manual.combat.phase")}>
            {phases.map((phase, index) => (
              <li
                key={phase}
                aria-current={table.turnPhase === phase ? "step" : undefined}
                data-complete={index < phases.indexOf(turnPhase)}
              >
                <span aria-hidden="true">{index + 1}</span>
                {t(`manual.combat.phase.${phase}`)}
              </li>
            ))}
          </ol>
          <p className="manual-combat__hint">{t("manual.turn.automatic")}</p>
        </section>
      ) : null}
      {active ? (
        <>
          <ol className="manual-combat__progress" aria-label={t("manual.combat.title")}>
            {stages.map((entry, index) => (
              <li
                key={entry.value}
                aria-current={stage === entry.value ? "step" : undefined}
                data-complete={index < stageIndex}
              >
                <span aria-hidden="true">{index + 1}</span>
                {t(`manual.combat.stage.${entry.value}`)}
              </li>
            ))}
          </ol>
          <dl className="manual-combat__cards">
            <div>
              <dt>{t("manual.combat.attacker")}</dt>
              <dd>{attackerCard ? getCardName(attackerCard.topCard.cardId) : t("manual.combat.missingCard")}</dd>
              <dd className="manual-combat__owner">{attacker?.displayName}</dd>
            </div>
            <div>
              <dt>{t("manual.combat.target")}</dt>
              <dd>{targetName}</dd>
              <dd className="manual-combat__owner">{defender?.displayName}</dd>
            </div>
            {blockerCard ? (
              <div>
                <dt>{t("manual.combat.blocker")}</dt>
                <dd>{getCardName(blockerCard.topCard.cardId)}</dd>
              </div>
            ) : null}
          </dl>
          {stage === ManualCombatStage.SECURITY.value ? (
            <p className="manual-combat__hint">{t("manual.combat.securityHint")}</p>
          ) : null}
          {!compact && !spectating ? (
            <fieldset className="manual-combat__actions" disabled={disabled}>
              <legend className="manual-table__sr-only">{t("manual.combat.title")}</legend>
              {canAct && stage === ManualCombatStage.BLOCK.value ? (
                <>
                  <label>
                    {t("manual.combat.blocker")}
                    <select
                      aria-label={t("manual.combat.blocker")}
                      value={selectedBlocker?.permanentId ?? ""}
                      onChange={(event) => setBlockerId(event.target.value)}
                    >
                      <option value="">{t("manual.combat.chooseBlocker")}</option>
                      {defender?.battleArea.map((permanent) => (
                        <option key={permanent.permanentId} value={permanent.permanentId}>
                          {getCardName(permanent.topCard.cardId)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!selectedBlocker}
                    onClick={() =>
                      send({
                        action: ManualAction.COMBAT.value,
                        stage: ManualCombatStage.RESOLUTION.value,
                        blockerPermanentId: selectedBlocker?.permanentId,
                      })
                    }
                  >
                    {t("manual.combat.confirmBlock")}
                  </button>
                  <button type="button" onClick={advance}>
                    {t("manual.combat.skipBlock")}
                  </button>
                </>
              ) : null}
              {canAct && canAdvance && stage !== ManualCombatStage.BLOCK.value ? (
                <button type="button" className="manual-table__primary" onClick={advance}>
                  {t("manual.combat.continue")}
                </button>
              ) : null}
              {!canAct && stage !== ManualCombatStage.SECURITY.value ? (
                <p className="manual-combat__waiting" role="status">
                  {t("manual.combat.waiting", { player: actor?.displayName ?? "" })}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => send({ action: ManualAction.COMBAT.value, stage: ManualCombatStage.NONE.value })}
              >
                {t(
                  stage === ManualCombatStage.RESOLUTION.value || stage === ManualCombatStage.SECURITY.value
                    ? "manual.combat.finish"
                    : "manual.combat.cancel",
                )}
              </button>
            </fieldset>
          ) : null}
        </>
      ) : (
        <p className="manual-combat__hint">{t("manual.combat.idle")}</p>
      )}
      {!compact ? <p className="manual-combat__hint">{t("manual.combat.manualHint")}</p> : null}
    </section>
  );
}
