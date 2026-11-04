import { Popover } from "radix-ui";
import { createPortal } from "react-dom";
import { Icons } from "@/design/icons";
import { RollbackKind, ROLLBACK_CHANNEL } from "@aegis/shared/protocol/RollbackKind";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { AegisRoom } from "@/net/client";
import { useEffect, useId, useState } from "react";
import { Button, Dialog } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/rollbackControls.css";

export function RollbackControls({
  state,
  room,
  seat,
  menu = false,
  compact = false,
}: {
  state: GameState;
  room: AegisRoom;
  seat: number;
  menu?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonClass = menu ? undefined : compact ? "game-mobile-log" : "game-topbar-button";
  useEffect(
    () =>
      room.onMessage(ROLLBACK_CHANNEL, (message: { type?: string }) => {
        if (message.type === "failed") setFailed(true);
      }),
    [room],
  );
  if (!state.allowRollback || state.gameOver || state.turnCount === 0) return null;
  const canUndoAction = state.canUndoAction && state.undoActionSeat === seat;
  const canRollbackTurn = state.canRollbackTurn && state.rollbackTurnSeat === seat;
  const pending = !!state.rollbackRequestId;
  const respond = (accept: boolean) =>
    room.send(ROLLBACK_CHANNEL, {
      type: "respond",
      accept,
      requestId: state.rollbackRequestId,
      revision: state.rollbackRevision,
    });
  const request = (kind: RollbackKind) => {
    setFailed(false);
    setOpen(false);
    room.send(ROLLBACK_CHANNEL, { type: "request", kind, revision: state.rollbackRevision });
  };
  return (
    <>
      {canUndoAction || canRollbackTurn ? (
        <Popover.Root open={open && !pending && !state.rollbackBusy} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={buttonClass}
              onClick={(event) => {
                if (menu) event.stopPropagation();
              }}
              aria-label={t("rollback.controls")}
              title={t("rollback.controls")}
              disabled={pending || state.rollbackBusy}
            >
              <Icons.RotateCcw size={17} />
              {menu ? t("rollback.controls") : null}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="rollback-menu"
              align="end"
              sideOffset={8}
              collisionPadding={12}
              aria-label={t("rollback.controls")}
            >
              <div className="rollback-menu__header">
                <strong>{t("rollback.controls")}</strong>
                <Popover.Close className="rollback-menu__close" aria-label={t("common.close")}>
                  <Icons.X size={16} />
                </Popover.Close>
              </div>
              {canUndoAction ? (
                <button
                  type="button"
                  className="rollback-menu__action"
                  onClick={() => request(RollbackKind.ACTION.value)}
                >
                  <Icons.RotateCcw size={18} />
                  <span>{t("rollback.undo")}</span>
                </button>
              ) : null}
              {canRollbackTurn ? (
                <button
                  type="button"
                  className="rollback-menu__action"
                  onClick={() => request(RollbackKind.TURN.value)}
                >
                  <Icons.Clock size={18} />
                  <span>{t("rollback.turn")}</span>
                </button>
              ) : null}
              <details className="rollback-menu__help">
                <summary>{t("rollback.help")}</summary>
                <p>{t("rollback.optionHint")}</p>
                <p>{t("rollback.turnHint")}</p>
                <p>{t("rollback.hiddenHint")}</p>
              </details>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
      {failed
        ? createPortal(
            <Dialog className="rollback-consent" labelledBy={`${id}-failed`} onClose={() => setFailed(false)}>
              <h2 id={`${id}-failed`}>{t("rollback.controls")}</h2>
              <p role="alert">{t("rollback.failed")}</p>
              <Button onClick={() => setFailed(false)}>{t("common.close")}</Button>
            </Dialog>,
            document.body,
          )
        : null}
      {pending
        ? createPortal(
            <Dialog className="rollback-consent" labelledBy={id} closeOnBackdrop={false} closeOnEscape={false}>
              <h2 id={id}>{t("rollback.controls")}</h2>
              <p>
                {t(
                  state.rollbackRequesterSeat === seat
                    ? "rollback.waiting"
                    : state.rollbackKind === RollbackKind.ACTION.value
                      ? "rollback.requestAction"
                      : "rollback.requestTurn",
                )}
              </p>
              <p>{t("rollback.turnHint")}</p>
              <p>{t("rollback.hiddenHint")}</p>
              {state.rollbackRequesterSeat !== seat ? (
                <div className="rollback-controls__actions">
                  <Button onClick={() => respond(true)}>{t("rollback.accept")}</Button>
                  <Button onClick={() => respond(false)}>{t("rollback.reject")}</Button>
                </div>
              ) : (
                <Button
                  onClick={() =>
                    room.send(ROLLBACK_CHANNEL, {
                      type: "cancel",
                      revision: state.rollbackRevision,
                      requestId: state.rollbackRequestId,
                    })
                  }
                >
                  {t("rollback.cancel")}
                </Button>
              )}
            </Dialog>,
            document.body,
          )
        : null}
      {state.rollbackBusy ? (
        <span className="rollback-status" role="status">
          {t("rollback.restoring")}
        </span>
      ) : null}
    </>
  );
}
