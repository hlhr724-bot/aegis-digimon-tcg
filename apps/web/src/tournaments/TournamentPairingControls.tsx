import { useId, useRef, useState } from "react";
import { Alert, Button, Field, Panel } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { reasonKey } from "@/tournaments/labels";
import type { TournamentDetail } from "@/tournaments/types";

type Props = { detail: TournamentDetail; onChanged: () => void };
type SeatOption = { value: string; matchId: string; seat: 0 | 1; label: string };

export function TournamentPairingControls({ detail, onChanged }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const command = useRef<{ key: string; id: string } | undefined>(undefined);
  const options: SeatOption[] = detail.matches
    .filter((match) => match.status === "pending")
    .flatMap((match) => {
      return ([0, 1] as const).flatMap((seat) => {
        const accountId = seat === 0 ? match.player0AccountId : match.player1AccountId;
        if (!accountId) {
          return [];
        }
        const player = detail.participants.find((participant) => participant.accountId === accountId);
        return [
          {
            value: `${match.id}:${seat}`,
            matchId: match.id,
            seat,
            label: `${player?.displayName ?? accountId} · ${t("tournaments.pairings.table", { round: match.round, table: match.position + 1 })}`,
          },
        ];
      });
    });
  const firstOption = options.find((option) => option.value === first);
  const secondOption = options.find((option) => option.value === second);

  async function swapPairings() {
    if (!firstOption || !secondOption || firstOption.matchId === secondOption.matchId || !reason.trim()) {
      return;
    }
    const key = JSON.stringify([first, second, reason.trim()]);
    if (command.current?.key !== key) {
      command.current = { key, id: crypto.randomUUID() };
    }
    setBusy(true);
    setError(undefined);
    const result = await tournamentApi.swapPairings(detail.id, {
      firstMatchId: firstOption.matchId,
      firstSeat: firstOption.seat,
      secondMatchId: secondOption.matchId,
      secondSeat: secondOption.seat,
      reason: reason.trim(),
      commandId: command.current.id,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFirst("");
    setSecond("");
    setReason("");
    command.current = undefined;
    onChanged();
  }

  return (
    <Panel className="tournaments-pairing">
      <h3>{t("tournaments.pairings.title")}</h3>
      <p className="tournaments-note">{t("tournaments.pairings.description")}</p>
      <div className="tournaments-organizer__fields">
        {([0, 1] as const).map((index) => (
          <div className="aegis-field" key={index}>
            <label className="aegis-field__label" htmlFor={`${id}-${index}`}>
              {t(index === 0 ? "tournaments.pairings.first" : "tournaments.pairings.second")}
            </label>
            <select
              id={`${id}-${index}`}
              className="aegis-field__control"
              value={index === 0 ? first : second}
              disabled={busy}
              onChange={(event) => (index === 0 ? setFirst(event.target.value) : setSecond(event.target.value))}
            >
              <option value="">{t("tournaments.pairings.choose")}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <Field
        label={t("tournaments.pairings.reason")}
        value={reason}
        disabled={busy}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        className="tournaments-pairing__submit"
        disabled={
          busy || !firstOption || !secondOption || firstOption.matchId === secondOption.matchId || !reason.trim()
        }
        onClick={() => void swapPairings()}
      >
        {t("tournaments.pairings.swap")}
      </Button>
      {error ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t(reasonKey(error.code) ?? "tournaments.reason.unknown", { code: error.code })}
        </Alert>
      ) : null}
    </Panel>
  );
}
