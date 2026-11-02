// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { drawBoosterPack } from "@/packOpening/drawBoosterPack";
import { listBoosterSets } from "@/packOpening/listBoosterSets";
import { readBoosterProgress } from "@/packOpening/readBoosterProgress";
import { saveBoosterProgress } from "@/packOpening/saveBoosterProgress";
import { Collection } from "@/screens/Collection";
import { CollectionTab } from "@/screens/CollectionTab";

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function saveOpenedBox(setId: string, packCount: number) {
  const boosterSet = listBoosterSets().find((set) => set.setId === setId);
  if (!boosterSet) {
    throw new Error(`Missing booster set ${setId}`);
  }
  const random = createRandom(7);
  const packs = Array.from({ length: packCount }, () => ({
    openedAt: 1,
    cards: drawBoosterPack({ setId, cards: boosterSet.cards, random }).map(({ cardId, artId }) => ({ cardId, artId })),
  }));
  saveBoosterProgress({ version: 2, activeBox: { setId, packs } });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("switches between the card library and the free booster tabs", () => {
  const onTabChange = vi.fn<(tab: CollectionTab) => void>();
  const { rerender } = render(
    <I18nProvider>
      <Collection tab={CollectionTab.CARDS.value} onTabChange={onTabChange} />
    </I18nProvider>,
  );

  expect(screen.getByRole("heading", { name: "Card library" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Free booster" }));
  expect(onTabChange).toHaveBeenCalledWith(CollectionTab.BOOSTERS.value);

  rerender(
    <I18nProvider>
      <Collection tab={CollectionTab.BOOSTERS.value} onTabChange={onTabChange} />
    </I18nProvider>,
  );
  expect(screen.getByRole("tab", { name: "Free booster" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("heading", { name: "Odds per pack" })).toBeTruthy();
});

it("shows the last opened pack and opens the 3D booster for the same box", () => {
  saveOpenedBox("BT12", 3);
  const onOpenBooster = vi.fn<() => void>();
  render(
    <I18nProvider>
      <Collection tab={CollectionTab.BOOSTERS.value} onOpenBooster={onOpenBooster} />
    </I18nProvider>,
  );

  expect(screen.getByRole("heading", { name: "BT12 · Booster pack" })).toBeTruthy();
  expect(screen.queryByRole("progressbar", { name: "Packs opened" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Last opened pack" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Open packs" }));
  expect(onOpenBooster).toHaveBeenCalledTimes(1);
  expect(readBoosterProgress().activeBox?.packs).toHaveLength(3);
});

it("starts a fresh box when another set is opened", () => {
  saveOpenedBox("BT12", 2);
  const onOpenBooster = vi.fn<() => void>();
  render(
    <I18nProvider>
      <Collection tab={CollectionTab.BOOSTERS.value} onOpenBooster={onOpenBooster} />
    </I18nProvider>,
  );

  fireEvent.change(screen.getByRole("combobox", { name: "Set" }), { target: { value: "BT11" } });
  expect(readBoosterProgress().activeBox?.setId).toBe("BT12");

  fireEvent.click(screen.getByRole("button", { name: "Open packs" }));
  expect(readBoosterProgress().activeBox).toEqual({ setId: "BT11", packs: [] });
  expect(onOpenBooster).toHaveBeenCalledTimes(1);
});
