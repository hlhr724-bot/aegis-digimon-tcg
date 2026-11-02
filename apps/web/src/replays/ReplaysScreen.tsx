import { useEffect, useState } from "react";
import type { MatchReplay, SharedReplay } from "@aegis/shared";
import { useTranslation, type TranslationKey } from "../i18n";
import { Icons } from "../design/icons";
import { Button } from "../design/primitives";
import { readReplay, replayBlob, ReplayFileError } from "./files";
import { findLocalReplay, localReplayFile } from "./local";
import { replayApi } from "./library";
import { ReplayViewer } from "./ReplayViewer";
import { readReplayMomentIndex } from "@/replays/annotations/readReplayMomentIndex";
import { CloudAuthError, CloudRequestError, useCloudReplays, withCloudSession } from "./cloud";
import "./replays.css";

function cloudErrorKey(cause: unknown): TranslationKey {
  if (cause instanceof ReplayFileError) return `replay.error.${cause.code}`;
  if (cause instanceof CloudAuthError) return "replay.drive.authFailed";
  if (cause instanceof CloudRequestError && cause.status === 404) return "replay.driveMissing";
  return "replay.drive.error";
}

/** A shared replay link. The library itself lives on the profile. */
export function ReplaysScreen({
  onViewingChange,
  replayId,
  onCloseLink,
}: {
  onViewingChange?: (viewing: boolean) => void;
  replayId: string;
  onCloseLink?: () => void;
}) {
  const { t } = useTranslation();
  const [replay, setReplay] = useState<MatchReplay>();
  const [linkError, setLinkError] = useState<TranslationKey>();
  /** The owner's own replay waiting for a click, because Drive needs a sign-in pop-up. */
  const [ownReplay, setOwnReplay] = useState<SharedReplay>();
  const { provider } = useCloudReplays();
  const [loading, setLoading] = useState(false);
  const [initialIndex] = useState(() => readReplayMomentIndex(window.location.search));
  useEffect(() => {
    onViewingChange?.(replay !== undefined);
    return () => onViewingChange?.(false);
  }, [replay, onViewingChange]);
  async function openOwn(saved: SharedReplay) {
    if (!provider) return;
    setLoading(true);
    setLinkError(undefined);
    try {
      const file = await withCloudSession(provider, () =>
        provider.download({ id: saved.driveFileId, bytes: saved.bytes }),
      );
      setOwnReplay(undefined);
      setReplay(await readReplay(file));
    } catch (cause) {
      setLinkError(cloudErrorKey(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLinkError(undefined);
    setOwnReplay(undefined);
    setReplay(undefined);
    // A copy in this browser plays first. Otherwise the owner reads the file from their own Drive,
    // and everyone else gets a public copy through our API.
    const load = async () => {
      const local = await findLocalReplay(replayId);
      if (local) return replayBlob(localReplayFile(local));
      const saved = await replayApi.shared(replayId).catch(() => undefined);
      const ownDrive = saved?.owned && provider;
      if (ownDrive && provider.isConnected()) return provider.download({ id: saved.driveFileId, bytes: saved.bytes });
      if (ownDrive && saved.visibility === "private") {
        if (active) setOwnReplay(saved);
        void provider.prepare().catch(() => undefined);
        return undefined;
      }
      return replayApi.sharedFile(replayId);
    };
    void load()
      .then(async (file) => {
        if (!file) return;
        const parsed = await readReplay(file);
        if (active) setReplay(parsed);
      })
      .catch(() => {
        if (active) setLinkError("replay.linkError");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [replayId]);
  const close = () => {
    setReplay(undefined);
    onCloseLink?.();
  };
  if (replay)
    return (
      <ReplayViewer
        replay={replay}
        onClose={close}
        initialIndex={initialIndex}
        shareId={replayId === replay.id ? undefined : replayId}
      />
    );
  return (
    <section className="replay-import replay-link-state">
      <h1>{t("replay.title")}</h1>
      {ownReplay && !loading ? (
        <>
          <p>{t("replay.driveSignInToWatch")}</p>
          <Button icon={Icons.Cloud} onClick={() => void openOwn(ownReplay)}>
            {t("replay.prompt.watch")}
          </Button>
        </>
      ) : null}
      <p role={linkError ? "alert" : "status"}>{linkError ? t(linkError) : loading ? t("replay.loading") : null}</p>
      <Button onClick={close}>{t("replay.back")}</Button>
    </section>
  );
}
