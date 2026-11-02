// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { accountApi, type RemoteAccount } from "./account/client";
import { AegisClient, cardEffectsLabCardId, initialAppRoute, withAccountAvatar } from "./App";
import { I18nProvider } from "./i18n";

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("card effects demo route", () => {
  it("normalizes a card ID only from the direct demo path", () => {
    expect(cardEffectsLabCardId("/dev/card-effects/ex3-074")).toBe("EX3-074");
    expect(cardEffectsLabCardId("/dev/card-effects/EX3-074/")).toBe("EX3-074");
    expect(cardEffectsLabCardId("/collection/EX3-074")).toBeUndefined();
    expect(cardEffectsLabCardId("/dev/card-effects/")).toBeUndefined();
  });

  it("does not crash on a malformed encoded card ID", () => {
    expect(cardEffectsLabCardId("/dev/card-effects/%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("account avatar identity", () => {
  it("clears account-owned avatar data after logout", () => {
    const player = {
      name: "Tamer",
      color: "Blue",
      shards: 0,
      avatarId: "tyrannomon" as const,
      avatarUrl: "provider.png",
    };

    expect(withAccountAvatar(player, null)).toEqual({
      name: "Tamer",
      color: "Blue",
      shards: 0,
      avatarId: null,
      avatarUrl: null,
    });
  });
});

describe("game reload routing", () => {
  it("resumes a game route only when the tab still owns a reconnectable seat", () => {
    expect(initialAppRoute({ pathname: "/play/game", invitedRoomCode: undefined, hasReconnectSession: true })).toEqual({
      screen: "game",
    });
    expect(initialAppRoute({ pathname: "/play/game", invitedRoomCode: undefined, hasReconnectSession: false })).toEqual(
      { screen: "lobby" },
    );
  });

  it("opens shared spectator links on the watch screen", () => {
    expect(
      initialAppRoute({
        pathname: "/play",
        invitedRoomCode: undefined,
        spectatorCode: "ABCDEF",
        hasReconnectSession: false,
      }),
    ).toEqual({ screen: "watch" });
  });
});

describe("responsive application state", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("aegis:player", JSON.stringify({ name: "Resize Tamer", color: "Blue", shards: 0 }));
    HTMLCanvasElement.prototype.getContext = () => null;
    setViewportWidth(1200);
  });

  afterEach(() => cleanup());

  it("starts every app session with the timer enabled even after a saved opt-out", async () => {
    localStorage.setItem("aegis:match-timer", "false");
    const view = () => (
      <I18nProvider>
        <AegisClient
          player={{ name: "Timer Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="lobby"
        />
      </I18nProvider>
    );
    let rendered = render(view());
    fireEvent.click(await screen.findByText("Advanced settings", { exact: true }));
    const timerSwitch = await screen.findByRole("switch", { name: "Match timer" });
    expect(timerSwitch.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(timerSwitch);
    expect(timerSwitch.getAttribute("aria-checked")).toBe("false");
    rendered.unmount();
    rendered = render(view());
    fireEvent.click(await screen.findByText("Advanced settings", { exact: true }));
    const restored = await screen.findByRole("switch", { name: "Match timer" });
    expect(restored.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(restored);
    rendered.unmount();
    render(view());
    fireEvent.click(await screen.findByText("Advanced settings", { exact: true }));
    expect((await screen.findByRole("switch", { name: "Match timer" })).getAttribute("aria-checked")).toBe("true");
  });

  it("shows a simple empty state when the player has no decks", async () => {
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="deck"
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("You don't have any decks yet.")).toBeTruthy();
  });

  it("does not present a famous preset as the player's own deck", async () => {
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId="bt10-xros-heart"
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="deck"
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("You don't have any decks yet.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Xros Heart" })).toBeNull();
  });

  it("lands a first-time visitor straight on the home dashboard", async () => {
    window.history.replaceState(null, "", "/");
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
        />
      </I18nProvider>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("opens the sign-in screen from the top bar", async () => {
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="home"
        />
      </I18nProvider>,
    );

    await screen.findByRole("heading", { level: 1, name: "Home" });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]!);

    expect(await screen.findByRole("heading", { name: "Sign in to Aegis" })).toBeTruthy();
  });

  it("opens the player menu from the top-bar portrait", async () => {
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="home"
        />
      </I18nProvider>,
    );

    await screen.findByRole("heading", { level: 1, name: "Home" });
    fireEvent.click(screen.getAllByRole("button", { name: "Open the player menu" })[0]!);

    expect(await screen.findByRole("link", { name: "My profile" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Guest \u00b7 saved on this device")).toBeTruthy();
  });

  it("#5255 restores the provider portrait throughout the app after choosing it again", async () => {
    const original: RemoteAccount = {
      id: "account-5255",
      displayName: "Revanche",
      avatarId: "tyrannomon",
      avatarSource: "digimon",
      avatarUrl: "https://example.com/discord-avatar.png",
      isAdmin: false,
      roles: [],
      discordLinked: true,
    };
    window.history.replaceState(null, "", "/profile/customize");
    vi.spyOn(accountApi, "profile").mockRejectedValue(new Error("offline"));
    vi.spyOn(accountApi, "matches").mockRejectedValue(new Error("offline"));
    const updateAvatar = vi
      .spyOn(accountApi, "updateAvatar")
      .mockResolvedValue({ ...original, avatarId: null, avatarSource: "discord" });
    function SignedInClient() {
      const [account, setAccount] = useState<RemoteAccount | null>(original);
      return (
        <I18nProvider>
          <AegisClient
            player={{ name: "Guest", color: "Blue", shards: 0, guestAvatarId: "greymon" }}
            setPlayer={() => undefined}
            account={account}
            setAccount={setAccount}
            decks={[]}
            activeDeckId=""
            setActiveDeckId={() => undefined}
            saveDeck={() => undefined}
            deleteDeck={() => undefined}
            dark={false}
            setDark={() => undefined}
          />
        </I18nProvider>
      );
    }
    try {
      render(<SignedInClient />);
      const menuButton = screen.getAllByRole("button", { name: "Open the player menu" })[0]!;
      expect(menuButton.querySelector("img")?.getAttribute("src")).not.toBe(original.avatarUrl);
      expect(window.location.pathname).toBe("/profile");
      fireEvent.click(await screen.findByRole("button", { name: "Change avatar" }, { timeout: 5_000 }));
      const avatarDialog = screen.getByRole("dialog");
      fireEvent.click(within(avatarDialog).getByRole("tab", { name: "Discord" }));
      fireEvent.click(within(avatarDialog).getByRole("button", { name: "Use Discord avatar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(updateAvatar).toHaveBeenCalledWith(null);
      expect(menuButton.querySelector("img")?.getAttribute("src")).toBe(original.avatarUrl);
    } finally {
      vi.restoreAllMocks();
      window.history.replaceState(null, "", "/");
    }
  });

  it("preserves the active screen and form draft when the viewport crosses a breakpoint", async () => {
    window.history.replaceState(null, "", "/profile");
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          account={null}
        />
      </I18nProvider>,
    );

    await screen.findByRole("heading", { name: "My profile" }, { timeout: 10_000 });
    fireEvent.click(screen.getByRole("button", { name: "Edit name: Resize Tamer" }));
    const nameInput = screen.getByDisplayValue("Resize Tamer");
    fireEvent.change(nameInput, { target: { value: "Unsaved responsive draft" } });

    setViewportWidth(500);

    expect(await screen.findByRole("heading", { name: "My profile" }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByDisplayValue("Unsaved responsive draft")).toBeTruthy();
    window.history.replaceState(null, "", "/");
  }, 20_000);

  it("stores the card confirmation mode from settings", async () => {
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="settings"
        />
      </I18nProvider>,
    );

    const confirmationModes = await screen.findByRole("group", { name: "Card confirmations" });
    const always = within(confirmationModes).getByRole("button", { name: "Always ask" });
    const playOnly = within(confirmationModes).getByRole("button", { name: "Skip play-only cards" });
    expect(always.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(playOnly);

    expect(playOnly.getAttribute("aria-pressed")).toBe("true");
    expect(always.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("aegis.card-confirmation.mode")).toBe("skip-play-only");
  });

  it("updates the URL during navigation and follows browser history events", async () => {
    window.history.replaceState(null, "", "/settings");
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Resize Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
        />
      </I18nProvider>,
    );

    await screen.findByRole("heading", { name: "Preferences" });
    fireEvent.click(screen.getAllByRole("button", { name: "Decks" })[0]!);
    expect(await screen.findByRole("heading", { name: "Your decks" })).toBeTruthy();
    expect(window.location.pathname).toBe("/decks");

    window.history.replaceState(null, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("heading", { name: "Preferences" })).toBeTruthy();
  });
});
