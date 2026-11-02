const storageKey = "aegis.card-viewer-3d";

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(storageKey) !== "false";
  } catch {
    return true;
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

export const cardViewer3dPreference = {
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
