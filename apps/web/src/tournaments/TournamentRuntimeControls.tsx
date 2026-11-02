import { useId, useRef, useState } from "react";
import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { isTournamentRoundStartMode } from "@aegis/shared/tournaments/isTournamentRoundStartMode";
import { Alert, Button, Field, Panel } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiResult } from "@/tournaments/client";
import type { TournamentDetail } from "@/tournaments/types";

type Props = { detail: TournamentDetail; onChanged: () => void };

export function TournamentRuntimeControls({ detail, onChanged }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const cancellation = useRef<{ reason: string; commandId: string } | undefined>(undefined);
  const mode = detail.roundStartMode ?? TournamentRoundStartMode.AUTOMATIC.value;
  const manual = mode === TournamentRoundStartMode.MANUAL.value;
  const openRound = detail.matches.some((match) => match.status === "pending");

  async function run(action: () => Promise<ApiResult<unknown>>) {
    setBusy(true);
    setFailed(false);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setConfirming(false);
    onChanged();
  }

  async function cancelTournament() {
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    if (cancellation.current?.reason !== trimmed) {
      cancellation.current = { reason: trimmed, commandId: crypto.randomUUID() };
    }
    const commandId = cancellation.current.commandId;
    await run(() => tournamentApi.cancel(detail.id, trimmed, commandId));
  }

  if (detail.status === "finished" || detail.status === "cancelled") {
    return null;
  }

  return (
    <Panel className="tournaments-organizer">
      <h3>{t("tournaments.controls.title")}</h3>
      <div className="aegis-field">
        <label className="aegis-field__label" htmlFor={`${id}-mode`}>
          {t("tournaments.controls.mode")}
        </label>
        <select
          id={`${id}-mode`}
          className="aegis-field__control"
          value={mode}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value;
            if (isTournamentRoundStartMode(value)) {
              void run(() => tournamentApi.setRoundStartMode(detail.id, value));
            }
          }}
        >
          {Object.values(TournamentRoundStartMode).map((entry) => (
            <option key={entry.name} value={entry.value}>
              {t(`tournaments.controls.${entry.value}`)}
            </option>
          ))}
        </select>
        <p className="tournaments-note">
          {t(manual ? "tournaments.controls.manualHelp" : "tournaments.controls.automaticHelp")}
        </p>
      </div>
      {manual && detail.status === "running" ? (
        <Button disabled={busy || openRound} onClick={() => void run(() => tournamentApi.startNextRound(detail.id))}>
          {t("tournaments.controls.startRound")}
        </Button>
      ) : null}
      {confirming ? (
        <div className="tournaments-organizer__danger">
          <p>{t("tournaments.controls.cancelConfirm")}</p>
          <Field
            label={t("tournaments.controls.reason")}
            value={reason}
            disabled={busy}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="tournaments-detail__actions">
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancelTournament()}>
              {t("tournaments.controls.cancelYes")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
          {t("tournaments.controls.cancel")}
        </Button>
      )}
      {failed ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t("tournaments.controls.failed")}
        </Alert>
      ) : null}
    </Panel>
  );
}
