import { useSyncExternalStore } from "react";
import { cueKey, type SoundKind, type SoundDetails } from "./audioRecipes";
import { AUDIO_BANK_URL, AUDIO_CUES, PCM_AUDIO_BANK_URL } from "./audioBank";
import { encodePcmWav } from "./encodePcmWav";
import { DEFAULT_MUSIC_TRACK, isMusicTrack, MUSIC_TRACK_URLS, type MusicTrack } from "./musicTracks";
import { MediaAudio, needsMediaAudio, splitCueWav } from "./mediaAudio";
export type { SoundKind, SoundDetails } from "./audioRecipes";
const clamp = (value: number, fallback = 0) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

function readFlag(key: string, fallback = true): boolean {
  try {
    return localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) !== "false";
  } catch {
    return fallback;
  }
}
function readVolume(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : clamp(Number(raw), fallback);
  } catch {
    return fallback;
  }
}
function readTrack(): MusicTrack {
  try {
    const raw = localStorage.getItem("aegis.music.track");
    return isMusicTrack(raw) ? raw : DEFAULT_MUSIC_TRACK;
  } catch {
    return DEFAULT_MUSIC_TRACK;
  }
}
function persist(key: string, value: number | boolean | string): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Guest storage may be unavailable. */
  }
}
let enabled = readFlag("aegis.sound.enabled");
let volume = readVolume("aegis.sound.volume", 0.7);
let musicEnabled = readFlag("aegis.music.enabled");
let musicVolume = readVolume("aegis.music.volume", 0.25);
let musicTrack = readTrack();
let customMusic: { url: string; name: string } | undefined;
const musicListeners = new Set<() => void>();
const musicUrl = () => customMusic?.url ?? MUSIC_TRACK_URLS[musicTrack];
export function getCustomMusicName(): string | undefined {
  return customMusic?.name;
}
function subscribeMusic(listener: () => void): () => void {
  musicListeners.add(listener);
  return () => musicListeners.delete(listener);
}
function notifyMusicListeners(): void {
  for (const listener of musicListeners) {
    listener();
  }
}
export function useCustomMusicName(): string | undefined {
  return useSyncExternalStore(subscribeMusic, getCustomMusicName, () => undefined);
}
export function useMusicEnabled(): boolean {
  return useSyncExternalStore(subscribeMusic, isMusicEnabled, isMusicEnabled);
}
export function useMusicTrack(): MusicTrack {
  return useSyncExternalStore(subscribeMusic, getMusicTrack, getMusicTrack);
}
function releaseCustomMusic(): void {
  if (!customMusic) return;
  assets.delete(customMusic.url);
  decoding.delete(customMusic.url);
  URL.revokeObjectURL(customMusic.url);
  customMusic = undefined;
}
function reloadMusic(): void {
  musicBuffer = null;
  musicOrigin = null;
  stopMusicVoices();
  syncMusic();
  void prepareAudio();
  notifyMusicListeners();
}
/** Local files remain on this device and are selected again after a reload. */
export function setCustomMusicFile(file: File): boolean {
  if (
    !file.size ||
    file.size > 50 * 1024 * 1024 ||
    !(file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name))
  )
    return false;
  const next = { url: URL.createObjectURL(file), name: file.name };
  releaseCustomMusic();
  customMusic = next;
  reloadMusic();
  return true;
}
export function clearCustomMusic(): void {
  if (!customMusic) return;
  releaseCustomMusic();
  reloadMusic();
}
let context: AudioContext | null = null;
let effectsBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
let unlocked = false;
let musicWanted = false;
const voices = new Set<AudioBufferSourceNode>();
type MusicVoice = { node: AudioBufferSourceNode; gate: GainNode };
let musicVoices: MusicVoice[] = [];
let retiringMusic: MusicVoice[] = [];
let musicOrigin: number | null = null;
let cueBuffer: AudioBuffer | null = null;
let musicBuffer: AudioBuffer | null = null;
const assets = new Map<string, Promise<ArrayBuffer>>();
const decoding = new Map<string, Promise<void>>();
let epoch = 0;
let mediaAudio: MediaAudio | null = null;
function getMediaAudio(): MediaAudio | null {
  if (!needsMediaAudio()) return null;
  mediaAudio ??= new MediaAudio(
    () => ({
      enabled,
      effectsVolume: volume * SFX_MIX_GAIN,
      musicEnabled,
      musicVolume,
      musicWanted,
      musicUrl: musicUrl(),
    }),
    MAX_SOUND_VOICES,
  );
  return mediaAudio;
}

/** Network starts at app mount; each buffer decodes independently only in a gesture-created context. */
export async function prepareAudio(): Promise<void> {
  const media = getMediaAudio();
  const urls = media ? [PCM_AUDIO_BANK_URL] : [AUDIO_BANK_URL, musicUrl()];
  await Promise.all(
    urls.map(async (url) => {
      let request = assets.get(url);
      try {
        if (!request) {
          request = fetch(url).then((response) => {
            if (!response.ok) throw new Error("Audio bank unavailable");
            return response.arrayBuffer();
          });
          assets.set(url, request);
        }
        const bytes = await request;
        if (media) {
          media.prepare(bytes);
          return;
        }
        const ctx = context;
        const isMusic = url !== AUDIO_BANK_URL;
        if (!ctx || !unlocked || (isMusic ? musicBuffer || url !== musicUrl() : cueBuffer)) return;
        let task = decoding.get(url);
        if (!task) {
          const generation = epoch;
          task = ctx
            .decodeAudioData(bytes.slice(0))
            .then((buffer) => {
              if (context !== ctx || epoch !== generation) return;
              if (!isMusic) cueBuffer = buffer;
              // The player may have picked another track while this one was decoding.
              else if (url === musicUrl()) musicBuffer = buffer;
              else return;
              syncMusic();
            })
            .catch(() => undefined);
          decoding.set(url, task);
          const ownTask = task;
          void task.then(() => {
            if (decoding.get(url) === ownTask) decoding.delete(url);
          });
        }
        await task;
      } catch {
        if (assets.get(url) === request) assets.delete(url);
        /* Offline/unsupported assets are silent; stale presentation cues are never replayed. */
      }
    }),
  );
}
const lastPlayed = new Map<SoundKind, number>();
export const MAX_SOUND_VOICES = 8;
// Eight authored peaks <= .30 plus music <= .08 remain below full scale even at both controls = 1.
export const SFX_MIX_GAIN = 0.38;
function ramp(bus: GainNode | null, value: number): void {
  if (!bus || !context) return;
  bus.gain.cancelScheduledValues(context.currentTime);
  bus.gain.setTargetAtTime(value, context.currentTime, 0.025);
}
export const isSoundEnabled = () => enabled;
export const getSoundVolume = () => volume;
export function setSoundEnabled(next: boolean): void {
  enabled = next;
  persist("aegis.sound.enabled", next);
  ramp(effectsBus, next ? volume * SFX_MIX_GAIN : 0);
  mediaAudio?.sync();
}
export function setSoundVolume(next: number): void {
  volume = clamp(next);
  persist("aegis.sound.volume", volume);
  ramp(effectsBus, enabled ? volume * SFX_MIX_GAIN : 0);
  mediaAudio?.sync();
}
export const isMusicEnabled = () => musicEnabled;
export const getMusicVolume = () => musicVolume;
export function setMusicEnabled(next: boolean): void {
  musicEnabled = next;
  persist("aegis.music.enabled", next);
  syncMusic();
  notifyMusicListeners();
}
export function setMusicVolume(next: number): void {
  musicVolume = clamp(next);
  persist("aegis.music.volume", musicVolume);
  syncMusic();
}
export const getMusicTrack = () => musicTrack;
export function setMusicTrack(next: MusicTrack): void {
  if (next === musicTrack && !customMusic) return;
  releaseCustomMusic();
  musicTrack = next;
  persist("aegis.music.track", next);
  reloadMusic();
}

/** Called by trusted input listeners, before an action's delayed presentation. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    const media = getMediaAudio();
    if (media) {
      media.unlock();
      void prepareAudio();
      return;
    }
    if (!context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // Android's low-latency output can underrun under load. Let mobile output
      // buffer playback at the device's native rate instead of forcing a rate.
      const mobile = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
      context = new Ctor({ latencyHint: mobile ? "playback" : "interactive" });
      const ctx = context;
      ctx.onstatechange = () => {
        if (context !== ctx) return;
        if (ctx.state === "running") syncMusic();
        else stopPlayback();
      };
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.08;
      limiter.connect(context.destination);
      effectsBus = context.createGain();
      effectsBus.gain.value = enabled ? volume * SFX_MIX_GAIN : 0;
      effectsBus.connect(limiter);
      musicBus = context.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(limiter);
    }
    unlocked = true;
    if (context.state !== "running" && context.state !== "closed")
      void context
        .resume()
        .then(syncMusic)
        .catch(() => undefined);
    void prepareAudio();
    syncMusic();
  } catch {
    /* Unsupported/denied audio must never break interaction. */
  }
}

/** One steady original score, prepared outside presentation callbacks. */
function syncMusic(): void {
  if (mediaAudio) {
    mediaAudio.sync();
    return;
  }
  const ctx = context;
  const audible = musicWanted && musicEnabled && musicVolume > 0 && !document.hidden;
  ramp(musicBus, audible ? musicVolume : 0);
  if (!audible) {
    stopMusicVoices();
    return;
  }
  if (!ctx || ctx.state !== "running" || !musicBus || !unlocked || musicVoices.length || !musicBuffer) return;
  const when = ctx.currentTime + 0.02;
  musicOrigin ??= when;
  const offset = (when - musicOrigin) % musicBuffer.duration;
  const node = ctx.createBufferSource(),
    gate = ctx.createGain();
  node.buffer = musicBuffer;
  node.loop = true;
  gate.gain.setValueAtTime(0, ctx.currentTime);
  gate.gain.linearRampToValueAtTime(1, when + 0.08);
  node.connect(gate).connect(musicBus);
  node.onended = () => {
    node.disconnect();
    gate.disconnect();
    retiringMusic = retiringMusic.filter((retiring) => retiring.node !== node);
  };
  node.start(when, offset);
  musicVoices = [{ node, gate }];
}
export function startMusic(): void {
  musicWanted = true;
  syncMusic();
}
function stopMusicVoices(): void {
  if (!musicVoices.length) return;
  for (const { node, gate } of retiringMusic) {
    try {
      node.stop();
    } catch {
      /* Already stopped. */
    }
    node.disconnect();
    gate.disconnect();
  }
  retiringMusic = [];
  const now = context?.currentTime ?? 0;
  for (const { node, gate } of musicVoices) {
    try {
      gate.gain.cancelScheduledValues(now);
      gate.gain.setTargetAtTime(0, now, 0.02);
      node.stop(now + 0.12);
      retiringMusic.push({ node, gate });
    } catch {
      /* Already stopped. */
    }
  }
  musicVoices = [];
}
export function stopMusic(): void {
  musicWanted = false;
  mediaAudio?.sync();
  ramp(musicBus, 0);
  stopMusicVoices();
}

/** Disconnect immediately: a suspended audio clock cannot finish scheduled fades. */
function stopPlayback(): void {
  for (const { node, gate } of [...musicVoices, ...retiringMusic]) {
    try {
      node.stop();
    } catch {
      /* Already stopped. */
    }
    node.disconnect();
    gate.disconnect();
  }
  musicVoices = [];
  retiringMusic = [];
  for (const node of voices) {
    try {
      node.stop();
    } catch {
      /* Already stopped. */
    }
    node.disconnect();
  }
  voices.clear();
  lastPlayed.clear();
}

/** Presentation cues never create a context or try to bypass autoplay. */
export function playSound(kind: SoundKind, details?: SoundDetails): void {
  if (mediaAudio) {
    mediaAudio.play(kind, details);
    return;
  }
  if (
    !enabled ||
    volume <= 0 ||
    !unlocked ||
    !context ||
    context.state !== "running" ||
    !effectsBus ||
    !cueBuffer ||
    document.hidden
  )
    return;
  const now = context.currentTime;
  if (now - (lastPlayed.get(kind) ?? -Infinity) < 0.075 || voices.size >= MAX_SOUND_VOICES) return;
  const cue = AUDIO_CUES[cueKey(kind, details)];
  if (!cue) return;
  lastPlayed.set(kind, now);
  const node = context.createBufferSource();
  node.buffer = cueBuffer;
  node.connect(effectsBus);
  voices.add(node);
  node.onended = () => {
    voices.delete(node);
    node.disconnect();
  };
  // Offset/duration select a finished original clip. No fetch, decode, render or oscillator graph here.
  node.start(now, cue.offset, cue.duration);
}
let attentionClips: Promise<Map<string, string>> | null = null;
function attentionBank(): Promise<ArrayBuffer> | undefined {
  if (mediaAudio) return assets.get(PCM_AUDIO_BANK_URL);
  const buffer = cueBuffer;
  return buffer ? Promise.resolve(buffer).then(encodePcmWav) : undefined;
}
function attentionClipUrls(bytes: ArrayBuffer): Map<string, string> {
  const urls = new Map<string, string>();
  for (const [key, clip] of splitCueWav(bytes))
    urls.set(key, URL.createObjectURL(new Blob([clip], { type: "audio/wav" })));
  return urls;
}
/**
 * Calls the player back to the match. A focused window hears `kind`; an unfocused window or
 * hidden tab hears the doorbell instead. Presentation cues stay silent in a hidden tab, and
 * the suspended AudioContext cannot play, so a hidden tab uses a media element.
 */
export function playAttentionSound(kind: SoundKind): void {
  if (!document.hidden) {
    playSound(document.hasFocus() ? kind : "attention");
    return;
  }
  if (!enabled || volume <= 0 || !(unlocked || mediaAudio)) return;
  if (!attentionClips) {
    const bank = attentionBank();
    if (!bank) return;
    attentionClips = bank.then(attentionClipUrls);
  }
  void attentionClips
    .then((urls) => {
      const url = urls.get(cueKey("attention"));
      if (!url) return;
      const player = new Audio(url);
      player.volume = volume * SFX_MIX_GAIN;
      return player.play();
    })
    .catch(() => undefined);
}
export function disposeAudio(): void {
  void attentionClips?.then((urls) => urls.forEach((url) => URL.revokeObjectURL(url))).catch(() => undefined);
  attentionClips = null;
  mediaAudio?.dispose();
  mediaAudio = null;
  epoch++;
  decoding.clear();
  cueBuffer = null;
  musicBuffer = null;
  musicOrigin = null;
  musicWanted = false;
  stopPlayback();
  const old = context;
  if (old) old.onstatechange = null;
  context = null;
  effectsBus = null;
  musicBus = null;
  limiter = null;
  unlocked = false;
  if (old && old.state !== "closed") void old.close().catch(() => undefined);
}
/** App-scoped listeners, with no context allocation until real input. */
export function installAudioLifecycle(): () => void {
  void prepareAudio();
  const gesture = (event: Event) => {
    if (event.isTrusted) unlockAudio();
  };
  // A touch grants user activation at pointerup/touchend, not pointerdown, so a
  // first tap would otherwise leave the context suspended (Android) and native
  // Opera media may reject playback attempted by the earlier capture listener.
  const touchGesture = (event: Event) => {
    if (!event.isTrusted) return;
    if (mediaAudio || (event as PointerEvent).pointerType !== "mouse") unlockAudio();
  };
  const visibility = () => {
    if (mediaAudio) {
      if (document.hidden) mediaAudio.stop();
      else mediaAudio.sync();
      return;
    }
    if (!context || !unlocked) return;
    if (document.hidden) {
      stopPlayback();
      void context.suspend().catch(() => undefined);
    } else
      void context
        .resume()
        .then(syncMusic)
        .catch(() => undefined);
  };
  document.addEventListener("pointerdown", gesture, true);
  document.addEventListener("pointerup", touchGesture, true);
  document.addEventListener("touchend", touchGesture, true);
  document.addEventListener("keydown", gesture, true);
  document.addEventListener("visibilitychange", visibility);
  let restoreMusic = false;
  const pageHide = () => {
    restoreMusic = musicWanted;
    disposeAudio();
  };
  const pageShow = () => {
    if (restoreMusic) {
      startMusic();
      restoreMusic = false;
    }
  };
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  return () => {
    document.removeEventListener("pointerdown", gesture, true);
    document.removeEventListener("pointerup", touchGesture, true);
    document.removeEventListener("touchend", touchGesture, true);
    document.removeEventListener("keydown", gesture, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    disposeAudio();
  };
}
