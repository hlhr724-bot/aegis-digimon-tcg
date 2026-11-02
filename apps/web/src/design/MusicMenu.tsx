import { InputSurfaceEvent } from "@/design/InputSurfaceEvent";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Icons } from "@/design/icons";
import { MUSIC_TRACK_LABEL_KEYS, MUSIC_TRACKS, type MusicTrack } from "@/design/musicTracks";
import { Switch } from "@/design/primitives";
import {
  setCustomMusicFile,
  setMusicEnabled,
  setMusicTrack,
  unlockAudio,
  useCustomMusicName,
  useMusicEnabled,
  useMusicTrack,
} from "@/design/sound";
import { useTranslation } from "@/i18n/useTranslation";
import "@/design/musicMenu.css";

type MusicMenuProps = {
  onOpenSoundSettings: () => void;
};

const MUSIC_FILE_TYPES = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac";

export function MusicMenu({ onOpenSoundSettings }: MusicMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fileRejected, setFileRejected] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const musicOn = useMusicEnabled();
  const track = useMusicTrack();
  const customName = useCustomMusicName();

  useEffect(() => {
    if (!open) {
      return;
    }
    panel.current?.querySelector<HTMLElement>("button, input")?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setOpen(false);
      button.current?.focus();
    };
    const surface = panel.current;
    const cancelInput = (event: Event) => {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    surface?.setAttribute("data-arena-cancelable", "");
    surface?.addEventListener(InputSurfaceEvent.CANCEL.value, cancelInput);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      surface?.removeAttribute("data-arena-cancelable");
      surface?.removeEventListener(InputSurfaceEvent.CANCEL.value, cancelInput);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleMusic = (next: boolean) => {
    unlockAudio();
    setMusicEnabled(next);
  };

  const selectTrack = (next: MusicTrack) => {
    unlockAudio();
    setFileRejected(false);
    setMusicTrack(next);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    unlockAudio();
    setFileRejected(!setCustomMusicFile(file));
  };

  const openSoundSettings = () => {
    setOpen(false);
    onOpenSoundSettings();
  };

  const label = t("redesign.shell.music.open");

  return (
    <div className="aegis-music-menu" ref={root}>
      <button
        ref={button}
        className="aegis-icon-button aegis-music-menu__button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icons.Music size={18} />
      </button>
      {open ? (
        <section ref={panel} id={panelId} className="aegis-music-menu__panel" role="dialog" aria-labelledby={titleId}>
          <h2 id={titleId} className="aegis-music-menu__title">
            {t("settings.musicTrack")}
          </h2>
          <div className="aegis-music-menu__body">
            <Switch
              checked={musicOn}
              label={t("settings.music")}
              description={t("settings.musicDesc")}
              onChange={toggleMusic}
            />
            <div className="aegis-music-menu__tracks" role="radiogroup" aria-labelledby={titleId}>
              {MUSIC_TRACKS.map((option) => (
                <label key={option} className="aegis-music-menu__track">
                  <input
                    type="radio"
                    name={`${panelId}-track`}
                    checked={!customName && track === option}
                    onChange={() => selectTrack(option)}
                  />
                  <span>{t(MUSIC_TRACK_LABEL_KEYS[option])}</span>
                </label>
              ))}
              {customName ? (
                <label className="aegis-music-menu__track">
                  <input type="radio" name={`${panelId}-track`} checked readOnly />
                  <span className="aegis-music-menu__custom">
                    <span className="aegis-music-menu__custom-name">{customName}</span>
                    <small>{t("settings.customMusic")}</small>
                  </span>
                </label>
              ) : null}
            </div>
            <button className="aegis-music-menu__text-button" onClick={() => fileInput.current?.click()}>
              <Icons.Upload size={16} />
              {t("settings.customMusic")}
            </button>
            <input
              ref={fileInput}
              className="aegis-sr-only"
              type="file"
              accept={MUSIC_FILE_TYPES}
              tabIndex={-1}
              aria-hidden="true"
              onChange={chooseFile}
            />
            {fileRejected ? (
              <p className="aegis-music-menu__error" role="alert">
                {t("settings.customMusicError")}
              </p>
            ) : null}
          </div>
          <footer className="aegis-music-menu__footer">
            <button className="aegis-music-menu__text-button" onClick={openSoundSettings}>
              <Icons.Settings size={16} />
              {t("redesign.settings.sound")}
              <Icons.ArrowRight size={14} />
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
