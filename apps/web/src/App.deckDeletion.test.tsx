import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "@/App";
import { accountApi } from "@/account/client";
import type { DeckListing } from "@/game/decks";

vi.mock("@/game/useFamousDecks", () => ({ useFamousDecks: () => ({ decks: [] }) }));
vi.mock("@/account/usePreferencesSync", () => ({ usePreferencesSync: () => true }));
vi.mock("@/screens/DeckBuilder", () => ({
  DeckBuilder: ({
    decks,
    onDeleteDeck,
    onSaveDeck,
  }: {
    decks: DeckListing[];
    onDeleteDeck: (id: string) => void;
    onSaveDeck: (deck: DeckListing, active: boolean) => void;
  }) => (
    <div>
      {decks.map((deck) => (
        <div key={deck.id}>
          <button onClick={() => onDeleteDeck(deck.id)}>{deck.name}</button>
          <button onClick={() => onSaveDeck(deck, false)}>Save personal</button>
        </div>
      ))}
    </div>
  ),
}));

const deck: DeckListing = {
  id: "personal",
  name: "Personal deck",
  color: "Red",
  blurb: "",
  mainDeck: ["BT1-009"],
  eggDeck: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  window.history.replaceState({}, "", "/decks");
  vi.spyOn(accountApi, "me").mockResolvedValue({
    id: "owner",
    displayName: "Tamer",
    avatarUrl: null,
    avatarId: null,
    avatarSource: "initials",
    roles: [],
    isAdmin: false,
  });
  vi.spyOn(accountApi, "decks").mockResolvedValue([deck]);
  vi.spyOn(accountApi, "saveDeck").mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retries a failed deletion after login instead of restoring the deleted remote deck", async () => {
  const deletion = vi
    .spyOn(accountApi, "deleteDeck")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull());
  view.unmount();
  render(<App />);
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull();
  expect(accountApi.saveDeck).not.toHaveBeenCalled();
});

it("does not import a stale local copy after an acknowledged deletion", async () => {
  vi.spyOn(accountApi, "deleteDeck").mockResolvedValue(undefined);
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(accountApi.deleteDeck).toHaveBeenCalledTimes(1));
  view.unmount();
  localStorage.setItem("aegis:decks", JSON.stringify([deck]));
  vi.mocked(accountApi.decks).mockResolvedValue([]);
  render(<App />);
  await waitFor(() => expect(accountApi.decks).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull();
  expect(accountApi.saveDeck).not.toHaveBeenCalled();
});

it("keeps another account's identically named deck when retrying deletions", async () => {
  vi.spyOn(accountApi, "deleteDeck").mockRejectedValue(new Error("offline"));
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(accountApi.deleteDeck).toHaveBeenCalledTimes(1));
  view.unmount();
  const account = await accountApi.me();
  vi.mocked(accountApi.me).mockResolvedValue({ ...account!, id: "another-owner" });
  render(<App />);
  expect(await screen.findByRole("button", { name: "Personal deck" })).toBeTruthy();
  expect(accountApi.deleteDeck).toHaveBeenCalledTimes(1);
});

it("finishes an in-flight save before deleting the same deck", async () => {
  let finishSave: (() => void) | undefined;
  vi.mocked(accountApi.saveDeck).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = () => resolve({});
      }),
  );
  const deletion = vi.spyOn(accountApi, "deleteDeck").mockResolvedValue(undefined);
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Save personal" }));
  await waitFor(() => expect(accountApi.saveDeck).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Personal deck" }));
  expect(deletion).not.toHaveBeenCalled();
  finishSave!();
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull();
});

it("keeps a newer remote recreation of a previously deleted deck", async () => {
  const deletion = vi.spyOn(accountApi, "deleteDeck").mockResolvedValue(undefined);
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  view.unmount();
  vi.mocked(accountApi.decks).mockResolvedValue([{ ...deck, updatedAt: Date.now() + 1000 }]);
  render(<App />);
  expect(await screen.findByRole("button", { name: "Personal deck" })).toBeTruthy();
  expect(deletion).toHaveBeenCalledTimes(1);
});

it("does not restore a deletion made while the initial remote fetch is still pending", async () => {
  localStorage.setItem("aegis:decks", JSON.stringify([deck]));
  let finishFetch: ((decks: DeckListing[]) => void) | undefined;
  vi.mocked(accountApi.decks).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFetch = resolve;
      }),
  );
  const deletion = vi.spyOn(accountApi, "deleteDeck").mockResolvedValue(undefined);
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  finishFetch!([deck]);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull());
  expect(accountApi.saveDeck).not.toHaveBeenCalled();
});

it("retries deletion even when an earlier in-flight save commits after the delete click", async () => {
  let finishSave: (() => void) | undefined;
  vi.mocked(accountApi.saveDeck).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = () => resolve({});
      }),
  );
  const deletion = vi
    .spyOn(accountApi, "deleteDeck")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Save personal" }));
  await waitFor(() => expect(accountApi.saveDeck).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Personal deck" }));
  finishSave!();
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  view.unmount();
  vi.mocked(accountApi.decks).mockResolvedValue([{ ...deck, updatedAt: Date.now() + 60000 }]);
  render(<App />);
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull();
});

it("acknowledges a missing remote deck after a lost deletion response and preserves a later recreation", async () => {
  const deletion = vi.spyOn(accountApi, "deleteDeck").mockRejectedValue(new Error("response lost"));
  let view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Personal deck" }));
  await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1));
  view.unmount();
  vi.mocked(accountApi.decks).mockResolvedValue([]);
  view = render(<App />);
  await waitFor(() => expect(accountApi.decks).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Personal deck" })).toBeNull();
  view.unmount();
  vi.mocked(accountApi.decks).mockResolvedValue([deck]);
  render(<App />);
  expect(await screen.findByRole("button", { name: "Personal deck" })).toBeTruthy();
  expect(deletion).toHaveBeenCalledTimes(1);
});
