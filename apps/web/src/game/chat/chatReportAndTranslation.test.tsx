// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatSender } from "@aegis/shared/protocol/chat";
import { CHAT_REPORT_CHANNEL, type ChatReportUpdate } from "@aegis/shared/chat/ChatReportUpdate";
import { I18nProvider } from "@/i18n/I18nProvider";
import { LOCALE_STORAGE_KEY } from "@/i18n/locales";
import type { AegisRoom } from "@/net/client";
import { MatchChatWindow } from "@/game/chat/MatchChatWindow";
import { useMatchChat, type ChatEntry, type MatchChat } from "@/game/chat/useMatchChat";

const AUTO_TRANSLATE_STORAGE_KEY = "aegis.chat.autoTranslate";
const opponent: ChatSender = { kind: "player", seat: 1 };
const viewer: ChatSender = { kind: "player", seat: 0 };
const foreignEntry: ChatEntry = { id: 0, own: false, sender: opponent, message: { kind: "text", text: "boa sorte" } };

const detect = vi.fn<(text: string) => Promise<{ detectedLanguage: string; confidence: number }[]>>();
const translate = vi.fn<(text: string) => Promise<string>>();
const availability = vi.fn<() => Promise<string>>();
const createTranslator = vi.fn<(pair: { sourceLanguage: string; targetLanguage: string }) => Promise<unknown>>();

function installTranslationApi(): void {
  detect.mockResolvedValue([{ detectedLanguage: "pt", confidence: 0.9 }]);
  translate.mockResolvedValue("<b>good luck</b>");
  availability.mockResolvedValue("available");
  createTranslator.mockResolvedValue({ translate });
  vi.stubGlobal("Translator", { availability, create: createTranslator });
  vi.stubGlobal("LanguageDetector", { create: async () => ({ detect }) });
}

function renderWindow(overrides: Partial<MatchChat> = {}, spectating = false) {
  const chat: MatchChat = {
    entries: [foreignEntry],
    latest: {},
    mutedOpponent: false,
    setMutedOpponent: vi.fn<(muted: boolean) => void>(),
    mutedSpectators: false,
    setMutedSpectators: vi.fn<(muted: boolean) => void>(),
    send: vi.fn<(message: ChatMessage) => void>(),
    coolingDown: false,
    ...overrides,
  };
  const rendered = render(
    <I18nProvider>
      <MatchChatWindow chat={chat} spectating={spectating} seatNames={{ 0: "Agu", 1: "Tai" }} onClose={() => {}} />
    </I18nProvider>,
  );
  return { chat, ...rendered };
}

function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Chat settings" }));
}

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, "en");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("match chat report", () => {
  it("offers the report only after the server allows it and sends an intent without message text", () => {
    let deliver: ((update: ChatReportUpdate) => void) | undefined;
    const send = vi.fn<(type: string, message?: unknown) => void>();
    const room = {
      sessionId: "viewer",
      connection: { isOpen: true },
      send,
      onMessage: vi.fn<(type: string, handler: (update: ChatReportUpdate) => void) => () => void>((type, handler) => {
        if (type === CHAT_REPORT_CHANNEL) {
          deliver = handler;
        }
        return () => {};
      }),
    } as unknown as AegisRoom;
    const { result } = renderHook(() => useMatchChat({ room, viewerSeat: 0, spectating: false }));
    expect(result.current.reportOpponent).toBeUndefined();
    act(() => deliver?.({ status: "available" }));
    act(() => result.current.reportOpponent?.());
    expect(send.mock.calls).toEqual([[CHAT_REPORT_CHANNEL]]);
    act(() => deliver?.({ status: "reported" }));
    expect(result.current.reportStatus).toBe("reported");
  });

  it("hides the report from players the server has not offered it to and from spectators", () => {
    renderWindow();
    openSettings();
    expect(screen.queryByRole("button", { name: "Report opponent" })).toBeNull();
    cleanup();
    renderWindow({ reportStatus: "available", reportOpponent: vi.fn<() => void>() }, true);
    openSettings();
    expect(screen.queryByRole("button", { name: "Report opponent" })).toBeNull();
  });

  it("reports the opponent from the settings menu and confirms once the server stored it", () => {
    const reportOpponent = vi.fn<() => void>();
    const { rerender, chat } = renderWindow({ reportStatus: "available", reportOpponent });
    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Report opponent" }));
    expect(reportOpponent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Report sent to the moderators.")).toBeNull();
    rerender(
      <I18nProvider>
        <MatchChatWindow
          chat={{ ...chat, reportStatus: "reported" }}
          spectating={false}
          seatNames={{ 0: "Agu", 1: "Tai" }}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Report sent to the moderators.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report opponent" })).toHaveProperty("disabled", true);
  });
});

describe("match chat translation", () => {
  it("shows no translation action or setting when the browser has no translation API", async () => {
    renderWindow();
    openSettings();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Translate messages automatically" })).toBeNull();
  });

  it("translates another player's message on request, as plain text under the original", async () => {
    installTranslationApi();
    const { container } = renderWindow();
    fireEvent.click(await screen.findByRole("button", { name: "Translate" }));
    expect(await screen.findByText("<b>good luck</b>")).toBeTruthy();
    expect(container.ownerDocument.querySelector(".match-chat-window__translation b")).toBeNull();
    expect(screen.getByText("boa sorte")).toBeTruthy();
    expect(createTranslator).toHaveBeenCalledWith({ sourceLanguage: "pt", targetLanguage: "en" });
    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.queryByText("<b>good luck</b>")).toBeNull();
    expect(screen.getByRole("button", { name: "Translate" })).toBeTruthy();
  });

  it("offers nothing for the viewer's language, own messages, emotes or an unavailable language pair", async () => {
    installTranslationApi();
    detect.mockResolvedValue([{ detectedLanguage: "en", confidence: 0.9 }]);
    renderWindow();
    await waitFor(() => expect(detect).toHaveBeenCalledWith("boa sorte"));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull();
    cleanup();
    detect.mockClear();
    renderWindow({
      entries: [
        { id: 1, own: true, sender: viewer, message: { kind: "text", text: "olá" } },
        { id: 2, own: false, sender: opponent, message: { kind: "emote", emote: "praise" } },
      ],
    });
    await act(async () => {});
    expect(detect).not.toHaveBeenCalled();
    cleanup();
    detect.mockResolvedValue([{ detectedLanguage: "pt", confidence: 0.9 }]);
    availability.mockResolvedValue("unavailable");
    renderWindow();
    await waitFor(() => expect(availability).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull();
  });

  it("reports a language pack download inline and falls back to the original text when translation fails", async () => {
    installTranslationApi();
    detect.mockResolvedValue([{ detectedLanguage: "ja", confidence: 0.9 }]);
    availability.mockResolvedValue("downloadable");
    let failDownload: (error: Error) => void = () => {};
    createTranslator.mockReturnValue(
      new Promise((_resolve, reject) => {
        failDownload = reject;
      }),
    );
    renderWindow();
    fireEvent.click(await screen.findByRole("button", { name: "Translate" }));
    expect(await screen.findByText("Downloading language pack…")).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", false);
    await act(async () => failDownload(new Error("download failed")));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("boa sorte")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Translate" })).toBeNull();
  });

  it("translates incoming messages without a click once the stored preference is on", async () => {
    installTranslationApi();
    renderWindow();
    expect(await screen.findByRole("button", { name: "Translate" })).toBeTruthy();
    openSettings();
    const toggle = screen.getByRole("switch", { name: "Translate messages automatically" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(localStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY)).toBe("on");
    expect(await screen.findByText("<b>good luck</b>")).toBeTruthy();
    fireEvent.click(toggle);
    expect(localStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY)).toBe("off");
    await waitFor(() => expect(screen.queryByText("<b>good luck</b>")).toBeNull());
  });
});
