import { ManualRestartControls } from "@/game/manual/ManualRestartControls";
import { ManualSignalControls } from "@/game/manual/ManualSignalControls";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { ManualTableTools } from "@/game/manual/ManualTableTools";
import { ManualCombatControls } from "@/game/manual/ManualCombatControls";
import { useManualPanelDrag } from "@/game/manual/useManualPanelDrag";
import { ManualPanel } from "@/game/manual/ManualPanel";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import { useState } from "react";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Phase, Zone, type Seat } from "@aegis/shared/schema/enums";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { GameMode } from "@aegis/shared/manual/GameMode";
import type { AegisRoom } from "@/net/client";
import { sendManualCommand } from "@/game/manual/sendManualCommand";
import { ManualCardControls } from "@/game/manual/ManualCardControls";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/manual/manualTable.css";

type Props = {
  state: GameState;
  room?: AegisRoom;
  seat: Seat;
  selectedHand?: string | null;
  selectedPermanent?: string | null;
  spectating?: boolean;
  presenting?: boolean;
};

export function ManualControls({ state, room, seat, selectedHand, selectedPermanent, spectating, presenting }: Props) {
  const { t } = useTranslation();
  const drag = useManualPanelDrag({ enabled: state.gameMode === GameMode.MANUAL.value });
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<ManualPanel>(ManualPanel.CARDS.value);
  const selectionKey = selectedHand ?? selectedPermanent;
  const [lastSelection, setLastSelection] = useState(selectionKey);
  if (selectionKey !== lastSelection) {
    setLastSelection(selectionKey);
    if (selectionKey) {
      setOpen(true);
      setPanel(ManualPanel.CARDS.value);
    }
  }
  const [count, setCount] = useState(1);
  const [pile, setPile] = useState<Zone.Deck | Zone.EggDeck | Zone.Security>(Zone.Deck);
  const [memory, setMemory] = useState(state.memory);
  const [winner, setWinner] = useState<Seat | -1>(seat);
  if (state.gameMode !== GameMode.MANUAL.value) {
    return null;
  }
  const table = state.manual;
  const combatActive = table.combatStage !== ManualCombatStage.NONE.value;
  const player = state.players[seat];
  const opponent = state.players[1 - seat];
  const send = (command: ManualCommand) => {
    if (room) {
      sendManualCommand({ room, command });
    }
  };
  const blocked =
    !room ||
    spectating ||
    state.gameOver ||
    state.turnCount === 0 ||
    table.undoRequester !== -1 ||
    table.resultRequester !== -1 ||
    table.restartRequester !== -1;
  const pending = table.undoRequester !== -1 || table.resultRequester !== -1 || table.restartRequester !== -1;
  const expanded = open || pending;
  return (
    <aside ref={drag.ref} style={drag.style} className="manual-table" data-testid="manual-table">
      <div className="manual-table__header">
        <button
          type="button"
          className="manual-table__drag"
          aria-label={t("manual.dragPanel")}
          title={t("manual.dragHelp")}
          {...drag.handleProps}
        >
          <span className="manual-table__grip" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </button>
        <button
          type="button"
          className="manual-table__toggle"
          aria-expanded={expanded}
          aria-controls="manual-table-controls"
          onClick={() => setOpen(!open)}
        >
          <span>{t("manual.title")}</span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </div>
      {expanded ? (
        <div id="manual-table-controls" className="manual-table__body">
          <nav className="manual-table__nav" aria-label={t("manual.actions")}>
            {Object.values(ManualPanel).map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={panel === entry.value}
                onClick={() => setPanel(entry.value)}
              >
                {t(entry.label)}
              </button>
            ))}
          </nav>
          <div className="manual-table__content">
            <ManualRestartControls
              state={state}
              seat={seat}
              send={send}
              spectating={spectating}
              disabled={!room}
              pendingOnly
            />
            {table.undoRequester !== -1 ? (
              <section className="manual-table__notice" role="status">
                <p>{t("manual.undoPending")}</p>
                {!spectating && table.undoRequester !== seat ? (
                  <>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.ANSWER_UNDO.value, accept: true })}
                    >
                      {t("manual.accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.ANSWER_UNDO.value, accept: false })}
                    >
                      {t("manual.decline")}
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}
            {table.resultRequester !== -1 ? (
              <section className="manual-table__notice" role="status">
                <p>
                  {t("manual.resultPending")}{" "}
                  {table.proposedWinner === -1
                    ? t("manual.drawResult")
                    : state.players[table.proposedWinner]?.displayName}
                </p>
                {!spectating && table.resultRequester !== seat ? (
                  <>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.ANSWER_RESULT.value, accept: true })}
                    >
                      {t("manual.accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.ANSWER_RESULT.value, accept: false })}
                    >
                      {t("manual.decline")}
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}
            {!spectating && player && opponent ? (
              <fieldset disabled={blocked}>
                <legend className="manual-table__sr-only">{t("manual.actions")}</legend>
                <section className="manual-table__quick">
                  <label>
                    {t("manual.count")}
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="manual-table__primary"
                    onClick={() => send({ action: ManualAction.DRAW.value, count })}
                  >
                    {t("manual.draw")}
                  </button>
                </section>
                <section hidden={panel !== ManualPanel.PILES.value}>
                  <div className="manual-table__group">
                    <label>
                      {t("manual.pile")}
                      <select
                        aria-label={t("manual.pile")}
                        value={pile}
                        onChange={(event) => setPile(event.target.value as typeof pile)}
                      >
                        {[Zone.Deck, Zone.EggDeck, Zone.Security].map((zone) => (
                          <option key={zone} value={zone}>
                            {t(`manual.zone.${zone}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={() => send({ action: ManualAction.SHUFFLE.value, zone: pile })}>
                      {t("manual.shuffle")}
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.INSPECT.value, zone: pile, count })}
                    >
                      {t("manual.inspect")}
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ action: ManualAction.INSPECT.value, zone: pile, count: 55 })}
                    >
                      {t("manual.search")}
                    </button>
                    <button type="button" onClick={() => send({ action: ManualAction.CLOSE_INSPECTION.value })}>
                      {t("manual.closeInspection")}
                    </button>
                  </div>
                  <div className="manual-table__shortcuts">
                    <button
                      type="button"
                      disabled={player.deckCount === 0}
                      onClick={() => send({ action: ManualAction.REVEAL.value, from: { zone: Zone.Deck, index: 0 } })}
                    >
                      {t("manual.revealTop")}
                    </button>
                    <button
                      type="button"
                      disabled={player.deckCount === 0}
                      onClick={() =>
                        send({
                          action: ManualAction.MOVE.value,
                          from: { zone: Zone.Deck, index: 0 },
                          to: { zone: Zone.Trash },
                          wholePile: false,
                        })
                      }
                    >
                      {t("manual.trashTop")}
                    </button>
                    <button
                      type="button"
                      disabled={player.deckCount === 0}
                      onClick={() =>
                        send({
                          action: ManualAction.MOVE.value,
                          from: { zone: Zone.Deck, index: 0 },
                          to: { zone: Zone.Security, position: "top" },
                          wholePile: false,
                        })
                      }
                    >
                      {t("manual.recover")}
                    </button>
                    <button
                      type="button"
                      disabled={player.securityCount === 0}
                      onClick={() =>
                        send({ action: ManualAction.REVEAL.value, from: { zone: Zone.Security, index: 0 } })
                      }
                    >
                      {t("manual.checkSecurity")}
                    </button>
                  </div>
                  <ManualTableTools state={state} seat={seat} send={send} />
                </section>
                <section hidden={panel !== ManualPanel.CARDS.value}>
                  <ManualCardControls
                    player={player}
                    opponent={opponent}
                    send={send}
                    combatActive={combatActive}
                    canDeclareAttack={!presenting && state.turnSeat === seat && table.turnPhase === Phase.Main}
                    selectedHand={selectedHand}
                    selectedPermanent={selectedPermanent}
                  />
                </section>
                <section hidden={panel !== ManualPanel.TURN.value} className="manual-table__group">
                  <output className="manual-table__memory">
                    {state.memory > 0 ? "+" : ""}
                    {state.memory}
                    <span>{state.players[state.turnSeat]?.displayName}</span>
                  </output>
                  <label>
                    {t("manual.memory")}
                    <input
                      type="number"
                      min={-10}
                      max={10}
                      value={memory}
                      onChange={(event) => setMemory(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={() => send({ action: ManualAction.MEMORY.value, value: memory })}>
                    {t("manual.setMemory")}
                  </button>
                  <button type="button" onClick={() => send({ action: ManualAction.UNSUSPEND_ALL.value })}>
                    {t("manual.unsuspendAll")}
                  </button>
                  <button
                    type="button"
                    disabled={presenting || state.turnSeat !== seat || combatActive || table.turnPhase !== Phase.Main}
                    onClick={() => send({ action: ManualAction.PASS.value })}
                  >
                    {t("manual.pass")}
                  </button>
                  <ManualCombatControls state={state} seat={seat} send={send} spectating={spectating} />
                  <ManualSignalControls
                    state={state}
                    seat={seat}
                    send={send}
                    spectating={spectating}
                    disabled={blocked}
                  />
                </section>
                <section className="manual-table__footer">
                  <button
                    type="button"
                    disabled={!table.canUndo}
                    onClick={() => send({ action: ManualAction.REQUEST_UNDO.value })}
                  >
                    {t("manual.undo")}
                  </button>
                </section>
                <section hidden={panel !== ManualPanel.MATCH.value} className="manual-table__group">
                  <ManualRestartControls
                    state={state}
                    seat={seat}
                    send={send}
                    spectating={spectating}
                    disabled={blocked}
                    requestOnly
                  />
                  <label>
                    {t("manual.winner")}
                    <select
                      aria-label={t("manual.winner")}
                      value={winner}
                      onChange={(event) => setWinner(Number(event.target.value) as Seat | -1)}
                    >
                      <option value={-1}>{t("manual.drawResult")}</option>
                      {state.players.map((entry) => (
                        <option key={entry.seat} value={entry.seat}>
                          {entry.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => send({ action: ManualAction.PROPOSE_RESULT.value, winnerSeat: winner })}
                  >
                    {t("manual.proposeResult")}
                  </button>
                </section>
              </fieldset>
            ) : null}
            <div hidden={panel !== ManualPanel.MATCH.value}>
              <p className="manual-table__hint">{t("manual.hint")}</p>
              <details>
                <summary>{t("manual.history")}</summary>
                <ol className="manual-table__history">
                  {Array.from(table.history).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
