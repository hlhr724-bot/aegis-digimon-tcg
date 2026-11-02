import { SpectatorIdentitySetting } from "@/account/SpectatorIdentitySetting";
import { ShareDeckAfterMatchSetting } from "@/account/ShareDeckAfterMatchSetting";
import { accountApi } from "@/account/client";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import { I18nProvider } from "../i18n";
import { arePileCountsShown, setPileCountsShown } from "../design/pileCounts";
import { isKeepAwakeEnabled, setKeepAwakeEnabled } from "../design/keepAwake";
import { areProfileStatsShown, setProfileStatsShown } from "../account/profileStats";
import type { RemoteAccount } from "../account/client";
import { setSoundEnabled } from "../design/sound";
import { isChatSoundEnabled, setChatSoundEnabled } from "../game/chat/chatSound";

const player = { name: "Guest Tamer", color: "Blue", shards: 0, guestAvatarId: null };
const account: RemoteAccount = {
  id: "account-1",
  displayName: "Tamer",
  avatarUrl: null,
  avatarId: null,
  avatarSource: "initials",
  isAdmin: false,
  roles: [],
};

describe("settings layout", () => {
  afterEach(() => cleanup());

  it("links every section from the section navigation", () => {
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "Preferences sections" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Appearance",
      "Language & text",
      "Card sleeves",
      "Token art",
      "Sound & music",
      "Gameplay",
      "Arena",
    ]);
    for (const link of links) {
      const target = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(target?.tagName).toBe("SECTION");
    }
    expect(links[0]!.getAttribute("aria-current")).toBe("location");
    expect(screen.queryByRole("link", { name: /Customize/ })).toBeNull();
  });

  it("toggles dark mode from a switch", () => {
    const onToggleDark = vi.fn<(dark: boolean) => void>();
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={onToggleDark} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("switch", { name: /Dark mode/ }));

    expect(onToggleDark).toHaveBeenCalledWith(true);
  });

  it("opens on the sound section when the music menu asks for it", () => {
    const scrollTo = vi.fn<(options?: ScrollToOptions) => void>();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    render(
      <I18nProvider>
        <Settings
          player={player}
          account={null}
          dark={false}
          onToggleDark={() => undefined}
          initialSectionId="settings-sound"
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Sound & music" }));
    expect(scrollTo).toHaveBeenCalledOnce();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  });
});

describe("settings effect speed", () => {
  afterEach(() => {
    cleanup();
    vi.doUnmock("../features");
    vi.resetModules();
  });

  async function renderSettings() {
    const { Settings: FreshSettings } = await import("./Settings");
    const { I18nProvider: FreshProvider } = await import("../i18n");
    const pacing = await import("../game/pacing");
    render(
      <FreshProvider>
        <FreshSettings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </FreshProvider>,
    );
    return pacing;
  }

  it("stays hidden while sequential pacing is off", async () => {
    vi.resetModules();
    vi.doMock("../features", () => ({ SEQUENTIAL_PACING_ENABLED: false }));
    await renderSettings();
    expect(screen.queryByRole("group", { name: "Effect speed" })).toBeNull();
  });

  it("sets the effect speed when sequential pacing is on", async () => {
    vi.resetModules();
    vi.doMock("../features", () => ({ SEQUENTIAL_PACING_ENABLED: true }));
    const pacing = await renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Fast" }));
    expect(pacing.getEffectSpeed()).toBe("fast");
    expect(screen.getByRole("button", { name: "Fast" }).getAttribute("aria-pressed")).toBe("true");
    pacing.setEffectSpeed("normal");
  });
});

describe("settings pile counts", () => {
  afterEach(() => {
    cleanup();
    setPileCountsShown(false);
    localStorage.clear();
  });

  it("starts off and stores the player's choice", () => {
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Show pile counts/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(arePileCountsShown()).toBe(true);
    expect(localStorage.getItem("aegis.pile-counts")).toBe("shown");
  });
});

describe("settings keep awake", () => {
  afterEach(() => {
    cleanup();
    setKeepAwakeEnabled(true);
    localStorage.clear();
  });

  it("starts on and stores the player's choice", () => {
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Keep the screen awake/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(isKeepAwakeEnabled()).toBe(false);
    expect(localStorage.getItem("aegis.keep-awake.enabled")).toBe("false");
  });
});

describe("settings profile stats", () => {
  afterEach(() => {
    cleanup();
    setProfileStatsShown(false);
  });

  it("lets a signed-in player show hidden profile match stats", () => {
    setProfileStatsShown(false);
    render(
      <I18nProvider>
        <Settings player={player} account={account} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "Preferences sections" });
    expect(within(navigation).getByRole("link", { name: "My profile" })).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: /Show match stats/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(areProfileStatsShown()).toBe(true);
  });

  it("leaves the profile section out for guests", () => {
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.queryByRole("switch", { name: /Show match stats/ })).toBeNull();
  });
});

describe("settings chat sound", () => {
  afterEach(() => {
    cleanup();
    setChatSoundEnabled(false);
    setSoundEnabled(true);
    localStorage.clear();
  });

  function renderSettings() {
    render(
      <I18nProvider>
        <Settings player={player} account={null} dark={false} onToggleDark={() => undefined} />
      </I18nProvider>,
    );
    return screen.getByRole("switch", { name: /Chat sound/ });
  }

  it("starts off and stores the player's choice", () => {
    const toggle = renderSettings();
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(isChatSoundEnabled()).toBe(true);
    expect(localStorage.getItem("aegis.chat.sound")).toBe("on");
  });

  it("is unavailable while sound effects are off", () => {
    const toggle = renderSettings();

    fireEvent.click(screen.getByRole("switch", { name: /^Sound effects/ }));

    expect(toggle).toHaveProperty("disabled", true);
  });
});

describe("account deck sharing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults to enabled and persists opting out", async () => {
    vi.spyOn(accountApi, "preferences").mockResolvedValue({});
    const save = vi.spyOn(accountApi, "updatePreferences").mockResolvedValue({ shareDeckAfterMatch: false });
    render(
      <I18nProvider>
        <ShareDeckAfterMatchSetting />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Share my deck after the match/ });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(save).toHaveBeenCalledWith({ shareDeckAfterMatch: false });
  });

  it("restores an opt-out and preserves it when saving fails", async () => {
    vi.spyOn(accountApi, "preferences").mockResolvedValue({ shareDeckAfterMatch: false });
    vi.spyOn(accountApi, "updatePreferences").mockRejectedValue(new Error("offline"));
    render(
      <I18nProvider>
        <ShareDeckAfterMatchSetting />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Share my deck after the match/ });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});

describe("spectator identity privacy", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults to public identity and persists hiding it", async () => {
    vi.spyOn(accountApi, "preferences").mockResolvedValue({});
    const save = vi.spyOn(accountApi, "updatePreferences").mockResolvedValue({ hideIdentityFromSpectators: true });
    render(
      <I18nProvider>
        <SpectatorIdentitySetting />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Hide my identity from spectators/ });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(save).toHaveBeenCalledWith({ hideIdentityFromSpectators: true });
  });

  it("restores an opt-out and preserves it when saving fails", async () => {
    vi.spyOn(accountApi, "preferences").mockResolvedValue({ hideIdentityFromSpectators: true });
    vi.spyOn(accountApi, "updatePreferences").mockRejectedValue(new Error("offline"));
    render(
      <I18nProvider>
        <SpectatorIdentitySetting />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: /Hide my identity from spectators/ });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
