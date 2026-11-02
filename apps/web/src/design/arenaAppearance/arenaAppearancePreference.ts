import { useSyncExternalStore } from "react";
import { ArenaUiScale } from "@/design/arenaAppearance/ArenaUiScale";
import { EffectTransparency } from "@/design/arenaAppearance/EffectTransparency";

type Appearance = { scale: ArenaUiScale; transparency: EffectTransparency };
const STORAGE_KEY = "aegis.arena-appearance";
const defaults: Appearance = { scale: ArenaUiScale.DEFAULT.value, transparency: EffectTransparency.OPAQUE.value };
const listeners = new Set<() => void>();

function readAppearance(): Appearance {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") {
      return defaults;
    }
    const scale = Object.values(ArenaUiScale).find((entry) => entry.value === Reflect.get(stored, "scale"));
    const transparency = Object.values(EffectTransparency).find(
      (entry) => entry.value === Reflect.get(stored, "transparency"),
    );
    return { scale: scale?.value ?? defaults.scale, transparency: transparency?.value ?? defaults.transparency };
  } catch {
    return defaults;
  }
}

let current = readAppearance();

function applyAppearance() {
  if (typeof document === "undefined") {
    return;
  }
  const scale = Object.values(ArenaUiScale).find((entry) => entry.value === current.scale) ?? ArenaUiScale.DEFAULT;
  const transparency =
    Object.values(EffectTransparency).find((entry) => entry.value === current.transparency) ??
    EffectTransparency.OPAQUE;
  document.documentElement.dataset.arenaUiScale = scale.value;
  document.documentElement.dataset.effectTransparency = transparency.value;
  document.documentElement.style.setProperty("--arena-ui-scale", String(scale.factor));
  document.documentElement.style.setProperty("--arena-prompt-opacity", transparency.panel);
  document.documentElement.style.setProperty("--arena-prompt-scrim", String(transparency.scrim));
}

function getAppearance() {
  return current;
}

function setAppearance(next: Appearance) {
  current = {
    scale: Object.values(ArenaUiScale).find((entry) => entry.value === next.scale)?.value ?? defaults.scale,
    transparency:
      Object.values(EffectTransparency).find((entry) => entry.value === next.transparency)?.value ??
      defaults.transparency,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    applyAppearance();
  }
  applyAppearance();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useAppearance() {
  return useSyncExternalStore(subscribe, getAppearance, () => defaults);
}

function resetAppearance() {
  setAppearance(defaults);
}

applyAppearance();

export const arenaAppearancePreference = { getAppearance, setAppearance, useAppearance, resetAppearance };
