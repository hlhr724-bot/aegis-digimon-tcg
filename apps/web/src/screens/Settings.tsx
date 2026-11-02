import { ArenaAppearanceControls } from "@/design/arenaAppearance/ArenaAppearanceControls";
import { useTamerGrouping } from "@/design/tamerGrouping/useTamerGrouping";
import { setTamerGroupingEnabled } from "@/design/tamerGrouping/setTamerGroupingEnabled";
import { SpectatorAccessSetting } from "@/account/SpectatorAccessSetting";
import { cardConfirmationModeLabelKey } from "@/game/cardConfirmation/cardConfirmationModeLabelKey";
import { cardConfirmationModeValues } from "@/game/cardConfirmation/cardConfirmationModeValues";
import { cardConfirmationPreference } from "@/game/cardConfirmation/cardConfirmationPreference";
import { CardLanguageSettings } from "@/screens/cardLanguage/CardLanguageSettings";
import type { DeckListing } from "@/game/decks";
import { SpectatorIdentitySetting } from "@/account/SpectatorIdentitySetting";
import { TokenArtPicker } from "@/design/tokenArt/TokenArtPicker";
import { ShareDeckAfterMatchSetting } from "@/account/ShareDeckAfterMatchSetting";
import { LiveMatchListingSetting } from "@/account/LiveMatchListingSetting";
import { CustomMusicPicker } from "../design/CustomMusicPicker";
import { MusicCredits } from "../design/MusicCredits";
import { InterfaceThemeDialog } from "../design/InterfaceThemePicker";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Avatar, Button, Eyebrow, Switch, type PlayerIdentity } from "../design/primitives";
import { Panel, SectionHeading } from "../design/surfaces";
import { ArenaLookSettings } from "../design/ArenaLookSettings";
import { Icons, type IconComponent } from "../design/icons";
import { getInterfaceColors, useInterfaceTheme } from "../design/interfaceTheme";
import {
  getMusicVolume,
  setMusicTrack,
  setMusicEnabled,
  setMusicVolume,
  getSoundVolume,
  isSoundEnabled,
  playSound,
  setSoundEnabled,
  setSoundVolume,
  unlockAudio,
  useMusicEnabled,
  useMusicTrack,
} from "../design/sound";
import { MUSIC_TRACK_LABEL_KEYS, MUSIC_TRACKS } from "../design/musicTracks";
import { setEffectConfirmationHoldEnabled, useEffectConfirmationHold } from "../game/effectConfirmationHold";
import { isKeepAwakeEnabled, setKeepAwakeEnabled } from "../design/keepAwake";
import { isDecisionPingEnabled, setDecisionPingEnabled } from "@/design/decisionPing";
import { FieldLayout, setFieldLayout, useFieldLayout } from "../design/fieldLayout";
import { setPileCountsShown, usePileCountsShown } from "../design/pileCounts";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";
import { useHoverZoomPreference } from "@/design/useHoverZoomPreference";
import { setChatSoundEnabled, useChatSoundEnabled } from "../game/chat/chatSound";
import { CardSleevePicker, EggSleevePicker } from "../design/sleevePicker";
import { TEXT_SCALES, setTextScale, useTextScale, type TextScale } from "../design/textScale";
import { SEQUENTIAL_PACING_ENABLED } from "../features";
import { EFFECT_SPEEDS, getEffectSpeed, setEffectSpeed, type EffectSpeed } from "../game/pacing";
import {
  EFFECT_PROMPT_POSITIONS,
  setEffectPromptPosition,
  useEffectPromptPosition,
} from "../game/effectPromptPosition";
import { setHandAutoSortEnabled, useHandAutoSort } from "../game/handAutoSort";
import { NOTICE_DURATION_LABELS, NOTICE_DURATIONS, setNoticeDuration, useNoticeDuration } from "../game/noticeDuration";
import { MatchLogDisplay } from "@/game/log/MatchLogDisplay";
import { matchLogDisplayPreference } from "@/game/log/matchLogDisplayPreference";
import { useMatchLogDisplay } from "@/game/log/useMatchLogDisplay";
import { SOUND_SETTINGS_SECTION_ID } from "@/screens/soundSettingsSectionId";
import { LOCALES, LOCALE_LABELS, useTranslation, type TranslationKey } from "../i18n";
import type { RemoteAccount } from "../account/client";
import { setProfileStatsShown, useProfileStatsShown } from "../account/profileStats";
import { useCloudReplays } from "../replays/cloud";
import { CloudReplaySettings } from "../replays/cloud/CloudReplaySettings";
import "./settings.css";
import { motionPreference } from "@/design/motion/motionPreference";
import { motionModeLabelKey } from "@/design/motion/motionModeLabelKey";
import { motionModeValues } from "@/design/motion/motionModeValues";

const TEXT_SCALE_LABELS: Record<TextScale, TranslationKey> = {
  default: "settings.textSizeDefault",
  large: "settings.textSizeLarge",
  larger: "settings.textSizeLarger",
};

interface SettingsSection {
  id: string;
  label: TranslationKey;
  icon: IconComponent;
}

const REPLAYS_SECTION_ID = "settings-replays";
const PROFILE_SECTION_ID = "settings-profile";

const SECTIONS: readonly SettingsSection[] = [
  { id: "settings-appearance", label: "settings.sectionAppearance", icon: Icons.Palette },
  { id: "settings-language", label: "redesign.settings.languageText", icon: Icons.FileText },
  { id: "settings-sleeves", label: "settings.cardSleeve", icon: Icons.LayoutGrid },
  { id: "settings-token-art", label: "settings.tokenArt", icon: Icons.LayoutGrid },
  { id: REPLAYS_SECTION_ID, label: "replay.drive.settingsTitle", icon: Icons.Cloud },
  { id: SOUND_SETTINGS_SECTION_ID, label: "redesign.settings.sound", icon: Icons.Play },
  { id: PROFILE_SECTION_ID, label: "profile.title", icon: Icons.User },
  { id: "settings-gameplay", label: "settings.sectionGameplay", icon: Icons.Swords },
  { id: "settings-arena", label: "redesign.settings.arena", icon: Icons.Map },
];

type ScrollToSectionParams = {
  root: HTMLElement;
  section: HTMLElement;
  behavior: ScrollBehavior;
};

function scrollToSection({ root, section, behavior }: ScrollToSectionParams): void {
  const margin = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
  const top = root.scrollTop + section.getBoundingClientRect().top - root.getBoundingClientRect().top - margin;
  root.scrollTo({ top, behavior });
  section.focus({ preventScroll: true });
}

/** Highlights the section nearest the top of the scrolling page. */
function useActiveSection(sections: readonly SettingsSection[], root: HTMLElement | null) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = sections.find((section) => visible.has(section.id));
        if (first) setActiveId(first.id);
      },
      { root, rootMargin: "-80px 0px -55% 0px" },
    );
    for (const { id } of sections) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [root, sections]);
  return [activeId, setActiveId] as const;
}

function SettingsNav({ sections, root }: { sections: readonly SettingsSection[]; root: HTMLElement | null }) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useActiveSection(sections, root);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const outside =
      link.offsetLeft < list.scrollLeft || link.offsetLeft + link.offsetWidth > list.scrollLeft + list.clientWidth;
    if (outside) list.scrollLeft = link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2;
  }, [activeId]);

  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id);
    if (!section || !root) return;
    // The app routes on pathname; a hash change would fire popstate, so scroll without one.
    // scrollIntoView would also scroll the app's overflow-hidden stage, so scroll only the page.
    event.preventDefault();
    setActiveId(id);
    scrollToSection({ root, section, behavior: motionPreference.isReduced() ? "auto" : "smooth" });
  }

  return (
    <nav className="settings-nav" aria-label={t("redesign.settings.sections")}>
      <ul ref={listRef}>
        {sections.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="settings-nav__link"
              aria-current={activeId === id ? "location" : undefined}
              onClick={(event) => jump(event, id)}
            >
              <Icon size={18} />
              <span>{t(label)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SettingsCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="settings-card" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <SectionHeading id={`${id}-title`} title={title} />
      <div className="settings-list">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  labelId,
  description,
  stacked,
  children,
}: {
  label: ReactNode;
  labelId?: string;
  description?: ReactNode;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={stacked ? "settings-row settings-row--stack" : "settings-row"}>
      <div className="settings-row__copy">
        <strong id={labelId}>{label}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function OptionList<T extends string>({
  options,
  selected,
  labelledBy,
  label,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  labelledBy: string;
  label: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return (
    <div className="settings-option-list" role="group" aria-labelledby={labelledBy}>
      {options.map((option) => {
        const on = selected === option;
        return (
          <button
            key={option}
            type="button"
            className="settings-option"
            aria-pressed={on}
            onClick={() => onSelect(option)}
          >
            {label(option)}
            {on ? <Icons.Check size={16} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwatches({ dark }: { dark: boolean }) {
  useInterfaceTheme();
  const colors = getInterfaceColors(dark);
  return (
    <span className="settings-swatches" aria-hidden="true">
      {[colors.accent, colors.text, colors.header, colors.background].map((color, index) => (
        <span key={index} style={{ background: color }} />
      ))}
    </span>
  );
}

export function Settings({
  player,
  account,
  dark,
  onToggleDark,
  initialSectionId,
  decks = [],
  decksReady = false,
  onSaveDeckLanguage,
}: {
  player: PlayerIdentity;
  account: RemoteAccount | null | undefined;
  dark: boolean;
  onToggleDark: (v: boolean) => void;
  initialSectionId?: string;
  decks?: readonly DeckListing[];
  decksReady?: boolean;
  onSaveDeckLanguage?: (deck: DeckListing) => Promise<void>;
}) {
  const { t, locale, setLocale } = useTranslation();
  const textScale = useTextScale();
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const musicOn = useMusicEnabled();
  const [musicVolume, setMusicVolumeChoice] = useState(Math.round(getMusicVolume() * 100));
  const musicTrack = useMusicTrack();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [volume, setVolume] = useState(Math.round(getSoundVolume() * 100));
  const cardConfirmationMode = cardConfirmationPreference.useMode();
  const motionMode = motionPreference.useMode();
  const effectConfirmationHold = useEffectConfirmationHold();
  const [keepAwakeOn, setKeepAwakeOn] = useState(isKeepAwakeEnabled());
  const [decisionPingOn, setDecisionPingOn] = useState(isDecisionPingEnabled());
  const [effectSpeed, setEffectSpeedChoice] = useState<EffectSpeed>(getEffectSpeed);
  const effectSpeedLabels: Record<EffectSpeed, string> = {
    slow: t("settings.effectSpeedSlow"),
    normal: t("settings.effectSpeedNormal"),
    fast: t("settings.effectSpeedFast"),
  };
  const fieldLayout = useFieldLayout();
  const groupIdenticalTamers = useTamerGrouping();
  const pileCountsShown = usePileCountsShown();
  const hoverZoom = useHoverZoomPreference();
  const chatSoundEnabled = useChatSoundEnabled();
  const handAutoSort = useHandAutoSort();
  const effectPromptPosition = useEffectPromptPosition();
  const noticeDuration = useNoticeDuration();
  const matchLogDisplay = useMatchLogDisplay();
  const profileStatsShown = useProfileStatsShown();
  const hasCloudReplays = useCloudReplays().provider !== undefined;
  const signedIn = Boolean(account);
  const sections = useMemo(
    () =>
      SECTIONS.filter(
        (section) =>
          (hasCloudReplays || section.id !== REPLAYS_SECTION_ID) && (signedIn || section.id !== PROFILE_SECTION_ID),
      ),
    [hasCloudReplays, signedIn],
  );
  useEffect(() => {
    const section = initialSectionId ? document.getElementById(initialSectionId) : null;
    if (!page || !section) {
      return;
    }
    scrollToSection({ root: page, section, behavior: "auto" });
  }, [page, initialSectionId]);
  const accountStatus = account ? t("account.connected") : account === null ? t("redesign.settings.guest") : null;

  return (
    <main className="settings-page" ref={setPage}>
      <div className="settings-shell aegis-page-sheet aegis-page-sheet--padded">
        <Panel as="header" className="settings-hero">
          <Avatar
            name={player.name}
            color={player.color}
            avatarId={player.avatarId ?? player.guestAvatarId}
            avatarUrl={player.avatarUrl}
            size={56}
          />
          <div className="settings-hero__copy">
            <Eyebrow>{t("settings.eyebrow")}</Eyebrow>
            <h1 className="aegis-page-title">{t("settings.title")}</h1>
            <p className="aegis-hero-panel__muted settings-hero__identity">
              <span className="settings-hero__name">{player.name}</span>
              {accountStatus ? <span>{accountStatus}</span> : null}
            </p>
          </div>
        </Panel>

        <div className="settings-layout">
          <SettingsNav sections={sections} root={page} />

          <div className="settings-content">
            <SettingsCard id="settings-appearance" title={t("settings.sectionAppearance")}>
              <div className="settings-row">
                <Switch
                  checked={dark}
                  label={t("mobile.settings.darkMode")}
                  description={t("mobile.settings.darkModeDesc")}
                  onChange={onToggleDark}
                />
              </div>
              <SettingRow label={t("redesign.shell.theme.title")} description={t("redesign.shell.theme.description")}>
                <ThemeSwatches dark={dark} />
                <Button variant="secondary" size="sm" onClick={() => setThemeOpen(true)} aria-haspopup="dialog">
                  {t("redesign.shell.theme.choose")}
                </Button>
              </SettingRow>
              <SettingRow
                label={t("settings.motion")}
                labelId="settings-motion-label"
                description={t("settings.motionDesc")}
              >
                <OptionList
                  options={motionModeValues}
                  selected={motionMode}
                  labelledBy="settings-motion-label"
                  label={(mode) => t(motionModeLabelKey(mode))}
                  onSelect={motionPreference.setMode}
                />
              </SettingRow>
            </SettingsCard>

            <SettingsCard id="settings-language" title={t("redesign.settings.languageText")}>
              <SettingRow
                label={t("settings.language")}
                labelId="settings-language-label"
                description={t("settings.languageDesc")}
              >
                <OptionList
                  options={LOCALES}
                  selected={locale}
                  labelledBy="settings-language-label"
                  label={(option) => LOCALE_LABELS[option]}
                  onSelect={setLocale}
                />
              </SettingRow>
              {onSaveDeckLanguage && (
                <CardLanguageSettings decks={decks} ready={decksReady} onSave={onSaveDeckLanguage} />
              )}
              <SettingRow
                label={t("settings.textSize")}
                labelId="settings-text-size-label"
                description={t("settings.textSizeDesc")}
              >
                <OptionList
                  options={TEXT_SCALES}
                  selected={textScale}
                  labelledBy="settings-text-size-label"
                  label={(option) => t(TEXT_SCALE_LABELS[option])}
                  onSelect={setTextScale}
                />
              </SettingRow>
            </SettingsCard>

            <SettingsCard id="settings-arena-accessibility" title={t("redesign.arena.board.title")}>
              <ArenaAppearanceControls />
            </SettingsCard>

            <SettingsCard id="settings-sleeves" title={t("settings.cardSleeve")}>
              <div className="settings-row settings-row--stack">
                <p className="settings-row__lede">{t("settings.cardSleeveDesc")}</p>
                <CardSleevePicker />
              </div>
              <SettingRow stacked label={t("settings.eggSleeve")} description={t("settings.eggSleeveDesc")}>
                <EggSleevePicker />
              </SettingRow>
            </SettingsCard>

            <SettingsCard id="settings-token-art" title={t("settings.tokenArt")}>
              <div className="settings-row settings-row--stack">
                <p className="settings-row__lede">{t("settings.tokenArtDesc")}</p>
                <TokenArtPicker />
              </div>
            </SettingsCard>

            <CloudReplaySettings />

            <SettingsCard id="settings-sound" title={t("redesign.settings.sound")}>
              <div className="settings-row">
                <Switch
                  checked={soundOn}
                  label={t("settings.sound")}
                  description={t("settings.soundDesc")}
                  onChange={(next) => {
                    setSoundEnabled(next);
                    setSoundOn(next);
                    if (next) playSound("confirm");
                  }}
                />
              </div>
              <div className="settings-row settings-volume" data-disabled={!soundOn || undefined}>
                <label className="settings-volume__heading" htmlFor="settings-sound-volume">
                  <span>{t("settings.volume")}</span>
                  <span className="settings-volume__value">{volume}</span>
                </label>
                <input
                  id="settings-sound-volume"
                  aria-label={t("settings.volume")}
                  name="soundVolume"
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  disabled={!soundOn}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    setSoundVolume(next / 100);
                  }}
                  onPointerUp={() => soundOn && playSound("select")}
                  className="settings-volume__control"
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={chatSoundEnabled}
                  disabled={!soundOn}
                  label={t("chat.sound")}
                  description={t("chat.soundDesc")}
                  onChange={(next) => {
                    setChatSoundEnabled(next);
                    if (next) {
                      playSound("prompt");
                    }
                  }}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={decisionPingOn}
                  disabled={!soundOn}
                  label={t("settings.decisionPing")}
                  description={t("settings.decisionPingDesc")}
                  onChange={(next) => {
                    setDecisionPingEnabled(next);
                    setDecisionPingOn(next);
                    if (next) {
                      playSound("prompt");
                    }
                  }}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={musicOn}
                  label={t("settings.music")}
                  description={t("settings.musicDesc")}
                  onChange={(next) => {
                    unlockAudio();
                    setMusicEnabled(next);
                  }}
                />
              </div>
              <div className="settings-row settings-volume" data-disabled={!musicOn || undefined}>
                <label className="settings-volume__heading" htmlFor="settings-music-volume">
                  <span>{t("settings.musicVolume")}</span>
                  <span className="settings-volume__value">{musicVolume}</span>
                </label>
                <input
                  id="settings-music-volume"
                  aria-label={t("settings.musicVolume")}
                  name="musicVolume"
                  type="range"
                  min={0}
                  max={100}
                  value={musicVolume}
                  disabled={!musicOn}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setMusicVolumeChoice(next);
                    setMusicVolume(next / 100);
                  }}
                  className="settings-volume__control"
                />
              </div>
              <SettingRow
                stacked
                label={t("settings.musicTrack")}
                labelId="settings-music-track-label"
                description={t("settings.musicTrackDesc")}
              >
                <OptionList
                  options={MUSIC_TRACKS}
                  selected={musicTrack}
                  labelledBy="settings-music-track-label"
                  label={(track) => t(MUSIC_TRACK_LABEL_KEYS[track])}
                  onSelect={(track) => {
                    setMusicTrack(track);
                  }}
                />
                <MusicCredits track={musicTrack} />
              </SettingRow>
              <div className="settings-row">
                <CustomMusicPicker />
              </div>
            </SettingsCard>

            {signedIn ? (
              <SettingsCard id={PROFILE_SECTION_ID} title={t("profile.title")}>
                <ShareDeckAfterMatchSetting key={account?.id} />
                <LiveMatchListingSetting key={`live-${account?.id}`} />
                <SpectatorAccessSetting key={`spectator-${account?.id}`} />
                <SpectatorIdentitySetting key={`identity-${account?.id}`} />
                <div className="settings-row">
                  <Switch
                    checked={profileStatsShown}
                    label={t("profile.showStats")}
                    description={t("profile.showStatsDesc")}
                    onChange={setProfileStatsShown}
                  />
                </div>
              </SettingsCard>
            ) : null}

            <SettingsCard id="settings-gameplay" title={t("settings.sectionGameplay")}>
              <SettingRow
                label={t("settings.cardConfirmation")}
                labelId="settings-card-confirmation-label"
                description={t("settings.cardConfirmationDesc")}
              >
                <OptionList
                  options={cardConfirmationModeValues}
                  selected={cardConfirmationMode}
                  labelledBy="settings-card-confirmation-label"
                  label={(mode) => t(cardConfirmationModeLabelKey(mode))}
                  onSelect={cardConfirmationPreference.setMode}
                />
              </SettingRow>
              <div className="settings-row">
                <Switch
                  checked={effectConfirmationHold}
                  label={t("settings.effectConfirmationHold")}
                  description={t("settings.effectConfirmationHoldDesc")}
                  onChange={setEffectConfirmationHoldEnabled}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={keepAwakeOn}
                  label={t("settings.keepAwake")}
                  description={t("settings.keepAwakeDesc")}
                  onChange={(next) => {
                    setKeepAwakeEnabled(next);
                    setKeepAwakeOn(next);
                  }}
                />
              </div>
              <SettingRow
                label={t("settings.effectPromptPosition")}
                labelId="settings-effect-position-label"
                description={t("settings.effectPromptPositionDesc")}
              >
                <OptionList
                  options={EFFECT_PROMPT_POSITIONS}
                  selected={effectPromptPosition}
                  labelledBy="settings-effect-position-label"
                  label={(position) =>
                    t(position === "center" ? "settings.effectPromptCenter" : "settings.effectPromptLeft")
                  }
                  onSelect={setEffectPromptPosition}
                />
              </SettingRow>
              {SEQUENTIAL_PACING_ENABLED ? (
                <SettingRow
                  label={t("settings.effectSpeed")}
                  labelId="settings-effect-speed-label"
                  description={t("settings.effectSpeedDesc")}
                >
                  <OptionList
                    options={EFFECT_SPEEDS}
                    selected={effectSpeed}
                    labelledBy="settings-effect-speed-label"
                    label={(speed) => effectSpeedLabels[speed]}
                    onSelect={(speed) => {
                      setEffectSpeed(speed);
                      setEffectSpeedChoice(speed);
                    }}
                  />
                </SettingRow>
              ) : null}
              <SettingRow
                label={t("settings.noticeDuration")}
                labelId="settings-notice-duration-label"
                description={t("settings.noticeDurationDesc")}
              >
                <OptionList
                  options={NOTICE_DURATIONS}
                  selected={noticeDuration}
                  labelledBy="settings-notice-duration-label"
                  label={(duration) => t(NOTICE_DURATION_LABELS[duration])}
                  onSelect={setNoticeDuration}
                />
              </SettingRow>
              <SettingRow
                label={t("settings.matchLogDisplay")}
                labelId="settings-match-log-display-label"
                description={t("settings.matchLogDisplayDesc")}
              >
                <OptionList
                  options={Object.values(MatchLogDisplay).map((entry) => entry.value)}
                  selected={matchLogDisplay.value}
                  labelledBy="settings-match-log-display-label"
                  label={(display) =>
                    t(
                      Object.values(MatchLogDisplay).find((entry) => entry.value === display)?.labelKey ??
                        MatchLogDisplay.POPUPS.labelKey,
                    )
                  }
                  onSelect={matchLogDisplayPreference.set}
                />
              </SettingRow>
              <div className="settings-row">
                <Switch
                  checked={fieldLayout === FieldLayout.Organized}
                  label={t("settings.organizedField")}
                  description={t("settings.organizedFieldDesc")}
                  onChange={(next) => setFieldLayout(next ? FieldLayout.Organized : FieldLayout.Classic)}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={groupIdenticalTamers}
                  label={t("settings.groupIdenticalTamers")}
                  description={t("settings.groupIdenticalTamersDesc")}
                  onChange={setTamerGroupingEnabled}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={handAutoSort}
                  label={t("settings.handAutoSort")}
                  description={t("settings.handAutoSortDesc")}
                  onChange={setHandAutoSortEnabled}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={pileCountsShown}
                  label={t("settings.pileCounts")}
                  description={t("settings.pileCountsDesc")}
                  onChange={setPileCountsShown}
                />
              </div>
              <div className="settings-row">
                <Switch
                  checked={hoverZoom}
                  label={t("settings.hoverZoom")}
                  description={t("settings.hoverZoomDesc")}
                  onChange={hoverZoomPreference.setEnabled}
                />
              </div>
            </SettingsCard>

            <section id="settings-arena" className="settings-card" aria-labelledby="settings-arena-title" tabIndex={-1}>
              <SectionHeading id="settings-arena-title" title={t("redesign.settings.arena")} />
              <ArenaLookSettings />
            </section>
          </div>
        </div>
      </div>

      {themeOpen ? (
        <InterfaceThemeDialog dark={dark} onToggleDark={onToggleDark} onClose={() => setThemeOpen(false)} />
      ) : null}
    </main>
  );
}
