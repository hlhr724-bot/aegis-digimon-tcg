import { useSyncExternalStore } from "react";
import type { TranslationKey } from "../i18n";

const STORAGE_KEY = "aegis.notice.duration";

/** How long notices and card panels stay readable, as a multiple of the default reading time. */
export const NOTICE_DURATIONS = ["short", "normal", "long", "longest"] as const;
export type NoticeDuration = (typeof NOTICE_DURATIONS)[number];

export const NOTICE_DURATION_SCALE: Record<NoticeDuration, number> = {
  short: 0.6,
  normal: 1,
  long: 1.5,
  longest: 2,
};

export const NOTICE_DURATION_LABELS: Record<NoticeDuration, TranslationKey> = {
  short: "settings.noticeDurationShort",
  normal: "settings.noticeDurationNormal",
  long: "settings.noticeDurationLong",
  longest: "settings.noticeDurationLongest",
};

const listeners = new Set<() => void>();

function readNoticeDuration(): NoticeDuration {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return NOTICE_DURATIONS.find((duration) => duration === stored) ?? "normal";
  } catch {
    return "normal";
  }
}

let current = readNoticeDuration();

export function getNoticeDuration(): NoticeDuration {
  return current;
}

export function noticeDurationScale(): number {
  return NOTICE_DURATION_SCALE[current];
}

export function setNoticeDuration(next: NoticeDuration): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Keep the current-session choice when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNoticeDuration(): NoticeDuration {
  return useSyncExternalStore(subscribe, getNoticeDuration, () => "normal");
}
