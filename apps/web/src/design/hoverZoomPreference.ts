const storageKey = "aegis.hover-zoom";

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

let enabled = read();

function persist(next: boolean) {
  try {
    localStorage.setItem(storageKey, String(next));
  } catch {
    return;
  }
}

export const hoverZoomPreference = {
  isEnabled() {
    return enabled;
  },
  setEnabled(next: boolean) {
    enabled = next;
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
