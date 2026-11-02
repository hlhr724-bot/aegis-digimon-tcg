import { useProfileTrophiesShown } from "@/achievements/useProfileTrophiesShown";
import { setProfileTrophiesShown } from "@/achievements/setProfileTrophiesShown";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { MatchHistorySummary, MatchWinRate } from "@aegis/shared";
import { Avatar, Badge, Switch, type PlayerIdentity } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation, type TranslationKey } from "../i18n";
import { AccountApiError, accountApi, type RemoteAccount } from "./client";
import { AvatarMenu, avatarChoice, type AvatarSelection } from "./AvatarMenu";
import type { DigimonWorldAvatarId } from "./avatars";
import { setProfileStatsShown, useProfileStatsShown } from "./profileStats";

const NAME_MIN = 3;
const NAME_MAX = 32;

function nameErrorKey(failure: unknown): TranslationKey {
  const code = failure instanceof AccountApiError ? failure.code : undefined;
  if (code === "display_name_taken") return "account.nickname.taken";
  if (code === "too_many_requests") return "account.nickname.rateLimit";
  if (code === "invalid_display_name") return "account.nickname.invalid";
  return "account.nickname.error";
}

/** The always-visible header: portrait, name and totals. Every change saves as soon as it is made. */
export function ProfileIdentity({
  account,
  player,
  summary,
  rate,
  onAccountChange,
  onGuestChange,
  onRefreshDiscordAvatar,
  avatarMenuRequest,
}: {
  account: RemoteAccount | null | undefined;
  player: PlayerIdentity;
  summary: MatchHistorySummary | undefined;
  rate: MatchWinRate | undefined;
  onAccountChange?: (account: RemoteAccount) => void;
  onGuestChange?: (name: string, avatarId: DigimonWorldAvatarId | null) => void;
  onRefreshDiscordAvatar?: () => Promise<void>;
  avatarMenuRequest?: number;
}) {
  const { t, locale } = useTranslation();
  const statsShown = useProfileStatsShown();
  const trophiesShown = useProfileTrophiesShown();
  const hintId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<TranslationKey>();
  const accountLoaded = account !== undefined;
  useEffect(() => {
    if (avatarMenuRequest !== undefined && accountLoaded) setMenuOpen(true);
  }, [avatarMenuRequest, accountLoaded]);
  const name = account?.displayName ?? player.name;
  const guestAvatar = player.guestAvatarId ?? player.avatarId ?? null;
  const selected: AvatarSelection = account
    ? account.avatarSource === "digimon" && account.avatarId
      ? account.avatarId
      : account.avatarSource === "discord"
        ? "discord"
        : "default"
    : (guestAvatar ?? "default");

  function startEditing() {
    setDraft(name);
    setNameError(undefined);
    setEditing(true);
  }
  function cancelEditing() {
    if (saving) return;
    setEditing(false);
    setNameError(undefined);
  }
  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const next = draft.trim().replace(/\s+/g, " ");
    if (next === name) {
      setEditing(false);
      return;
    }
    if (next.length < NAME_MIN || next.length > NAME_MAX) {
      setNameError("account.nickname.invalid");
      return;
    }
    setSaving(true);
    setNameError(undefined);
    try {
      if (account) onAccountChange?.({ ...account, ...(await accountApi.updateDisplayName(next)) });
      else onGuestChange?.(next, guestAvatar);
      setEditing(false);
    } catch (failure) {
      setNameError(nameErrorKey(failure));
    } finally {
      setSaving(false);
    }
  }
  async function selectAvatar(selection: AvatarSelection) {
    if (!account) {
      onGuestChange?.(name, avatarChoice(selection, false) as DigimonWorldAvatarId | null);
      return;
    }
    onAccountChange?.({ ...account, ...(await accountApi.updateAvatar(avatarChoice(selection, true))) });
  }

  async function uploadAvatar(image: Blob) {
    onAccountChange?.(await accountApi.uploadAvatarImage(image));
  }

  const winRate = rate?.matches
    ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
        rate.wins / (rate.wins + rate.losses + rate.draws),
      )
    : "—";
  const stats: { key: TranslationKey; value: string | number }[] = [
    { key: "profile.stats.humanMatches", value: rate?.matches ?? "—" },
    { key: "profile.stats.humanWins", value: rate?.wins ?? "—" },
    { key: "profile.stats.winRate", value: winRate },
    { key: "profile.stats.replays", value: summary?.replaysSaved ?? "—" },
  ];
  return (
    <section className="profile-identity" aria-label={t("profile.title")}>
      <div className="profile-identity__main">
        <button
          type="button"
          className="profile-identity__avatar"
          aria-label={t("profile.changeAvatar")}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          disabled={account === undefined}
          onClick={() => setMenuOpen(true)}
        >
          <Avatar
            name={name}
            avatarId={account ? account.avatarId : guestAvatar}
            avatarUrl={account?.avatarUrl}
            color={player.color}
            size={96}
          />
          <span className="profile-identity__edit-badge" aria-hidden="true">
            <Icons.Pencil size={14} />
          </span>
        </button>
        <div className="profile-identity__name">
          <Badge tone={account ? "success" : "neutral"}>{t(account ? "account.connected" : "playerMenu.guest")}</Badge>
          {editing ? (
            <form className="profile-identity__name-form" onSubmit={(event) => void saveName(event)}>
              <div className="profile-identity__name-row">
                <input
                  value={draft}
                  aria-label={t("account.nickname.label")}
                  aria-describedby={hintId}
                  aria-invalid={nameError ? true : undefined}
                  autoComplete="nickname"
                  maxLength={NAME_MAX}
                  disabled={saving}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditing();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="profile-identity__name-save"
                  aria-label={t("profile.saveName")}
                  disabled={saving}
                >
                  <Icons.Check size={20} />
                </button>
                <button
                  type="button"
                  className="profile-identity__name-cancel"
                  aria-label={t("profile.cancelName")}
                  disabled={saving}
                  onClick={cancelEditing}
                >
                  <Icons.X size={20} />
                </button>
              </div>
              <small id={hintId} role={nameError ? "alert" : undefined} data-error={nameError ? true : undefined}>
                {t(nameError ?? (saving ? "account.nickname.saving" : "profile.nameRules"))}
              </small>
            </form>
          ) : (
            <h2>
              <button
                type="button"
                className="profile-identity__name-button"
                aria-label={`${t("profile.editName")}: ${name}`}
                disabled={account === undefined}
                onClick={startEditing}
              >
                <span>{name}</span>
                <Icons.Pencil size={18} aria-hidden="true" />
              </button>
            </h2>
          )}
        </div>
        <a
          className="aegis-icon-button profile-identity__settings"
          href="/settings"
          aria-label={t("profile.preferences")}
          title={t("profile.preferences")}
        >
          <Icons.Settings size={18} />
        </a>
      </div>
      {account ? (
        <div className="profile-stats-toggle">
          <Switch checked={statsShown} label={t("profile.showStats")} onChange={setProfileStatsShown} />
          <Switch checked={trophiesShown} label={t("achievements.trophies.show")} onChange={setProfileTrophiesShown} />
        </div>
      ) : null}
      {account && statsShown ? (
        <>
          <dl className="profile-stats">
            {stats.map((stat) => (
              <div key={stat.key}>
                <dt>{t(stat.key)}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="profile-rate-hint">{t("profile.stats.rateScope")}</p>
        </>
      ) : null}
      {menuOpen ? (
        <AvatarMenu
          name={name}
          color={player.color}
          avatarId={account ? account.avatarId : guestAvatar}
          avatarUrl={account?.avatarUrl ?? null}
          selected={selected}
          discordLinked={account?.discordLinked === true}
          onSelect={selectAvatar}
          onUpload={account ? uploadAvatar : undefined}
          onRefreshDiscordAvatar={onRefreshDiscordAvatar}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </section>
  );
}
