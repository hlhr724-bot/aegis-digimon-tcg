import { isChunkLoadError } from "@/clientErrors/isChunkLoadError";

const LAST_RELOAD_KEY = "aegis:preload-error-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

type InstallPreloadErrorRecoveryParams = {
  target: EventTarget;
  readStorage: () => Storage;
  reload: () => void;
  now?: () => number;
  isOnline?: () => boolean;
};

function recordReload(readStorage: () => Storage, at: number): boolean {
  try {
    const storage = readStorage();
    const last = Number(storage.getItem(LAST_RELOAD_KEY));
    if (Number.isFinite(last) && at - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(LAST_RELOAD_KEY, String(at));
    return true;
  } catch {
    return false;
  }
}

export function installPreloadErrorRecovery({
  target,
  readStorage,
  reload,
  now = Date.now,
  isOnline = () => true,
}: InstallPreloadErrorRecoveryParams): void {
  let waitingForNetwork = false;
  target.addEventListener("online", () => {
    if (!waitingForNetwork || !isOnline()) {
      return;
    }
    waitingForNetwork = false;
    if (recordReload(readStorage, now())) {
      reload();
    }
  });
  target.addEventListener("vite:preloadError", (event) => {
    if (!isChunkLoadError((event as Event & { payload?: unknown }).payload)) {
      return;
    }
    if (!isOnline()) {
      waitingForNetwork = true;
      return;
    }
    waitingForNetwork = false;
    if (!recordReload(readStorage, now())) {
      return;
    }
    event.preventDefault();
    reload();
  });
}
