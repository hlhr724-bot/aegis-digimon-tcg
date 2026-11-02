import { useState } from "react";
import type { TournamentGameTicket } from "@aegis/shared/tournaments/TournamentGameTicket";
import { Alert, Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiError } from "@/tournaments/client";

type Props = {
  tournamentId: string;
  matchId: string;
  seriesId: string | null;
  onJoinGame: (ticket: TournamentGameTicket) => void;
  onChanged?: () => void;
};

export function TournamentMatchActions({ tournamentId, matchId, seriesId, onJoinGame, onChanged }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState(false);
  const [error, setError] = useState<ApiError>();

  async function markPresent() {
    setBusy(true);
    setError(undefined);
    const result = await tournamentApi.markPresent(tournamentId, matchId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPresent(true);
    onChanged?.();
  }

  async function joinGame() {
    if (!seriesId) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await tournamentApi.authorizeGame(seriesId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onJoinGame(result.value);
  }

  return (
    <div className="tournaments-match-actions">
      {seriesId ? (
        <Button disabled={busy} onClick={() => void joinGame()}>
          {t("tournaments.play.join")}
        </Button>
      ) : (
        <Button disabled={busy || present} onClick={() => void markPresent()}>
          {t("tournaments.play.ready")}
        </Button>
      )}
      {present && !seriesId ? <p role="status">{t("tournaments.play.waiting")}</p> : null}
      {error ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t("tournaments.reason.unknown", { code: error.code })}
        </Alert>
      ) : null}
    </div>
  );
}
