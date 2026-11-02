import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Avatar, type PlayerIdentity, type Screen } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import { DISCORD_INVITE_URL, GITHUB_REPO_URL } from "../community";
import "./playerMenu.css";

/** A nonmodal navigation disclosure. Identity editing belongs to the profile page. */
export function PlayerMenu({
  player,
  signedIn,
  isAdmin = false,
  anchor,
  onNav,
  onProfile,
  onChangeAvatar,
  onSignOut,
  onReportBug,
  onClose,
}: {
  player: PlayerIdentity;
  signedIn: boolean;
  isAdmin?: boolean;
  anchor?: HTMLElement | null;
  onNav: (screen: Screen) => void;
  onProfile: () => void;
  onChangeAvatar?: () => void;
  onSignOut?: () => void;
  onReportBug?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ top: 72, left: Math.max(8, window.innerWidth - 296) });
  useLayoutEffect(() => {
    const place = () => {
      const box = anchor?.getBoundingClientRect();
      setPosition({
        top: Math.max(8, Math.min(box ? box.bottom + 8 : 72, window.innerHeight - 160)),
        left: Math.max(8, Math.min(box ? box.right - 288 : window.innerWidth - 296, window.innerWidth - 296)),
      });
    };
    place();
    root.current?.querySelector<HTMLElement>("a, button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        anchor?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);
  function go(screen: Screen) {
    onClose();
    onNav(screen);
  }
  /** Keeps real links for new-tab use, but a plain click navigates inside the app without a reload. */
  function inApp(navigate: () => void) {
    return (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onClose();
      navigate();
    };
  }
  return createPortal(
    <section
      ref={root}
      id="player-menu"
      className="player-menu"
      style={{ ...position, maxHeight: `calc(100dvh - ${position.top + 8}px)` }}
      aria-label={t("playerMenu.linksAria")}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node) &&
          event.relatedTarget !== anchor
        )
          onClose();
      }}
    >
      <header>
        <Avatar
          name={player.name}
          avatarId={player.avatarId}
          avatarUrl={player.avatarUrl}
          color={player.color}
          size={36}
        />
        <div>
          <strong>{player.name}</strong>
          <small>{t(signedIn ? "playerMenu.signedIn" : "playerMenu.guest")}</small>
        </div>
      </header>
      <nav aria-label={t("playerMenu.linksAria")}>
        {signedIn ? (
          <a href="/friends" onClick={inApp(() => onNav("friends"))}>
            <Icons.User size={18} />
            {t("friends.title")}
          </a>
        ) : null}
        <a href="/profile" onClick={inApp(onProfile)}>
          <Icons.User size={18} />
          {t("profile.title")}
        </a>
        {onChangeAvatar ? (
          <button
            onClick={() => {
              onClose();
              onChangeAvatar();
            }}
          >
            <Icons.Pencil size={18} />
            {t("profile.changeAvatar")}
          </button>
        ) : null}
        <button onClick={() => go("settings")}>
          <Icons.Settings size={18} />
          {t("menu.settings")}
        </button>
        {signedIn ? (
          <button onClick={() => go("myFeedback")}>
            <Icons.Megaphone size={18} />
            {t("myFeedback.title")}
          </button>
        ) : null}
        {signedIn && isAdmin ? (
          <button onClick={() => go("feedback")}>
            <Icons.MessageSquare size={18} />
            {t("feedback.title")}
          </button>
        ) : null}
        <details>
          <summary>{t("profile.help")}</summary>
          <button onClick={() => go("releases")}>
            <Icons.Sparkles size={18} />
            {t("releases.nav")}
          </button>
          {onReportBug ? (
            <button
              onClick={() => {
                onClose();
                onReportBug();
              }}
            >
              <Icons.Megaphone size={18} />
              {t("bugReport.button")}
            </button>
          ) : null}
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
            <Icons.Discord size={18} />
            Discord
          </a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            <Icons.Github size={18} />
            GitHub
          </a>
          <a href="/privacy" onClick={inApp(() => onNav("privacy"))}>
            <Icons.ShieldCheck size={18} />
            {t("privacy.title")}
          </a>
        </details>
        {signedIn && onSignOut ? (
          <button className="player-menu__sign-out" onClick={onSignOut}>
            <Icons.LogOut size={18} />
            {t("playerMenu.signOut")}
          </button>
        ) : (
          <button onClick={() => go("login")}>
            <Icons.LogIn size={18} />
            {t("nav.signIn")}
          </button>
        )}
      </nav>
    </section>,
    document.body,
  );
}
