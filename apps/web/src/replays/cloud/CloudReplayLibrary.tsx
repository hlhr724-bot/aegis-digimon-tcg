import { ReplayDeckIcons } from "@/replays/ReplayDeckIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../design/primitives";
import { Icons } from "../../design/icons";
import { useTranslation, type TranslationKey } from "../../i18n";
import { ReplayFileError } from "../files";
import { CloudAuthError, useCloudReplays, type CloudReplayFile } from ".";

/**
 * The replays in the player's Google Drive, newest first. Watching downloads the file
 * straight from Drive and opens it in the same viewer as a local file.
 */
export function CloudReplayLibrary({ onOpen }: { onOpen: (file: Blob) => Promise<void> }) {
  const { t, locale } = useTranslation();
  const { provider, linked, connected } = useCloudReplays();
  const [files, setFiles] = useState<CloudReplayFile[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const [busy, setBusy] = useState<string>();
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!provider) return;
    const generation = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const next = await provider.list();
      if (request.current === generation) setFiles(next);
    } catch (cause) {
      if (request.current === generation && !(cause instanceof CloudAuthError)) setError("replay.drive.error");
    } finally {
      if (request.current === generation) setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (!provider || !linked) return;
    if (connected) void refresh();
    else void provider.prepare().catch(() => undefined);
    return () => {
      request.current++;
    };
  }, [provider, linked, connected, refresh]);

  if (!provider || !linked) return null;

  async function watch(file: CloudReplayFile) {
    if (!provider) return;
    setBusy(file.id);
    setError(undefined);
    try {
      await onOpen(await provider.download(file));
    } catch (cause) {
      if (cause instanceof ReplayFileError) setError(`replay.error.${cause.code}`);
      else if (!(cause instanceof CloudAuthError)) setError("replay.drive.error");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="replay-library replay-cloud-library" aria-labelledby="replay-cloud-title">
      <header>
        <div>
          <h2 id="replay-cloud-title">{t("replay.drive.title")}</h2>
          <p>{t("replay.drive.libraryHint")}</p>
        </div>
        <Icons.Cloud size={22} aria-hidden="true" />
      </header>
      {!connected ? (
        <div className="replay-cloud-library__connect">
          <p>{t("replay.drive.reconnectHint")}</p>
          <Button
            size="sm"
            icon={Icons.Cloud}
            onClick={() => {
              setError(undefined);
              provider.connect().catch(() => setError("replay.drive.authFailed"));
            }}
          >
            {t("replay.drive.show")}
          </Button>
        </div>
      ) : null}
      {connected && loading ? <p role="status">{t("replay.drive.loading")}</p> : null}
      {error ? (
        <div role="alert">
          <p>{t(error)}</p>
          {connected && error === "replay.drive.error" ? (
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              {t("replay.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {connected && files && !loading && !files.length ? <p>{t("replay.drive.empty")}</p> : null}
      {connected && files?.length ? (
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              <div className="replay-library__match">
                <ReplayDeckIcons summary={{ deckIcons: file.deckIcons, players: [file.players ?? file.name, ""] }} />
                <strong>{file.players ?? file.name}</strong>
                <small>
                  {new Date(file.createdAt).toLocaleDateString(locale)}
                  {file.bytes === undefined ? null : ` · ${Math.ceil(file.bytes / 1024)} KB`}
                </small>
              </div>
              <div className="replay-library__actions">
                <Button
                  size="sm"
                  icon={Icons.Play}
                  disabled={busy !== undefined}
                  aria-label={`${t("replay.prompt.watch")}: ${file.players ?? file.name}`}
                  onClick={() => void watch(file)}
                >
                  {t("replay.prompt.watch")}
                </Button>
                {file.webViewLink ? (
                  <a
                    className="aegis-button aegis-button--secondary aegis-button--sm"
                    href={file.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icons.ExternalLink size={16} aria-hidden="true" />
                    {t("replay.drive.open")}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
