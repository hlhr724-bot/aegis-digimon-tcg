import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

const STORAGE_KEY = "aegis.card-confirmation.mode";
const LEGACY_ENABLED_STORAGE_KEY = "aegis.action-confirmation.enabled";

async function loadPreference() {
  vi.resetModules();
  const module = await import("@/game/cardConfirmation/cardConfirmationPreference");
  return module.cardConfirmationPreference;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("asks for every card by default", async () => {
  const preference = await loadPreference();
  expect(preference.getMode()).toBe(CardConfirmationMode.ALWAYS.value);
});

it("restores the saved mode", async () => {
  const preference = await loadPreference();
  preference.setMode(CardConfirmationMode.SKIP_PLAY_ONLY.value);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(CardConfirmationMode.SKIP_PLAY_ONLY.value);
  expect((await loadPreference()).getMode()).toBe(CardConfirmationMode.SKIP_PLAY_ONLY.value);
});

it("keeps a player's earlier choice to turn confirmations off", async () => {
  localStorage.setItem(LEGACY_ENABLED_STORAGE_KEY, "false");
  expect((await loadPreference()).getMode()).toBe(CardConfirmationMode.NEVER.value);
  localStorage.setItem(STORAGE_KEY, CardConfirmationMode.ALWAYS.value);
  expect((await loadPreference()).getMode()).toBe(CardConfirmationMode.ALWAYS.value);
});

it.each(["invalid", "constructor"])("ignores an unknown saved mode: %s", async (stored) => {
  localStorage.setItem(STORAGE_KEY, stored);
  expect((await loadPreference()).getMode()).toBe(CardConfirmationMode.ALWAYS.value);
});

it("stays usable when storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  const preference = await loadPreference();
  expect(preference.getMode()).toBe(CardConfirmationMode.ALWAYS.value);
  preference.setMode(CardConfirmationMode.NEVER.value);
  expect(preference.getMode()).toBe(CardConfirmationMode.NEVER.value);
});
