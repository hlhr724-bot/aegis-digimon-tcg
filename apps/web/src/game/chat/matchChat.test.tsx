// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_CHANNEL,
  CHAT_COOLDOWN_MS,
  type ChatBroadcast,
  type ChatMessage,
  type ChatSender,
  type Seat,
} from "@aegis/shared";
import { BotLine } from "@aegis/shared/bot/BotLine";
import { LOCALE_STORAGE_KEY } from "@/i18n/locales";
import { playSound } from "../../design/sound";
import { I18nProvider } from "../../i18n";
import type { AegisRoom } from "../../net/client";
import { isChatSoundEnabled, setChatSoundEnabled } from "./chatSound";
import { MatchChatWindow } from "./MatchChatWindow";
import { useMatchChat, type ChatEntry, type MatchChat } from "./useMatchChat";

vi.mock("../../design/sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../design/sound")>()),
  playSound: vi.fn<typeof playSound>(),
}));

const player = (seat: Seat): ChatSender => ({ kind: "player", seat });
const spectator = (sessionId: string, number: number): Extract<ChatSender, { kind: "spectator" }> => ({
  kind: "spectator",
  sessionId,
  number,
});

function fakeRoom(sessionId = "viewer-session") {
  let deliver: ((broadcast: ChatBroadcast) => void) | undefined;
  const unsubscribe = vi.fn<() => void>();
  const room = {
    sessionId,
    connection: { isOpen: true },
    send: vi.fn<(type: string, message: ChatMessage) => void>(),
    onMessage: vi.fn<(type: string, handler: (broadcast: ChatBroadcast) => void) => () => void>((type, handler) => {
      if (type === CHAT_CHANNEL) deliver = handler;
      return unsubscribe;
    }),
  };
  return {
    room: room as unknown as AegisRoom,
    send: room.send,
    unsubscribe,
    receive: (broadcast: ChatBroadcast) => act(() => deliver?.(broadcast)),
  };
}

describe("useMatchChat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collects broadcasts, marks the viewer's own, and keeps the newest player message per seat", () => {
    const fake = fakeRoom();
    const { result } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
    fake.receive({ sender: player(1), message: { kind: "emote", emote: "offense" } });
    fake.receive({ sender: player(0), message: { kind: "text", text: "hi" } });
    fake.receive({ sender: spectator("someone", 1), message: { kind: "text", text: "go" } });
    fake.receive({ sender: player(1), message: { kind: "emote", emote: "runAway" } });
    expect(result.current.entries.map((entry) => entry.own)).toEqual([false, true, false]);
    expect(result.current.latest[1]?.message).toEqual({ kind: "emote", emote: "runAway" });
    expect(result.current.latest[0]?.message).toEqual({ kind: "text", text: "hi" });
  });

  it("recognises a spectator's own messages by session, never a player's seat", () => {
    const fake = fakeRoom("watcher");
    const { result } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: true }));
    fake.receive({ sender: player(0), message: { kind: "text", text: "player" } });
    fake.receive({ sender: spectator("watcher", 1), message: { kind: "text", text: "me" } });
    expect(result.current.entries.map((entry) => entry.own)).toEqual([true]);
    expect(result.current.latest).toEqual({});
  });

  it("hides the opponent and the spectators separately, but never the viewer's own messages", () => {
    const fake = fakeRoom();
    const { result } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
    fake.receive({ sender: player(1), message: { kind: "emote", emote: "scold" } });
    fake.receive({ sender: player(0), message: { kind: "emote", emote: "praise" } });
    fake.receive({ sender: spectator("someone", 1), message: { kind: "text", text: "lol" } });
    act(() => result.current.setMutedOpponent(true));
    expect(result.current.entries.map((entry) => entry.sender.kind)).toEqual(["player"]);
    expect(result.current.latest[1]).toBeUndefined();
    act(() => result.current.setMutedSpectators(true));
    expect(result.current.entries.map((entry) => entry.own)).toEqual([true]);
  });

  it("sends on the chat channel and waits out the cooldown before sending again", () => {
    vi.useFakeTimers();
    const fake = fakeRoom();
    const { result } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: true }));
    const message: ChatMessage = { kind: "emote", emote: "defense" };
    act(() => result.current.send?.(message));
    act(() => result.current.send?.(message));
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send).toHaveBeenCalledWith(CHAT_CHANNEL, message);
    expect(result.current.coolingDown).toBe(true);
    act(() => vi.advanceTimersByTime(CHAT_COOLDOWN_MS + 500));
    expect(result.current.coolingDown).toBe(false);
    act(() => result.current.send?.(message));
    expect(fake.send).toHaveBeenCalledTimes(2);
  });

  describe("chat sound", () => {
    afterEach(() => {
      setChatSoundEnabled(false);
      localStorage.clear();
      vi.mocked(playSound).mockClear();
    });

    it("stays silent by default", () => {
      const fake = fakeRoom();
      renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
      fake.receive({ sender: player(1), message: { kind: "text", text: "hi" } });
      expect(playSound).not.toHaveBeenCalled();
    });

    it("chimes for each live message from someone else once turned on", () => {
      setChatSoundEnabled(true);
      const fake = fakeRoom();
      renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
      fake.receive({ sender: player(0), message: { kind: "text", text: "mine" } });
      expect(playSound).not.toHaveBeenCalled();
      fake.receive({ sender: player(1), message: { kind: "text", text: "hi" } });
      fake.receive({ sender: spectator("someone", 1), message: { kind: "emote", emote: "praise" } });
      expect(playSound).toHaveBeenCalledTimes(1);
      expect(playSound).toHaveBeenCalledWith("prompt");
    });

    it("stays silent for muted senders", () => {
      setChatSoundEnabled(true);
      const fake = fakeRoom();
      const { result } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
      act(() => result.current.setMutedOpponent(true));
      act(() => result.current.setMutedSpectators(true));
      fake.receive({ sender: player(1), message: { kind: "text", text: "hi" } });
      fake.receive({ sender: spectator("someone", 1), message: { kind: "text", text: "go" } });
      expect(playSound).not.toHaveBeenCalled();
    });
  });

  it("unsubscribes when the room goes away", () => {
    const fake = fakeRoom();
    const { unmount } = renderHook(() => useMatchChat({ room: fake.room, viewerSeat: 0, spectating: false }));
    unmount();
    expect(fake.unsubscribe).toHaveBeenCalled();
  });
});

describe("MatchChatWindow", () => {
  beforeEach(() => {
    localStorage.setItem("aegis.locale", "en");
  });
  afterEach(() => {
    cleanup();
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  const entries: ChatEntry[] = [
    { id: 0, own: false, sender: player(1), message: { kind: "emote", emote: "changeTarget" } },
    { id: 1, own: false, sender: spectator("someone", 2), message: { kind: "text", text: "nice" } },
  ];

  function renderWindow(overrides: Partial<MatchChat> = {}, spectating = false) {
    const chat: MatchChat = {
      entries,
      latest: {},
      mutedOpponent: false,
      setMutedOpponent: vi.fn<(muted: boolean) => void>(),
      mutedSpectators: false,
      setMutedSpectators: vi.fn<(muted: boolean) => void>(),
      send: vi.fn<(message: ChatMessage) => void>(),
      coolingDown: false,
      ...overrides,
    };
    const onClose = vi.fn<() => void>();
    render(
      <I18nProvider>
        <MatchChatWindow chat={chat} spectating={spectating} seatNames={{ 0: "Agu", 1: "Tai" }} onClose={onClose} />
      </I18nProvider>,
    );
    return { chat, onClose };
  }

  it("blocks the current opponent on the server before enabling the local mute", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ blocked: true }));
    try {
      const { chat } = renderWindow({ roomId: "active-room" });
      fireEvent.click(screen.getByRole("button", { name: "Chat settings" }));
      fireEvent.click(screen.getByRole("button", { name: "Block player" }));
      await waitFor(() => expect(chat.setMutedOpponent).toHaveBeenCalledWith(true));
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/account/blocks/opponent"),
        expect.objectContaining({ method: "POST", body: JSON.stringify({ roomId: "active-room" }) }),
      );
    } finally {
      fetcher.mockRestore();
    }
  });

  const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Tamer commands" }));

  it("names players and spectators in the history and shows emotes as icons only", () => {
    renderWindow();
    const history = screen.getByRole("list").textContent;
    expect(history).toContain("Tai");
    expect(history).toContain("Spectator 2");
    expect(history).not.toContain("Change target!");
    expect(screen.getByRole("img", { name: "Change target!" })).toBeTruthy();
  });

  it.each([
    ["en", "Digivolve! Go, WarGreymon!"],
    ["pt-BR", "Digievoluir! Vai, WarGreymon!"],
  ])("shows a bot line in %s with the digivolved card name", async (locale, text) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    renderWindow({
      entries: [
        {
          id: 2,
          own: false,
          sender: player(1),
          message: {
            kind: "botLine",
            line: BotLine.BIG_DIGIVOLVE.value,
            text: "Digivolve! Go, WarGreymon!",
            cardId: "BT21-026",
          },
        },
      ],
    });
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it("expands and shrinks from the title bar", () => {
    renderWindow();
    const chatWindow = screen.getByRole("region", { name: "Players’ chat" });
    const expand = screen.getByRole("button", { name: "Expand chat" });
    fireEvent.click(expand);
    expect(chatWindow.hasAttribute("data-expanded")).toBe(true);
    expect(expand.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(expand);
    expect(chatWindow.hasAttribute("data-expanded")).toBe(false);
  });

  it("shows the emote icons only in the pop-up, which closes after an emote is sent", () => {
    const { chat } = renderWindow();
    expect(screen.queryByRole("button", { name: "Stay away!" })).toBeNull();
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Stay away!" }));
    expect(chat.send).toHaveBeenCalledWith({ kind: "emote", emote: "stayAway" });
    expect(screen.queryByRole("button", { name: "Stay away!" })).toBeNull();
  });

  it("closes the pop-up on a press outside it or on Escape, without closing the window", () => {
    const { onClose } = renderWindow();
    openPicker();
    fireEvent.pointerDown(screen.getByRole("list"));
    expect(screen.queryByRole("group", { name: "Tamer commands" })).toBeNull();
    openPicker();
    fireEvent.keyDown(screen.getByRole("button", { name: "Offense!" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Tamer commands" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends a normalized text message", () => {
    const { chat } = renderWindow();
    fireEvent.change(screen.getByRole("textbox", { name: "Message your opponent" }), {
      target: { value: "  good   game " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(chat.send).toHaveBeenCalledWith({ kind: "text", text: "good game" });
  });

  it("disables the emotes during the cooldown", () => {
    renderWindow({ coolingDown: true });
    openPicker();
    expect(screen.getByRole("button", { name: "Offense!" })).toHaveProperty("disabled", true);
  });

  const openSettings = () => fireEvent.click(screen.getByRole("button", { name: "Chat settings" }));

  it("shows a spectator's chosen name with a spectator tag", () => {
    renderWindow({
      entries: [
        {
          id: 0,
          own: false,
          sender: { ...spectator("x", 3), name: "Gabumon Fan" },
          message: { kind: "text", text: "hi" },
        },
      ],
    });
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("Gabumon Fan");
    expect(row.textContent).toContain("spectator");
  });

  it("lets a spectator write and mute other spectators, but not mute a player", () => {
    const { chat } = renderWindow({}, true);
    expect(screen.getByRole("region", { name: "Spectators’ chat" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message other spectators" }), { target: { value: "gg" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(chat.send).toHaveBeenCalledWith({ kind: "text", text: "gg" });
    openSettings();
    expect(screen.queryByRole("switch", { name: "Mute opponent" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Mute spectators" }));
    expect(chat.setMutedSpectators).toHaveBeenCalledWith(true);
  });

  it("keeps the mute switches in the settings menu, which closes on a press outside it", () => {
    renderWindow();
    expect(screen.queryByRole("switch")).toBeNull();
    openSettings();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    fireEvent.pointerDown(screen.getByRole("list"));
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("gives a player only the opponent mute switch and closes from the title bar", () => {
    const { chat, onClose } = renderWindow();
    openSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Mute opponent" }));
    expect(chat.setMutedOpponent).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("switch", { name: "Mute spectators" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("turns the chat sound on from the settings menu", () => {
    renderWindow();
    openSettings();
    const toggle = screen.getByRole("switch", { name: "Chat sound" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(isChatSoundEnabled()).toBe(true);
    setChatSoundEnabled(false);
  });

  it("moves with its title bar and stays inside the viewport", () => {
    renderWindow();
    const chatWindow = screen.getByRole("region", { name: "Players’ chat" });
    vi.spyOn(chatWindow, "getBoundingClientRect").mockReturnValue(new DOMRect(700, 80, 288, 300));
    const title = screen.getByRole("heading", { name: "Players’ chat" }).parentElement!;
    fireEvent.pointerDown(title, { pointerId: 1, button: 0, clientX: 720, clientY: 90 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 420, clientY: 190 });
    expect(chatWindow.style.left).toBe("400px");
    expect(chatWindow.style.top).toBe("180px");
    fireEvent.pointerMove(title, { pointerId: 1, clientX: -500, clientY: -500 });
    expect(chatWindow.style.left).toBe("4px");
    expect(chatWindow.style.top).toBe("4px");
    fireEvent.pointerUp(title, { pointerId: 1 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 600, clientY: 300 });
    expect(chatWindow.style.left).toBe("4px");
  });
});
