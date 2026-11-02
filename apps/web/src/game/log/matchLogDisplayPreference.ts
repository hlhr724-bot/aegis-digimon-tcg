import { MatchLogDisplay } from "@/game/log/MatchLogDisplay";
import { isMatchLogDisplay } from "@/game/log/isMatchLogDisplay";

const storageKey = "aegis.match-log-display";

const listeners = new Set<() => void>();

function read(): MatchLogDisplay {
  try {
    const stored = localStorage.getItem(storageKey);
    return isMatchLogDisplay(stored) ? stored : MatchLogDisplay.POPUPS.value;
  } catch {
    return MatchLogDisplay.POPUPS.value;
  }
}

let current = read();

function persist(next: MatchLogDisplay) {
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    return;
  }
}

export const matchLogDisplayPreference = {
  get(): MatchLogDisplay {
    return current;
  },
  set(next: MatchLogDisplay) {
    current = next;
    persist(next);
    for (const listener of listeners) {
      listener();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
