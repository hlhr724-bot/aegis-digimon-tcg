import { useCallback, useState, type FormEvent } from "react";
import { Alert, Button, Panel } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";
import type { TournamentSpectatorSettings } from "@aegis/shared/tournaments/TournamentSpectatorSettings";
import { tournamentApi, type ApiError, type ApiResult } from "@/tournaments/client";
import { usePolledRequest } from "@/tournaments/hooks";
import "./tournamentSpectators.css";

type Props = { id: string; onChanged: () => void };

const SETTINGS_POLL_MS = 30_000;
const MAX_DISPLAY_NAME_LENGTH = 64;

export function TournamentSpectatorControls({ id, onChanged }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TournamentSpectatorSettings>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const load = useCallback((signal: AbortSignal) => tournamentApi.spectatorSettings(id, signal), [id]);
  const apply = useCallback((result: ApiResult<TournamentSpectatorSettings>) => {
    if (result.ok) {
      setSettings(result.value);
    }
  }, []);
  usePolledRequest(load, apply, SETTINGS_POLL_MS);

  async function save(action: () => Promise<ApiResult<TournamentSpectatorSettings>>): Promise<boolean> {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(undefined);
    setSettings(result.value);
    onChanged();
    return true;
  }

  async function addSpectator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) {
      return;
    }
    if (await save(() => tournamentApi.addSpectator(id, name))) {
      setDisplayName("");
    }
  }

  if (!settings) {
    return null;
  }

  return (
    <Panel className="tournaments-spectator-controls">
      <h3>{t("tournaments.spectators.title")}</h3>
      <p className="tournaments-note">{t("tournaments.spectators.organizerHelp")}</p>
      <div className="tournaments-spectator-policy" role="radiogroup" aria-label={t("tournaments.spectators.title")}>
        {Object.values(TournamentSpectatorPolicy).map((policy) => (
          <button
            key={policy.value}
            type="button"
            role="radio"
            aria-checked={settings.policy === policy.value}
            className={settings.policy === policy.value ? "is-selected" : undefined}
            disabled={busy}
            onClick={() => void save(() => tournamentApi.setSpectatorPolicy(id, policy.value))}
          >
            <span className="tournaments-spectator-policy__label">{t(policy.labelKey)}</span>
            <span className="tournaments-spectator-policy__help">{t(policy.descriptionKey)}</span>
          </button>
        ))}
      </div>
      {settings.policy === TournamentSpectatorPolicy.ALLOWLIST.value ? (
        <section className="tournaments-spectator-list">
          <h4>{t("tournaments.spectators.allowedTitle")}</h4>
          {settings.spectators.length === 0 ? (
            <p className="tournaments-note">{t("tournaments.spectators.allowedEmpty")}</p>
          ) : (
            <ul>
              {settings.spectators.map((spectator) => (
                <li key={spectator.accountId}>
                  <span className="tournaments-participants__avatar" aria-hidden="true">
                    {spectator.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="tournaments-spectator-list__name">{spectator.displayName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={t("tournaments.spectators.removeNamed", { name: spectator.displayName })}
                    onClick={() => void save(() => tournamentApi.removeSpectator(id, spectator.accountId))}
                  >
                    {t("tournaments.spectators.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form className="tournaments-spectator-add" onSubmit={(event) => void addSpectator(event)}>
            <label className="aegis-field__label" htmlFor={`tournament-spectator-${id}`}>
              {t("tournaments.spectators.addLabel")}
            </label>
            <div className="tournaments-spectator-add__row">
              <input
                id={`tournament-spectator-${id}`}
                className="aegis-field__control"
                autoComplete="off"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                placeholder={t("tournaments.spectators.addPlaceholder")}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <Button type="submit" disabled={busy || !displayName.trim()}>
                {t("tournaments.spectators.add")}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      <p className="tournaments-note">{t("tournaments.spectators.alwaysAllowed")}</p>
      {error ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t(getErrorKey(error))}
        </Alert>
      ) : null}
    </Panel>
  );
}

function getErrorKey(error: ApiError) {
  if (error.code === "spectator_account_not_found") {
    return "tournaments.spectators.error.accountNotFound" as const;
  }
  if (error.code === "spectator_limit_reached") {
    return "tournaments.spectators.error.limitReached" as const;
  }
  return "tournaments.spectators.error.generic" as const;
}
