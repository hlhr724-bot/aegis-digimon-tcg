import { useProfileTrophiesShown } from "@/achievements/useProfileTrophiesShown";
import { TrophyCabinet } from "@/achievements/TrophyCabinet";
import type { DeckListing } from "@/game/decks";
import { useCallback, useEffect, useState } from "react";
import type { MatchHistorySummary, MatchWinRate } from "@aegis/shared";
import type { PlayerIdentity } from "../design/primitives";
import { useTranslation } from "../i18n";
import { accountApi, type RemoteAccount } from "./client";
import { AccountPanel } from "./AccountPanel";
import { MatchHistory } from "./MatchHistory";
import { OpenReplayFile } from "./OpenReplayFile";
import { ProfileIdentity } from "./ProfileIdentity";
import type { DigimonWorldAvatarId } from "./avatars";
import { ReplayViewer, useReplayFile } from "../replays/ReplayViewer";
import { PlaytestPanel } from "./PlaytestPanel";
import { DriveConnectCard } from "../replays/cloud/DriveOnboarding";
import { CloudReplayLibrary } from "../replays/cloud/CloudReplayLibrary";
import "./profile.css";

export function ProfileScreen({
  account,
  onAccountChange,
  player,
  onGuestChange,
  onRefreshDiscordAvatar,
  onViewingChange,
  onCopyDeck,
  avatarMenuRequest,
}: {
  onCopyDeck?: (deck: DeckListing) => void;
  account: RemoteAccount | null | undefined;
  onAccountChange?: (account: RemoteAccount) => void;
  player: PlayerIdentity;
  onGuestChange?: (name: string, avatarId: DigimonWorldAvatarId | null) => void;
  onRefreshDiscordAvatar?: () => Promise<void>;
  /** Playback covers the whole screen, so the app hides its navigation meanwhile. */
  onViewingChange?: (viewing: boolean) => void;
  avatarMenuRequest?: number;
}) {
  const { t } = useTranslation();
  const trophiesShown = useProfileTrophiesShown();
  const file = useReplayFile(onViewingChange);
  const [summary, setSummary] = useState<MatchHistorySummary>();
  const [rate, setRate] = useState<{ accountId: string; counts: MatchWinRate | undefined }>();
  const updateRate = useCallback(
    (counts: MatchWinRate | undefined) => {
      if (account) setRate({ accountId: account.id, counts });
    },
    [account?.id],
  );
  const [summaryVersion, setSummaryVersion] = useState(0);
  const refreshSummary = useCallback(() => setSummaryVersion((value) => value + 1), []);
  useEffect(() => {
    if (!account) {
      setSummary(undefined);
      return;
    }
    let active = true;
    void accountApi
      .profile()
      .then((profile) => {
        if (active) setSummary(profile.summary);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [account?.id, summaryVersion]);

  if (file.replay) return <ReplayViewer replay={file.replay} onClose={file.close} />;
  const openError = file.error ? (`replay.error.${file.error}` as const) : undefined;
  return (
    <main className="profile-page">
      <header className="profile-page__heading">
        <span>AEGIS / {t("profile.title")}</span>
        <h1>{t("profile.title")}</h1>
      </header>
      <ProfileIdentity
        key={account?.id ?? "guest"}
        account={account}
        player={player}
        summary={summary}
        rate={rate?.accountId === account?.id ? rate?.counts : undefined}
        onAccountChange={onAccountChange}
        onGuestChange={onGuestChange}
        onRefreshDiscordAvatar={onRefreshDiscordAvatar}
        avatarMenuRequest={avatarMenuRequest}
      />
      {account === undefined ? (
        <p role="status">{t("account.loading")}</p>
      ) : account ? (
        <>
          {trophiesShown ? <TrophyCabinet accountId={account.id} /> : null}
          <DriveConnectCard signedIn />
          <MatchHistory
            key={account.id}
            onCopyDeck={onCopyDeck}
            onWinRateChange={updateRate}
            onOpenFile={(blob) => void file.open(blob)}
            opening={file.loading}
            openError={openError}
            onReplaysChange={refreshSummary}
          />
          <PlaytestPanel />
        </>
      ) : (
        <>
          <p className="profile-guest-hint">{t("profile.guestHint")}</p>
          <AccountPanel account={null} />
          <DriveConnectCard signedIn={false} />
          <section className="profile-history profile-guest-replays" aria-labelledby="profile-guest-replays-title">
            <header className="profile-history__header">
              <h2 id="profile-guest-replays-title">{t("replay.title")}</h2>
              <OpenReplayFile onOpen={(blob) => void file.open(blob)} opening={file.loading} />
            </header>
            {openError ? (
              <p className="profile-history__notice" role="alert">
                {t(openError)}
              </p>
            ) : null}
            <p className="profile-history__state">{t("replay.local")}</p>
            <CloudReplayLibrary onOpen={file.open} />
          </section>
        </>
      )}
    </main>
  );
}
