import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import { uploadFriendReplay } from "@/replays/uploadFriendReplay";
import "./sharing.css";
import { useId, useState } from "react";
import type { SavedReplay } from "@aegis/shared";
import { Button, Dialog } from "../design/primitives";
import { useTranslation, type TranslationKey } from "../i18n";
import { replayApi, replayLink } from "./library";
import { CloudAuthError, useCloudReplays, withCloudSession } from "./cloud";

/** Aegis no longer serves the replay, but Drive still lets anyone with the file's link read it. */
class DriveStillPublicError extends Error {}

/**
 * Public replays are served by our API from the owner's Drive, so going public first lets
 * anyone with the link read the Drive file, then tells the API. Going private does the reverse.
 */
export function ReplaySharing({
  replay,
  onChange,
  publicSharing = true,
}: {
  replay: SavedReplay;
  onChange?: (replay: SavedReplay) => void;
  publicSharing?: boolean;
}) {
  const { t } = useTranslation();
  const { provider } = useCloudReplays();
  const title = useId();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState(replay.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const [copied, setCopied] = useState(false);
  if (!provider) return null;
  const drive = provider;

  async function publish(): Promise<SavedReplay> {
    await drive.share(replay.driveFileId);
    try {
      return await replayApi.visibility(replay.id, "public");
    } catch (cause) {
      await drive.unshare(replay.driveFileId).catch(() => undefined);
      throw cause;
    }
  }

  async function unpublish(): Promise<SavedReplay> {
    const updated = await replayApi.visibility(replay.id, "private");
    onChange?.(updated);
    try {
      await drive.unshare(replay.driveFileId);
    } catch {
      throw new DriveStillPublicError();
    }
    return updated;
  }

  async function shareWithFriends(): Promise<SavedReplay> {
    await unpublish();
    const archive = await drive.download({ id: replay.driveFileId, bytes: replay.bytes });
    return uploadFriendReplay({ replayId: replay.id, archive });
  }

  async function save() {
    if (visibility === replay.visibility) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // The session check runs inside the click, so a sign-in pop-up is allowed to open.
      let operation = unpublish;
      if (visibility === ReplayVisibility.PUBLIC.value) {
        operation = publish;
      }
      if (visibility === ReplayVisibility.FRIENDS.value) {
        operation = shareWithFriends;
      }
      const updated = await withCloudSession(drive, operation);
      onChange?.(updated);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof DriveStillPublicError
          ? "replay.shareDriveStillPublic"
          : cause instanceof CloudAuthError
            ? "replay.drive.authFailed"
            : "replay.shareFailed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setVisibility(replay.visibility);
          setCopied(false);
          setError(undefined);
          setOpen(true);
          void drive.prepare().catch(() => undefined);
        }}
      >
        {t(getVisibilityLabel(replay.visibility))} · {t("replay.share")}
      </Button>
      {open ? (
        <Dialog className="replay-sharing" labelledBy={title} onClose={busy ? undefined : () => setOpen(false)}>
          <h2 id={title}>{t("replay.share")}</h2>
          <fieldset disabled={busy}>
            <legend className="aegis-sr-only">{t("replay.share")}</legend>
            {Object.values(ReplayVisibility).map(({ value }) => (
              <label key={value} className="replay-sharing__choice">
                <input
                  type="radio"
                  disabled={value === ReplayVisibility.PUBLIC.value && !publicSharing}
                  name={title}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                />
                <span>
                  <strong>{t(getVisibilityLabel(value))}</strong>
                  <small>{t(getVisibilityHint(value))}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p>{t("replay.revokeHint")}</p>
          <label className="replay-sharing__link">
            {t("replay.link")}
            <input readOnly value={replayLink(replay.id)} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <Button
            variant="secondary"
            disabled={busy || visibility !== replay.visibility}
            onClick={() => {
              void navigator.clipboard
                .writeText(replayLink(replay.id))
                .then(() => setCopied(true))
                .catch(() => setError("replay.shareFailed"));
            }}
          >
            {t(copied ? "replay.copied" : "replay.copyLink")}
          </Button>
          {error ? <p role="alert">{t(error)}</p> : null}
          <footer>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t("common.save")}
            </Button>
          </footer>
        </Dialog>
      ) : null}
    </>
  );
}

function getVisibilityLabel(value: SavedReplay["visibility"]): TranslationKey {
  if (value === ReplayVisibility.FRIENDS.value) {
    return "friends.replayVisibility";
  }
  return value === ReplayVisibility.PUBLIC.value ? "replay.public" : "replay.private";
}

function getVisibilityHint(value: SavedReplay["visibility"]): TranslationKey {
  if (value === ReplayVisibility.FRIENDS.value) {
    return "friends.replayVisibilityHint";
  }
  return value === ReplayVisibility.PUBLIC.value ? "replay.publicHint" : "replay.privateHint";
}
