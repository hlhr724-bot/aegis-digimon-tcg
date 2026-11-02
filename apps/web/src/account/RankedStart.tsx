import type { DeckFormat } from "@aegis/shared/deckFormat";
import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { getRankedRegion } from "@/ranked/getRankedRegion";
import { useRankedConfig } from "@/ranked/useRankedConfig";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import { accountApi } from "./client";
import "./RankedStart.css";
import "@/ranked/ranked.css";

const CONFIRMATION_KEY = "aegis-ranked-confirmed";

export function RankedStart({
  disabled,
  format = "standard",
  rankedDisabled = false,
  initialRanked = false,
  buttonLabel,
  actionClassName,
  className,
  matchSummary,
  onOpenSettings,
  onRankedChange,
  onStart,
}: {
  disabled: boolean;
  format?: DeckFormat;
  rankedDisabled?: boolean;
  initialRanked?: boolean;
  buttonLabel: string;
  actionClassName?: string;
  className?: string;
  matchSummary?: ReactNode;
  onOpenSettings: () => void;
  onRankedChange?: (ranked: boolean) => void;
  onStart: (ranked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [ranked, setRanked] = useState(initialRanked);
  const modeId = useId();
  const rankedConfig = useRankedConfig();
  const available = rankedConfig?.enabled === true;
  const canRanked = available && rankedConfig.formats.includes(format) && !rankedDisabled;
  const [region, setRegion] = useState(getRankedRegion);
  const [confirming, setConfirming] = useState(false);
  const [skipNextTime, setSkipNextTime] = useState(false);
  const [error, setError] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean>();
  useEffect(() => {
    let active = true;
    void accountApi
      .me()
      .then((account) => {
        if (active) setAuthenticated(account !== null);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function selectQueue(isRanked: boolean) {
    setRanked(isRanked);
    onRankedChange?.(isRanked);
  }
  async function begin() {
    setError(false);
    if (ranked) {
      const account = await accountApi.me().catch(() => null);
      if (!account) {
        setError(true);
        return;
      }
    }
    if (ranked && !confirmationSkipped()) setConfirming(true);
    else onStart(ranked);
  }
  function confirm() {
    if (skipNextTime) skipConfirmation();
    setConfirming(false);
    onStart(true);
  }
  return (
    <>
      <div className={className}>
        <div className="ranked-start">
          <fieldset className="ranked-start__modes">
            <legend>{t("ranked.queue.mode")}</legend>
            <div className="ranked-start__choices">
              <label className="ranked-start__choice" data-selected={!ranked || undefined}>
                <input type="radio" name={modeId} checked={!ranked} onChange={() => selectQueue(false)} />
                <Icons.Swords size={20} />
                <span>
                  <strong>{t("ranked.queue.casual")}</strong>
                  <small>{t("ranked.queue.casualDescription")}</small>
                </span>
              </label>
              <label
                className="ranked-start__choice"
                data-selected={ranked || undefined}
                data-disabled={!authenticated || !canRanked || undefined}
              >
                <input
                  type="radio"
                  name={modeId}
                  disabled={!authenticated || !canRanked}
                  checked={ranked}
                  onChange={() => selectQueue(true)}
                />
                <Icons.Trophy size={20} />
                <span>
                  <strong>{t("ranked.queue.ranked")}</strong>
                  <small>{t("ranked.queue.rankedDescription")}</small>
                </span>
              </label>
            </div>
          </fieldset>
          {authenticated === false ? (
            <button type="button" className="ranked-start__sign-in" onClick={onOpenSettings}>
              <Icons.LogIn size={16} />
              {t("ranked.signInToEnable")}
            </button>
          ) : null}
          {authenticated && !available ? (
            <span className="ranked-start__description">{t("ranked.season.unavailable")}</span>
          ) : null}
          {authenticated && available && !canRanked ? (
            <span className="ranked-start__description">
              {t(rankedDisabled ? "ranked.season.savedDeck" : "ranked.season.unsupportedFormat")}
            </span>
          ) : null}
          {ranked ? (
            <>
              <div className="ranked-start__rules">
                <span>{format === "standard" ? "Standard" : format}</span>
                <span>
                  <Icons.Clock size={14} />
                  {t("ranked.season.clock")}
                </span>
              </div>
              <label className="ranked-start__region">
                {t("ranked.season.region")}
                <select
                  className="ranked-region-select"
                  value={region}
                  onChange={(event) => {
                    const value = event.target.value as RankedRegion;
                    setRegion(value);
                    try {
                      localStorage.setItem("aegis:ranked-region", value);
                    } catch {}
                  }}
                >
                  {Object.values(RankedRegion).map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {t(`ranked.region.${entry.value}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>
        <div className="ranked-start__action">
          {matchSummary}
          <div className={actionClassName}>
            <Button
              size="lg"
              full
              icon={ranked ? Icons.Trophy : Icons.Swords}
              disabled={disabled || (ranked && (!canRanked || !authenticated))}
              onClick={() => void begin()}
            >
              {ranked ? t("ranked.queue.enterRanked") : buttonLabel}
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <div role="alert" className="ranked-start__error">
          {t("ranked.signInFirst")}
        </div>
      ) : null}
      {confirming ? (
        <div role="dialog" aria-modal="true" aria-labelledby="ranked-title" className="ranked-confirm">
          <div className="ranked-confirm__dialog aegis-dialog">
            <header className="aegis-dialog__header">
              <span className="aegis-dialog__eyebrow">{t("redesign.shell.ranked.eyebrow")}</span>
              <strong id="ranked-title" className="aegis-dialog__title">
                {t("ranked.confirmTitle")}
              </strong>
            </header>
            <p className="ranked-confirm__body">{t("ranked.confirmBody")}</p>
            <label className="ranked-confirm__skip">
              <input
                type="checkbox"
                checked={skipNextTime}
                onChange={(event) => setSkipNextTime(event.target.checked)}
              />
              {t("ranked.dontShowAgain")}
            </label>
            <div className="ranked-confirm__actions">
              <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={confirm}>
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function confirmationSkipped(): boolean {
  try {
    return localStorage.getItem(CONFIRMATION_KEY) === "1";
  } catch {
    return false;
  }
}

function skipConfirmation(): void {
  try {
    localStorage.setItem(CONFIRMATION_KEY, "1");
  } catch {
    // Blocked storage asks again next time.
  }
}
