import { profileTrophiesStore } from "@/achievements/profileTrophiesStore";
import { setProfileTrophiesShown } from "@/achievements/setProfileTrophiesShown";
import { setTamerGroupingEnabled } from "@/design/tamerGrouping/setTamerGroupingEnabled";
import { tamerGroupingStore } from "@/design/tamerGrouping/tamerGroupingStore";
import { getCardImageLanguage } from "@/screens/cardLanguage/getCardImageLanguage";
import { setCardImageLanguage } from "@/screens/cardLanguage/setCardImageLanguage";
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCustomCardSleeve,
  getCardSleeveId,
  getEggSleeveId,
  setCardSleeveId,
  setCustomCardSleeve,
  setEggSleeveId,
} from "../design/sleeve";
import { getDeckBuilderPreferences, setDeckBuilderPreferences } from "../screens/deckBuilderPreferences";
import { I18nProvider, useTranslation } from "../i18n";
import { accountApi, type AccountPreferences } from "./client";
import { isAutoHatchEnabled, setAutoHatchEnabled } from "../game/autoHatch";
import { areProfileStatsShown, setProfileStatsShown } from "./profileStats";
import { usePreferencesSync } from "./usePreferencesSync";
import { getFavoriteDeckIds } from "@/screens/favoriteDecks/getFavoriteDeckIds";
import { setDeckFavorite } from "@/screens/favoriteDecks/setDeckFavorite";
import { setFavoriteDeckIds } from "@/screens/favoriteDecks/setFavoriteDeckIds";

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

function renderSync(accountId: string | undefined) {
  return renderHook(
    ({ id }) => {
      const [dark, setDark] = useState(false);
      const preferencesReady = usePreferencesSync({ accountId: id, dark, setDark });
      return { dark, setDark, preferencesReady, locale: useTranslation().locale };
    },
    { wrapper, initialProps: { id: accountId } },
  );
}

function echoUpdates(stored: AccountPreferences) {
  let merged = stored;
  return vi.spyOn(accountApi, "updatePreferences").mockImplementation(async (changes) => {
    merged = { ...merged, ...changes };
    return merged;
  });
}

beforeEach(() => {
  setTamerGroupingEnabled(true);
  setAutoHatchEnabled(false);
  setProfileStatsShown(false);
  clearCustomCardSleeve();
  localStorage.clear();
  setCardSleeveId("digimon-standard");
  setEggSleeveId("digimon-egg");
  setDeckBuilderPreferences({ deckShare: 0.45, deckView: "grid", deckSort: "releaseDate" });
  setFavoriteDeckIds([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePreferencesSync", () => {
  it("does not touch the network for a guest", () => {
    const load = vi.spyOn(accountApi, "preferences");
    renderSync(undefined);
    expect(load).not.toHaveBeenCalled();
  });

  it("applies the account's stored preferences on sign-in without writing them back", async () => {
    const stored = {
      darkMode: true,
      locale: "pt-BR",
      sleeve: "omnimon",
      deckShare: 0.7,
      deckView: "list" as const,
      deckSort: "level",
    };
    vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
    const update = echoUpdates(stored);
    const { result } = renderSync("account-1");
    await waitFor(() => expect(result.current.locale).toBe("pt-BR"));
    expect(result.current.dark).toBe(true);
    expect(getCardSleeveId()).toBe("omnimon");
    expect(getDeckBuilderPreferences()).toEqual({ deckShare: 0.7, deckView: "list", deckSort: "level" });
    expect(update).not.toHaveBeenCalled();
  });

  it("backfills keys the account lacks and sends later changes", async () => {
    const stored = { locale: "en" };
    vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
    const update = echoUpdates(stored);
    const { result } = renderSync("account-1");
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        darkMode: false,
        sleeve: "digimon-standard",
        deckShare: 0.45,
        deckView: "grid",
        deckSort: "releaseDate",
      }),
    );
    act(() => result.current.setDark(true));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ darkMode: true }));
    act(() => setDeckBuilderPreferences({ deckView: "list" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ deckView: "list" }));
    expect(update).toHaveBeenCalledTimes(3);
  });
  it("keeps a device's custom sleeve on sign-in and excludes it from account updates", async () => {
    setCustomCardSleeve("data:image/webp;base64,Y3VzdG9t");
    const stored = {
      darkMode: false,
      locale: "en",
      sleeve: "omnimon",
      deckShare: 0.45,
      deckView: "grid" as const,
      deckSort: "releaseDate",
    };
    const load = vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
    const update = echoUpdates(stored);
    const { result } = renderSync("account-1");
    await act(async () => {
      await load.mock.results[0]!.value;
    });
    expect(getCardSleeveId()).toBe("custom");
    expect(update).not.toHaveBeenCalled();
    act(() => result.current.setDark(true));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ darkMode: true }));
    act(() => setCardSleeveId("alphamon"));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ sleeve: "alphamon" }));
  });
  it("applies and sends the Digi-Egg sleeve", async () => {
    const stored = { eggSleeve: "gold" };
    const load = vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
    const update = echoUpdates(stored);
    renderSync("account-1");
    await act(async () => {
      await load.mock.results[0]!.value;
    });
    expect(getEggSleeveId()).toBe("gold");
    act(() => setEggSleeveId("digimon-egg"));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ eggSleeve: "digimon-egg" }));
  });
});

it("loads auto hatch from the account and syncs enabling and disabling it", async () => {
  const stored = { autoHatch: true };
  vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
  const update = echoUpdates(stored);
  renderSync("account-1");
  await waitFor(() => expect(isAutoHatchEnabled()).toBe(true));
  await waitFor(() => expect(update).toHaveBeenCalled());
  act(() => setAutoHatchEnabled(false));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith({ autoHatch: false }));
  act(() => setAutoHatchEnabled(true));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith({ autoHatch: true }));
});

it("defaults missing auto hatch to false when switching accounts", async () => {
  vi.spyOn(accountApi, "preferences").mockResolvedValueOnce({ autoHatch: true }).mockResolvedValueOnce({});
  echoUpdates({ autoHatch: true });
  const { rerender } = renderSync("account-1");
  await waitFor(() => expect(isAutoHatchEnabled()).toBe(true));
  rerender({ id: "account-2" });
  await waitFor(() => expect(isAutoHatchEnabled()).toBe(false));
});

it("loads trophy visibility from the account and syncs changes", async () => {
  setProfileTrophiesShown(true);
  const stored = { profileTrophies: false };
  vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
  const update = echoUpdates(stored);
  renderSync("account-1");
  await waitFor(() => expect(profileTrophiesStore.shown).toBe(false));
  act(() => setProfileTrophiesShown(true));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith({ profileTrophies: true }));
});

it("shows trophies by default without saving an unsolicited preference", async () => {
  setProfileTrophiesShown(false);
  vi.spyOn(accountApi, "preferences").mockResolvedValue({});
  const update = echoUpdates({});
  renderSync("account-1");
  await waitFor(() => expect(profileTrophiesStore.shown).toBe(true));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(update.mock.calls.some(([changes]) => "profileTrophies" in changes)).toBe(false);
});

it("loads the profile stats choice from the account and syncs changes", async () => {
  setProfileStatsShown(true);
  const stored = { profileStats: false };
  vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
  const update = echoUpdates(stored);
  renderSync("account-1");
  await waitFor(() => expect(areProfileStatsShown()).toBe(false));
  act(() => setProfileStatsShown(true));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith({ profileStats: true }));
});

it("shows profile stats for accounts without a saved choice and does not write the default", async () => {
  setProfileStatsShown(false);
  vi.spyOn(accountApi, "preferences").mockResolvedValue({});
  const update = echoUpdates({});
  renderSync("account-1");
  await waitFor(() => expect(areProfileStatsShown()).toBe(true));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(update.mock.calls.some(([changes]) => "profileStats" in changes)).toBe(false);
});

it("blocks automation while a new account's preferences are loading", async () => {
  setAutoHatchEnabled(true);
  let resolvePreferences!: (value: AccountPreferences) => void;
  vi.spyOn(accountApi, "preferences").mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvePreferences = resolve;
      }),
  );
  echoUpdates({});
  const { result, rerender } = renderSync("account-1");
  expect(result.current.preferencesReady).toBe(false);
  await act(async () => resolvePreferences({ autoHatch: true }));
  expect(result.current.preferencesReady).toBe(true);
  rerender({ id: "account-2" });
  expect(result.current.preferencesReady).toBe(false);
  await act(async () => resolvePreferences({ autoHatch: false }));
  expect(result.current.preferencesReady).toBe(true);
  expect(isAutoHatchEnabled()).toBe(false);
});

it("applies the account's favorite decks and sends later changes as the whole list", async () => {
  const stored = { favoriteDeckIds: ["custom-2"] };
  const load = vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
  const update = echoUpdates(stored);
  renderSync("account-1");
  await act(async () => {
    await load.mock.results[0]!.value;
  });
  expect(getFavoriteDeckIds()).toEqual(["custom-2"]);
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ favoriteDeckIds: expect.anything() }));
  act(() => setDeckFavorite({ deckId: "custom-5", favorite: true }));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith({ favoriteDeckIds: ["custom-2", "custom-5"] }));
});

it("backfills this device's favorite decks to an account without any", async () => {
  setDeckFavorite({ deckId: "custom-3", favorite: true });
  vi.spyOn(accountApi, "preferences").mockResolvedValue({});
  const update = echoUpdates({});
  renderSync("account-1");
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ favoriteDeckIds: ["custom-3"] })));
});

it("loads the account card image language and saves changes", async () => {
  vi.spyOn(accountApi, "preferences").mockResolvedValue({ cardImageLanguage: "ja" });
  const save = echoUpdates({ cardImageLanguage: "ja" });
  renderSync("language-account");
  await waitFor(() => expect(getCardImageLanguage()).toBe("ja"));
  act(() => setCardImageLanguage("ko"));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ cardImageLanguage: "ko" })));
});

it("restores the account grouping opt-out and persists later changes", async () => {
  const stored = { groupIdenticalTamers: false };
  vi.spyOn(accountApi, "preferences").mockResolvedValue(stored);
  const update = echoUpdates(stored);
  const { result } = renderSync("account-grouping");
  await waitFor(() => expect(result.current.preferencesReady).toBe(true));
  expect(tamerGroupingStore.enabled).toBe(false);
  expect(localStorage.getItem("aegis.field.group-tamers")).toBe("false");
  act(() => setTamerGroupingEnabled(true));
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ groupIdenticalTamers: true })));
});

it("backfills a device grouping opt-out when the account has no grouping preference", async () => {
  setTamerGroupingEnabled(false);
  vi.spyOn(accountApi, "preferences").mockResolvedValue({});
  const update = echoUpdates({});
  renderSync("account-grouping");
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ groupIdenticalTamers: false })));
  expect(tamerGroupingStore.enabled).toBe(false);
});
