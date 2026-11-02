import { InputSurfaceEvent } from "@/design/InputSurfaceEvent";
/* Aegis shared chrome: the letterboxed 16:9 Stage, UI primitives, and the top nav.
   maintained as part of the Aegis design system. Presentational only. */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { COLORS, colorKey } from "./theme";
import { Icons, type IconComponent } from "./icons";
import { playSound, type SoundKind } from "./sound";
import { useTranslation } from "../i18n";
import { digimonAvatarUrl, type DigimonWorldAvatarId } from "../account/avatars";
import { AegisLogo } from "./AegisLogo";
import { AccountRoleBadge } from "@/account/roles/AccountRoleBadge";
import { AccountRoleTooltip } from "@/account/roles/AccountRoleTooltip";
import type { AccountRoleDefinition } from "@/account/roles/highestAccountRole";
import { BrowserSupportNotice } from "./BrowserSupportNotice";
import type { TranslationKey } from "@/i18n/translationTypes";

/** The lightweight identity carried across screens (name + accent color). */
export interface PlayerIdentity {
  name: string;
  color: string;
  shards: number;
  avatarId?: DigimonWorldAvatarId | null;
  avatarUrl?: string | null;
  /** Portrait a guest picked on this device; account avatars win over it. */
  guestAvatarId?: DigimonWorldAvatarId | null;
}

/** A screen key in the client router. */
export type Screen =
  | "friends"
  | "home"
  | "booster"
  | "login"
  | "lobby"
  | "story"
  | "learn"
  | "rules"
  | "watch"
  | "deck"
  | "collection"
  | "community"
  | "roadmap"
  | "tournaments"
  | "ranked"
  | "settings"
  | "replays"
  | "releases"
  | "feedback"
  | "privacy"
  | "myFeedback"
  | "notifications"
  | "game";

export function Stage({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div id="aegis-stage" className="aegis-stage">
      <a className="aegis-skip-link" href="#aegis-main">
        {t("nav.skipToContent")}
      </a>
      <BrowserSupportNotice />
      <div className="aegis-stage__content">{children}</div>
    </div>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

type AegisButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  full?: boolean;
  sound?: SoundKind | false;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  onClick,
  disabled,
  full,
  className,
  style,
  sound = "nav",
  type = "button",
  ...buttonProps
}: AegisButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={`aegis-button aegis-button--${variant} aegis-button--${size}${full ? " aegis-button--full" : ""}${className ? ` ${className}` : ""}`}
      onClick={
        disabled
          ? undefined
          : (event) => {
              if (sound) playSound(sound);
              onClick?.(event);
            }
      }
      disabled={disabled}
      style={style}
    >
      {Icon ? <Icon size={size === "lg" ? 18 : 16} /> : null}
      {children}
    </button>
  );
}

export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="aegis-eyebrow" style={color ? { color } : undefined}>
      {children}
    </div>
  );
}

export function Panel({
  children,
  className,
  style,
  pad = 20,
  hero = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  pad?: number;
  hero?: boolean;
}) {
  return (
    <div
      className={`aegis-panel${className ? ` ${className}` : ""}`}
      data-hero={hero || undefined}
      style={{ ...(pad != null ? { "--aegis-panel-pad": `${pad}px` } : {}), ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function Badge({
  children,
  className,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
  style?: CSSProperties;
}) {
  return (
    <span className={`aegis-badge${className ? ` ${className}` : ""}`} data-tone={tone} style={style}>
      {children}
    </span>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<AegisButtonProps, "children" | "icon"> & { label: string; children: ReactNode }) {
  return (
    <Button {...props} className={`aegis-icon-action${className ? ` ${className}` : ""}`} aria-label={label}>
      {children}
    </Button>
  );
}

export type AlertTone = "neutral" | "info" | "success" | "warning" | "danger";

export function Alert({
  children,
  className,
  title,
  tone = "neutral",
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  tone?: AlertTone;
}) {
  return (
    <div
      className={`aegis-alert${className ? ` ${className}` : ""}`}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <strong className="aegis-alert__title">{title}</strong> : null}
      {children ? <div className="aegis-alert__body">{children}</div> : null}
    </div>
  );
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Field({ className, error, hint, id: providedId, label, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const messageId = hint || error ? `${id}-message` : undefined;
  return (
    <div className={`aegis-field${className ? ` ${className}` : ""}`}>
      <label className="aegis-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        className="aegis-field__control"
        aria-describedby={messageId}
        aria-invalid={error ? true : undefined}
      />
      {error || hint ? (
        <span id={messageId} className="aegis-field__message" data-error={error ? true : undefined}>
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className="aegis-switch"
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="aegis-switch__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="aegis-switch__track" aria-hidden="true">
        <span className="aegis-switch__thumb" />
      </span>
    </button>
  );
}

// Safari does not focus a button when it is clicked or tapped, so
// document.activeElement still points at whatever had focus before (often a
// screen region) when a dialog opens from one. A control the pointer pressed
// just before the dialog opened is the element to refocus on close.
const PRESS_OPENS_DIALOG_MS = 1000;
let lastPress: { control: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>("button, [href], input, select, textarea, [tabindex]");
      lastPress = control ? { control, at: performance.now() } : null;
    },
    true,
  );
}

function focusToRestore(): HTMLElement | null {
  if (lastPress?.control.isConnected && performance.now() - lastPress.at < PRESS_OPENS_DIALOG_MS)
    return lastPress.control;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function Dialog({
  children,
  className,
  labelledBy,
  onClose,
  style,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose?: () => void;
  style?: CSSProperties;
  /** False for a form whose typed text a stray click outside would throw away. */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = focusToRestore();
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const surface = dialogRef.current;
    if (!onClose || !closeOnEscape) {
      return;
    }
    function cancelInput(event: Event) {
      event.preventDefault();
      onClose?.();
    }
    surface?.setAttribute("data-arena-cancelable", "");
    surface?.addEventListener(InputSurfaceEvent.CANCEL.value, cancelInput);
    return () => {
      surface?.removeAttribute("data-arena-cancelable");
      surface?.removeEventListener(InputSurfaceEvent.CANCEL.value, cancelInput);
    };
  }, [onClose, closeOnEscape]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      if (closeOnEscape) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  const layer = (
    <div className="aegis-dialog-layer" onClick={closeOnBackdrop ? onClose : undefined}>
      <section
        ref={dialogRef}
        className={`aegis-dialog${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={style}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
  // The layer covers the whole stage, so it belongs to the stage. Left where it was
  // opened, a dialog raised from a fixed bar was trapped in that bar's stacking
  // context and painted under the bars around it.
  const stage = typeof document === "undefined" ? null : document.getElementById("aegis-stage");
  return stage ? createPortal(layer, stage) : layer;
}

export function ColorDot({ color, size = 12, ring }: { color: string; size?: number; ring?: boolean }) {
  const c = COLORS[colorKey(color)];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: c.base,
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 2px var(--ds-sheet), 0 0 0 3px ${c.base}` : "none",
        display: "inline-block",
      }}
    />
  );
}

export function Avatar({
  name,
  color = "Blue",
  size = 40,
  ring,
  avatarId,
  avatarUrl,
}: {
  name: string;
  color?: string;
  size?: number;
  ring?: boolean;
  avatarId?: DigimonWorldAvatarId | null;
  avatarUrl?: string | null;
}) {
  const c = COLORS[colorKey(color)];
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const imageSources = [avatarId ? digimonAvatarUrl(avatarId) : undefined, avatarUrl].filter(
    (source, index, sources): source is string => Boolean(source) && sources.indexOf(source) === index,
  );
  const sourceKey = imageSources.join("\n");
  const [imageState, setImageState] = useState({ sourceKey, index: 0 });
  const imageIndex = imageState.sourceKey === sourceKey ? imageState.index : 0;
  const imageUrl = imageSources[imageIndex];
  // Digimon World portraits are card scans: printed frame, background scenery
  // and a pixel ornament around a small subject. Large tiles show the whole
  // card; small ones zoom past the frame onto the character, biased upward
  // where the head sits, or it reads as a smudge.
  const isCardPortrait = Boolean(avatarId) && imageIndex === 0;
  const cropsToSubject = isCardPortrait && size <= 96;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: isCardPortrait ? "18%" : "30%",
        flexShrink: 0,
        overflow: "hidden",
        background: isCardPortrait ? "transparent" : `linear-gradient(150deg, ${c.base}, ${c.edge})`,
        color: "#ffffff",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--ds-font-display)",
        fontWeight: 800,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2px var(--ds-paper), 0 0 0 4px ${c.base}` : "none",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          onError={() => setImageState({ sourceKey, index: imageIndex + 1 })}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: "inherit",
            objectFit: isCardPortrait && !cropsToSubject ? "contain" : "cover",
            transform: cropsToSubject ? "scale(1.38)" : undefined,
            transformOrigin: "50% 38%",
            imageRendering: isCardPortrait && size > 150 ? "pixelated" : "auto",
          }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

const AEGIS_MARK_SRC = "/branding/aegis-emblem.png";

/* Aegis crest rendered from the current brand mark. */
export function AegisMark({ size = 32 }: { size?: number }) {
  return (
    <img src={AEGIS_MARK_SRC} alt="" width={size} height={size} style={{ display: "block", objectFit: "contain" }} />
  );
}

export function Logo({ size = 26, sub = true }: { size?: number; sub?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="aegis-logo" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <AegisMark size={size + 8} />
      <div className="aegis-logo__copy" style={{ lineHeight: 1 }}>
        <div
          className="aegis-logo__wordmark"
          style={{
            color: "var(--ds-text)",
            fontFamily: "var(--ds-font-display)",
            fontSize: Math.round(size * 0.9),
            fontWeight: 900,
            letterSpacing: "0.08em",
            lineHeight: 0.9,
            textShadow: "none",
          }}
        >
          AEGIS
        </div>
        {sub ? (
          <div
            className="aegis-logo__subtitle"
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 8.5,
              letterSpacing: "0.32em",
              color: "var(--ds-text-3)",
              marginTop: 2,
            }}
          >
            {t("brand.subtitle")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NavItem({
  item,
  active,
  onSelect,
  compact = false,
  raised = false,
}: {
  item: { label: string; icon: IconComponent };
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
  raised?: boolean;
}) {
  const icon = raised ? (
    <span className="aegis-nav-item__raised">
      <item.icon size={22} />
    </span>
  ) : (
    <item.icon size={22} />
  );
  return (
    <button
      className={`aegis-nav-item${compact ? " aegis-nav-item--compact" : ""}${raised ? " aegis-nav-item--raised" : ""}`}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
    >
      {compact ? icon : null}
      {compact ? <span className="aegis-nav-item__label">{item.label}</span> : item.label}
    </button>
  );
}

type NavEntry = { key: Screen; label: string; icon: IconComponent };

const SCREEN_SECTIONS: Partial<Record<Screen, Screen>> = {
  ranked: "lobby",
  watch: "lobby",
  story: "lobby",
  learn: "lobby",
  rules: "lobby",
  roadmap: "community",
  booster: "collection",
};

function getNavSection(screen: Screen): Screen {
  return SCREEN_SECTIONS[screen] ?? screen;
}

export function TopNav({
  screen,
  onNav,
  player,
  actions,
  signedIn = false,
  role,
  onOpenPlayerMenu,
  playerMenuOpen,
  dark,
  onToggleDark,
  onOpenTheme,
  onSendFeedback,
  notifications,
  friends,
  music,
}: {
  screen: Screen;
  onNav: (s: Screen) => void;
  player: PlayerIdentity;
  actions?: ReactNode;
  notifications?: ReactNode;
  friends?: ReactNode;
  signedIn?: boolean;
  role?: AccountRoleDefinition;
  onOpenPlayerMenu?: (anchor: HTMLButtonElement) => void;
  playerMenuOpen?: boolean;
  dark?: boolean;
  onToggleDark?: (dark: boolean) => void;
  onOpenTheme?: () => void;
  onSendFeedback?: () => void;
  music?: ReactNode;
}) {
  const { t } = useTranslation();
  const section = getNavSection(screen);
  const navTo = (s: Screen) => {
    playSound("nav");
    onNav(s);
  };
  const entries: Record<"home" | "lobby" | "tournaments" | "deck" | "collection" | "community", NavEntry> = {
    home: { key: "home", label: t("nav.home"), icon: Icons.House },
    lobby: { key: "lobby", label: t("nav.play"), icon: Icons.Swords },
    tournaments: { key: "tournaments", label: t("nav.tournaments"), icon: Icons.Trophy },
    deck: { key: "deck", label: t("nav.decks"), icon: Icons.Cards },
    collection: { key: "collection", label: t("nav.collection"), icon: Icons.BookOpen },
    community: { key: "community", label: t("nav.community"), icon: Icons.Globe },
  };
  const wideItems = [
    entries.home,
    entries.lobby,
    entries.tournaments,
    entries.deck,
    entries.collection,
    entries.community,
  ];
  const tabItems = [entries.home, entries.deck, entries.lobby, entries.collection, entries.tournaments];
  const signIn = signedIn ? null : (
    <button className="aegis-sign-in-button" onClick={() => navTo("login")} aria-label={t("nav.signIn")}>
      <Icons.LogIn size={16} />
      <span>{t("nav.signIn")}</span>
    </button>
  );
  const themeLabel = getThemeToggleLabel({ palette: Boolean(onOpenTheme), dark: Boolean(dark) });
  const themeToggle =
    onOpenTheme || onToggleDark ? (
      <button
        className="aegis-icon-button aegis-theme-toggle"
        onClick={() => (onOpenTheme ? onOpenTheme() : onToggleDark?.(!dark))}
        aria-haspopup={onOpenTheme ? "dialog" : undefined}
        aria-label={t(themeLabel)}
        title={t(themeLabel)}
      >
        {dark ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
      </button>
    ) : null;

  const feedback = onSendFeedback ? (
    <button
      className="aegis-icon-button aegis-feedback-button"
      onClick={onSendFeedback}
      aria-haspopup="dialog"
      aria-label={t("bugReport.button")}
      title={t("bugReport.button")}
    >
      <Icons.Megaphone size={18} />
    </button>
  ) : null;

  const portraitLabel = role ? `${t("playerMenu.open")} (${t(role.labelKey)})` : t("playerMenu.open");
  const portraitButton = (size: number) => (
    <button
      className="aegis-portrait-button"
      onClick={(event) => {
        playSound("nav");
        onOpenPlayerMenu?.(event.currentTarget);
      }}
      aria-expanded={playerMenuOpen ?? false}
      aria-controls={playerMenuOpen ? "player-menu" : undefined}
      aria-label={portraitLabel}
      title={role ? undefined : portraitLabel}
    >
      <Avatar
        name={player.name}
        color={player.color}
        avatarId={player.avatarId}
        avatarUrl={player.avatarUrl}
        size={size}
      />
      {role ? <AccountRoleBadge role={role.value} /> : null}
    </button>
  );
  const portrait = (size: number) =>
    role ? <AccountRoleTooltip role={role}>{portraitButton(size)}</AccountRoleTooltip> : portraitButton(size);

  return (
    <>
      <header className="aegis-top-nav">
        <div className="aegis-top-nav__primary">
          <button className="aegis-brand-button" onClick={() => navTo("home")} aria-label={t("nav.home")}>
            <AegisLogo size={32} tone="on-surface" />
          </button>
          <nav className="aegis-top-nav__links" aria-label={t("nav.primaryAria")}>
            {wideItems.map((it) => (
              <NavItem key={it.key} item={it} active={section === it.key} onSelect={() => navTo(it.key)} />
            ))}
          </nav>
        </div>
        <div className="aegis-top-nav__account">
          {actions}
          {friends}
          {notifications}
          {feedback}
          {music}
          {themeToggle}
          {signIn}
          {portrait(32)}
        </div>
      </header>
      <header className="aegis-mobile-bar">
        <button className="aegis-brand-button" onClick={() => navTo("home")} aria-label={t("nav.home")}>
          <AegisLogo size={28} tone="on-surface" />
        </button>
        <div className="aegis-mobile-bar__actions">
          <button
            className="aegis-icon-button"
            onClick={() => navTo("community")}
            aria-label={entries.community.label}
            aria-current={section === "community" ? "page" : undefined}
          >
            <Icons.Globe size={18} />
          </button>
          {friends}
          {notifications}
          {feedback}
          {music}
          {themeToggle}
          {signIn}
          {portrait(30)}
        </div>
      </header>
      <nav className="aegis-bottom-nav" aria-label={t("nav.primaryAria")}>
        {tabItems.map((it) => (
          <NavItem
            key={it.key}
            item={it}
            active={section === it.key}
            onSelect={() => navTo(it.key)}
            compact
            raised={it.key === "lobby"}
          />
        ))}
      </nav>
    </>
  );
}

type ThemeToggleLabelParams = { palette: boolean; dark: boolean };

function getThemeToggleLabel({ palette, dark }: ThemeToggleLabelParams): TranslationKey {
  if (palette) {
    return "redesign.shell.theme.title";
  }
  if (dark) {
    return "redesign.shell.theme.useLight";
  }
  return "redesign.shell.theme.useDark";
}
