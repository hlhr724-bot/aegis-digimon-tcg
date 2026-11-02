import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { AvatarChoice } from "@aegis/shared";
import { Avatar, Dialog } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation, type TranslationKey } from "../i18n";
import { AccountApiError } from "./client";
import { decodeAvatarFile } from "./normalizeAvatarImage";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { DIGIMON_WORLD_AVATARS, digimonAvatarUrl, type DigimonWorldAvatarId } from "./avatars";

export type AvatarSelection = DigimonWorldAvatarId | "default" | "discord";

type AvatarTab = "digimon" | "upload" | "discord";

const TAB_LABELS: Record<AvatarTab, TranslationKey> = {
  digimon: "account.avatar.tab.digimon",
  upload: "account.avatar.tab.upload",
  discord: "account.avatar.tab.discord",
};

function uploadFailureKey(failure: unknown): TranslationKey {
  if (!(failure instanceof AccountApiError)) return "account.avatar.uploadError";
  if (failure.status === 422) return "account.avatar.blocked";
  if (failure.status === 503) return "account.avatar.reviewUnavailable";
  return "account.avatar.uploadError";
}

export function AvatarMenu({
  name,
  color,
  avatarId,
  avatarUrl,
  selected,
  discordLinked,
  onSelect,
  onUpload,
  onRefreshDiscordAvatar,
  onClose,
}: {
  name: string;
  color: string;
  avatarId: DigimonWorldAvatarId | null;
  avatarUrl: string | null;
  selected: AvatarSelection;
  discordLinked: boolean;
  onSelect: (selection: AvatarSelection) => Promise<void>;
  onUpload?: (image: Blob) => Promise<void>;
  onRefreshDiscordAvatar?: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const tabsId = useId();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<AvatarSelection | "refresh" | "upload">();
  const [cropImage, setCropImage] = useState<ImageBitmap>();
  const [status, setStatus] = useState<{ key: TranslationKey; alert: boolean }>();
  const tabs = useMemo(
    () =>
      (["digimon", "upload", "discord"] as const).filter(
        (tab) => tab === "digimon" || (tab === "upload" ? Boolean(onUpload) : discordLinked),
      ),
    [onUpload, discordLinked],
  );
  const [tab, setTab] = useState<AvatarTab>(selected === "discord" && discordLinked ? "discord" : "digimon");
  const [dragging, setDragging] = useState(false);
  const avatars = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return DIGIMON_WORLD_AVATARS.filter((entry) => entry.name.toLocaleLowerCase().includes(normalized));
  }, [query]);

  async function choose(selection: AvatarSelection) {
    if (pending) return;
    if (selection === selected) {
      onClose();
      return;
    }
    setPending(selection);
    setStatus(undefined);
    try {
      await onSelect(selection);
      onClose();
    } catch {
      setStatus({ key: "account.avatar.error", alert: true });
      setPending(undefined);
    }
  }
  /**
   * Step one of an upload: decode the file and hand the player a crop window. Nothing leaves the
   * browser yet — `upload` sends exactly what that window showed.
   */
  async function choosePicture(file: File) {
    if (pending || !onUpload) return;
    setStatus(undefined);
    try {
      setCropImage(await decodeAvatarFile(file));
    } catch {
      setStatus({ key: "account.avatar.uploadError", alert: true });
    }
  }
  async function upload(blob: Blob) {
    if (pending || !onUpload) return;
    setPending("upload");
    setStatus(undefined);
    try {
      await onUpload(blob);
      cropImage?.close();
      setCropImage(undefined);
      onClose();
    } catch (failure) {
      cropImage?.close();
      setCropImage(undefined);
      setStatus({ key: uploadFailureKey(failure), alert: true });
      setPending(undefined);
    }
  }
  async function refresh() {
    if (pending || !onRefreshDiscordAvatar) return;
    setPending("refresh");
    setStatus(undefined);
    try {
      await onRefreshDiscordAvatar();
      setStatus({ key: "playerMenu.refreshDiscordAvatarDone", alert: false });
    } catch (failure) {
      setStatus({
        key:
          failure instanceof AccountApiError && failure.status === 429
            ? "playerMenu.refreshDiscordAvatarCooldown"
            : "playerMenu.refreshDiscordAvatarFailed",
        alert: true,
      });
    } finally {
      setPending(undefined);
    }
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length]!;
    setTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  }

  const busy = pending !== undefined;
  // The crop window replaces the menu rather than stacking a second dialog on top of it.
  if (cropImage) {
    return (
      <AvatarCropDialog
        image={cropImage}
        busy={pending === "upload"}
        onCancel={() => {
          cropImage.close();
          setCropImage(undefined);
        }}
        onConfirm={upload}
      />
    );
  }
  return (
    <Dialog className="avatar-picker" labelledBy={titleId} onClose={onClose}>
      <aside className="avatar-picker__preview">
        <div className="avatar-picker__hero">
          <span className="avatar-picker__portrait avatar-picker__portrait--large" aria-hidden="true">
            <Avatar name={name} avatarId={avatarId} avatarUrl={avatarUrl} color={color} size={160} />
          </span>
          <span className="avatar-picker__portrait avatar-picker__portrait--compact" aria-hidden="true">
            <Avatar name={name} avatarId={avatarId} avatarUrl={avatarUrl} color={color} size={48} />
          </span>
          <strong>{name}</strong>
        </div>
        <button
          type="button"
          className="avatar-picker__row"
          aria-pressed={selected === "default"}
          disabled={busy}
          onClick={() => void choose("default")}
        >
          <span aria-hidden="true">
            <Avatar name={name} color={color} size={36} />
          </span>
          <span className="avatar-picker__row-label">{t("account.avatar.useInitials")}</span>
          <Icons.ChevronRight size={18} aria-hidden="true" />
        </button>
      </aside>
      <div className="avatar-picker__main">
        <header>
          <div>
            <h2 id={titleId}>{t("profile.avatarMenu.title")}</h2>
            <p>{t("account.avatar.savesInstantly")}</p>
          </div>
          <button type="button" className="aegis-icon-button" aria-label={t("common.close")} onClick={onClose}>
            <Icons.X size={18} />
          </button>
        </header>
        {tabs.length > 1 ? (
          <div className="avatar-picker__tabs" role="tablist" aria-label={t("account.avatar.tabsAria")}>
            {tabs.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                id={`${tabsId}-${entry}`}
                aria-selected={entry === tab}
                aria-controls={`${tabsId}-${entry}-panel`}
                tabIndex={entry === tab ? 0 : -1}
                onClick={() => setTab(entry)}
                onKeyDown={moveTab}
              >
                {t(TAB_LABELS[entry])}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className={`avatar-picker__panel avatar-picker__panel--${tab}`}
          role={tabs.length > 1 ? "tabpanel" : undefined}
          id={`${tabsId}-${tab}-panel`}
          aria-labelledby={tabs.length > 1 ? `${tabsId}-${tab}` : undefined}
        >
          {tab === "digimon" ? (
            <>
              <label className="avatar-picker__search">
                <Icons.Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  aria-label={t("account.avatar.search")}
                  placeholder={t("account.avatar.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="avatar-picker__grid" role="group" aria-label={t("account.avatar.gridAria")}>
                {avatars.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    aria-label={t("account.avatar.use", { name: entry.name })}
                    aria-pressed={entry.id === selected}
                    aria-busy={pending === entry.id || undefined}
                    disabled={busy}
                    title={entry.name}
                    onClick={() => void choose(entry.id)}
                  >
                    <img
                      src={digimonAvatarUrl(entry.id)}
                      alt=""
                      width={150}
                      height={158}
                      loading="lazy"
                      decoding="async"
                    />
                    {entry.id === selected ? (
                      <span className="avatar-picker__check" aria-hidden="true">
                        <Icons.Check size={12} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <p className="avatar-picker__count">
                {avatars.length ? t("account.avatar.count", { count: avatars.length }) : t("account.avatar.empty")}
              </p>
            </>
          ) : null}
          {tab === "upload" && onUpload ? (
            <label
              className="avatar-picker__drop"
              data-dragging={dragging || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void choosePicture(file);
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void choosePicture(file);
                }}
              />
              <span className="avatar-picker__drop-mark" aria-hidden="true">
                <Icons.Upload size={24} />
              </span>
              <strong>{t("account.avatar.upload")}</strong>
              <small>{t("account.avatar.uploadHint")}</small>
            </label>
          ) : null}
          {tab === "discord" && discordLinked ? (
            <div className="avatar-picker__discord">
              <button
                type="button"
                className="avatar-picker__row"
                aria-pressed={selected === "discord"}
                disabled={busy}
                onClick={() => void choose("discord")}
              >
                <span className="avatar-picker__discord-mark" aria-hidden="true">
                  <Icons.Discord size={20} />
                </span>
                <span className="avatar-picker__row-label">{t("profile.avatarMenu.discord")}</span>
                <Icons.ChevronRight size={18} aria-hidden="true" />
              </button>
              {onRefreshDiscordAvatar ? (
                <button
                  type="button"
                  className="avatar-picker__refresh"
                  aria-busy={pending === "refresh" || undefined}
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <Icons.RotateCcw size={16} aria-hidden="true" />
                  {t("playerMenu.refreshDiscordAvatar")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {busy && pending !== "refresh" ? <p role="status">{t("account.avatar.saving")}</p> : null}
        {status ? <p role={status.alert ? "alert" : "status"}>{t(status.key)}</p> : null}
      </div>
    </Dialog>
  );
}

/** What the API stores for a menu choice. A guest has no Discord picture, so "default" is simply no avatar. */
export function avatarChoice(selection: AvatarSelection, signedIn: boolean): AvatarChoice {
  if (selection === "discord") return null;
  if (selection === "default") return signedIn ? "initials" : null;
  return selection;
}
