import { useState, type ReactNode } from "react";
import { Button } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation, type TranslationKey } from "../i18n";
import { replayPath } from "./library";
import type { ReadyReplay } from "./files";
import { useCloudReplaySave, useCloudReplays, type CloudSaveState } from "./cloud";
import { hasSeenDriveOnboarding, useDriveOnboarding } from "./cloud/DriveOnboarding";
import { useLocalReplay } from "./useLocalReplay";
import "./savePrompt.css";

export interface ReplaySaveProps {
  onDownloadReplay?: () => void;
  replayFile?: ReadyReplay;
  replayStatus?: "preparing" | "unavailable";
  /** A signed-in player's Drive copy also joins their replay library on every device. */
  signedIn?: boolean;
  /** Between games of a series, links open a new tab so the series keeps its seat. */
  keepsMatchOpen?: boolean;
}

const FAILURES: Record<Extract<CloudSaveState, { kind: "failed" }>["reason"], TranslationKey> = {
  auth: "replay.drive.authFailed",
  error: "replay.drive.failed",
  register: "replay.drive.registerFailed",
};

/** One line: a status the player only needs to notice, with optional quiet links. */
function StatusRow({
  tone,
  icon,
  children,
}: {
  tone: "busy" | "saved" | "quiet";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`replay-prompt replay-prompt--row replay-prompt--${tone}`}
      role="status"
      aria-labelledby="replay-prompt-title"
    >
      <span className="replay-prompt__icon" aria-hidden="true">
        {icon}
      </span>
      {children}
    </section>
  );
}

/**
 * Keeps the finished match's replay. Every replay is already saved in this browser; a connected
 * Google Drive also saves it on its own and the card shrinks to a status line. Otherwise the card
 * warns that the copy lives only on this device and offers Drive or the file.
 */
export function ReplaySavePrompt({
  onDownloadReplay,
  replayFile,
  replayStatus,
  signedIn = false,
  keepsMatchOpen = false,
}: ReplaySaveProps) {
  const { t } = useTranslation();
  const cloud = useCloudReplaySave(replayFile);
  const { linked } = useCloudReplays();
  const onboarding = useDriveOnboarding(signedIn);
  const [skipped, setSkipped] = useState(false);
  const onDevice = useLocalReplay(replayFile) === "saved";

  if (!onDownloadReplay && !replayStatus) return null;

  const newTab = keepsMatchOpen ? { target: "_blank", rel: "noreferrer" } : {};

  if (replayStatus)
    return (
      <StatusRow tone="quiet" icon={<Icons.PlayCircle size={20} />}>
        <h2 id="replay-prompt-title">{t(replayStatus === "preparing" ? "replay.preparing" : "replay.unavailable")}</h2>
      </StatusRow>
    );

  if (cloud.state.kind === "saved") {
    const indexId = signedIn ? replayFile?.indexId : undefined;
    const driveLink = cloud.state.file.webViewLink ?? cloud.viewLink(cloud.state.file.id);
    return (
      <StatusRow tone="saved" icon={<Icons.CircleCheck size={20} />}>
        <h2 id="replay-prompt-title">{t("replay.drive.saved")}</h2>
        <span className="replay-prompt__links">
          {indexId ? (
            <a href={replayPath(indexId)} {...newTab}>
              {t("replay.prompt.watch")}
            </a>
          ) : (
            <a href={driveLink} target="_blank" rel="noreferrer">
              {t("replay.prompt.watch")}
            </a>
          )}
          <a href="/profile" {...newTab}>
            {t("replay.prompt.library")}
          </a>
        </span>
      </StatusRow>
    );
  }

  if (cloud.state.kind === "saving")
    return (
      <StatusRow tone="busy" icon={<span className="replay-prompt__spinner" />}>
        <h2 id="replay-prompt-title">{t("replay.drive.saving")}</h2>
      </StatusRow>
    );

  const save = () => (linked || hasSeenDriveOnboarding() ? cloud.save() : onboarding.show(cloud.save));
  const saveLabel: TranslationKey = onDevice ? "replay.local.sync" : "replay.drive.save";
  const watchOnDevice =
    onDevice && replayFile ? (
      <a href={replayPath(replayFile.summary.id)} {...newTab}>
        {t("replay.prompt.watch")}
      </a>
    ) : null;

  if (skipped)
    return (
      <StatusRow tone="quiet" icon={<Icons.PlayCircle size={20} />}>
        <h2 id="replay-prompt-title">{t(onDevice ? "replay.local.only" : "replay.prompt.skippedTitle")}</h2>
        <span className="replay-prompt__links">
          {watchOnDevice}
          {cloud.available ? (
            <button type="button" onClick={save}>
              {t(saveLabel)}
            </button>
          ) : null}
          {onDownloadReplay ? (
            <button type="button" onClick={onDownloadReplay}>
              {t("replay.prompt.download")}
            </button>
          ) : null}
        </span>
        {onboarding.element}
      </StatusRow>
    );

  const failure = cloud.state.kind === "failed" ? FAILURES[cloud.state.reason] : undefined;

  if (cloud.needsReconnect && !failure)
    return (
      <section className="replay-prompt replay-prompt--inline" aria-labelledby="replay-prompt-title">
        <div className="replay-prompt__copy">
          <h2 id="replay-prompt-title">{t(onDevice ? "replay.local.title" : "replay.prompt.expiredTitle")}</h2>
          <p>{t(onDevice ? "replay.local.expired" : "replay.drive.expired")}</p>
        </div>
        <div className="replay-prompt__actions">
          <Button size="sm" icon={Icons.Cloud} onClick={save}>
            {t("replay.prompt.reconnect")}
          </Button>
          {onDownloadReplay ? (
            <Button
              size="sm"
              variant="secondary"
              icon={Icons.Download}
              aria-label={t("replay.prompt.download")}
              title={t("replay.prompt.download")}
              onClick={onDownloadReplay}
            />
          ) : null}
        </div>
      </section>
    );

  const hint: TranslationKey = onDevice
    ? "replay.local.notSynced"
    : !cloud.available
      ? "replay.prompt.downloadHint"
      : signedIn
        ? "replay.prompt.driveHint"
        : "replay.prompt.guestHint";
  const hasActions = cloud.available || !!onDownloadReplay;
  return (
    <section className="replay-prompt replay-prompt--card" aria-labelledby="replay-prompt-title">
      <div className="replay-prompt__copy">
        <h2 id="replay-prompt-title">
          {onDevice ? <Icons.Devices size={18} aria-hidden="true" /> : null}
          {t(onDevice ? "replay.local.title" : "replay.prompt.title")}
          {cloud.available && !linked ? (
            <span className="drive-connect-card__badge">{t("replay.onboarding.new")}</span>
          ) : null}
        </h2>
        {failure ? (
          <p role="alert">{t(failure)}</p>
        ) : (
          <p>
            {t(hint)}
            {cloud.available && !linked ? (
              <>
                {" "}
                <button type="button" className="drive-how-link" onClick={() => onboarding.show()}>
                  {t("replay.onboarding.howItWorks")}
                </button>
              </>
            ) : null}
          </p>
        )}
      </div>
      {hasActions ? (
        <button
          type="button"
          className="replay-prompt__dismiss"
          aria-label={t("replay.prompt.skip")}
          title={t("replay.prompt.skip")}
          onClick={() => setSkipped(true)}
        >
          <Icons.X size={18} />
        </button>
      ) : null}
      {hasActions ? (
        <div className="replay-prompt__actions">
          {cloud.available ? (
            <Button size="sm" icon={Icons.Cloud} onClick={save}>
              {t(saveLabel)}
            </Button>
          ) : null}
          {onDownloadReplay ? (
            <Button size="sm" variant="secondary" icon={Icons.Download} onClick={onDownloadReplay}>
              {t("replay.prompt.download")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {onboarding.element}
    </section>
  );
}
