import { useSyncExternalStore } from "react";
import { MotionMode } from "@/design/motion/MotionMode";
import { isMotionMode } from "@/design/motion/isMotionMode";
import { MOTION_ATTRIBUTE } from "@/design/motion/motionAttribute";
import { REDUCED_MOTION_QUERY } from "@/design/motion/reducedMotionQuery";

const STORAGE_KEY = "aegis.motion";
const listeners = new Set<() => void>();

function readMode(): MotionMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isMotionMode(stored)) {
      return stored;
    }
    return MotionMode.SYSTEM.value;
  } catch {
    return MotionMode.SYSTEM.value;
  }
}

let current = readMode();
let systemListenerInstalled = false;

function findSystemQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return undefined;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

function getMode(): MotionMode {
  return current;
}

function isReduced(): boolean {
  if (current === MotionMode.REDUCED.value) {
    return true;
  }
  if (current === MotionMode.FULL.value) {
    return false;
  }
  return findSystemQuery()?.matches ?? false;
}

function apply() {
  if (typeof document === "undefined") {
    return;
  }
  const effective = isReduced() ? MotionMode.REDUCED.value : MotionMode.FULL.value;
  document.documentElement.setAttribute(MOTION_ATTRIBUTE, effective);
  if (systemListenerInstalled) {
    return;
  }
  systemListenerInstalled = true;
  findSystemQuery()?.addEventListener("change", apply);
}

function persist(next: MotionMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
}

function setMode(next: MotionMode) {
  current = next;
  persist(next);
  apply();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  const systemQuery = findSystemQuery();
  listeners.add(listener);
  systemQuery?.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    systemQuery?.removeEventListener("change", listener);
  };
}

function useMode() {
  return useSyncExternalStore(subscribe, getMode, () => MotionMode.SYSTEM.value);
}

function useReduced() {
  return useSyncExternalStore(subscribe, isReduced, () => false);
}

export const motionPreference = { getMode, setMode, useMode, isReduced, useReduced, subscribe, apply };
