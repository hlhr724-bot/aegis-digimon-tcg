import { afterEach, describe, expect, it, vi } from "vitest";

function blockedStorage(): Storage {
  const deny = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return { getItem: deny, setItem: deny, removeItem: deny, clear: deny, key: deny, length: 0 };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

async function loadGetStoryGuestToken() {
  vi.resetModules();
  return (await import("@/story/getStoryGuestToken")).getStoryGuestToken;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("story guest token", () => {
  it("keeps one token for the session when the browser blocks storage", async () => {
    vi.stubGlobal("localStorage", blockedStorage());
    const getStoryGuestToken = await loadGetStoryGuestToken();

    const first = getStoryGuestToken();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getStoryGuestToken()).toBe(first);
  });

  it("reuses the token saved on this device", async () => {
    const storage = memoryStorage();
    storage.setItem("aegis:story-guest-token", "saved-token");
    vi.stubGlobal("localStorage", storage);
    const getStoryGuestToken = await loadGetStoryGuestToken();

    expect(getStoryGuestToken()).toBe("saved-token");
  });
});
