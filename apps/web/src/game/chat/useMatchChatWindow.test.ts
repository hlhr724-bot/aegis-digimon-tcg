// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatEntry, MatchChat } from "./useMatchChat";
import { useMatchChatWindow } from "./useMatchChatWindow";

vi.mock("../../design/sound", () => ({ playAttentionSound: vi.fn<(kind: string) => void>() }));

function chatWith(entries: readonly ChatEntry[]): MatchChat {
  return {
    entries,
    latest: {},
    mutedOpponent: false,
    setMutedOpponent: () => {},
    mutedSpectators: false,
    setMutedSpectators: () => {},
    send: undefined,
    coolingDown: false,
  };
}

const greeting: ChatEntry = {
  id: 0,
  own: false,
  sender: { kind: "player", seat: 1 },
  message: { kind: "text", text: "gl" },
};

function render(initial: { chat: MatchChat | undefined; resultShown: boolean }) {
  return renderHook((props) => useMatchChatWindow(props), { initialProps: initial });
}

describe("the match chat window at the end of the match", () => {
  it("opens by itself when the result appears after a conversation", () => {
    const chat = chatWith([greeting]);
    const hook = render({ chat, resultShown: false });
    expect(hook.result.current.open).toBe(false);

    hook.rerender({ chat, resultShown: true });

    expect(hook.result.current.open).toBe(true);
  });

  it("stays closed when nobody chatted during the match", () => {
    const chat = chatWith([]);
    const hook = render({ chat, resultShown: false });

    hook.rerender({ chat, resultShown: true });

    expect(hook.result.current.open).toBe(false);
  });

  it("stays closed after the viewer closes it on the result screen", () => {
    const chat = chatWith([greeting]);
    const hook = render({ chat, resultShown: false });
    hook.rerender({ chat, resultShown: true });

    act(() => hook.result.current.close());
    hook.rerender({ chat: chatWith([greeting, { ...greeting, id: 1 }]), resultShown: true });

    expect(hook.result.current.open).toBe(false);
    expect(hook.result.current.unread).toBe(1);
  });

  it("does not open without a live chat", () => {
    const hook = render({ chat: undefined, resultShown: false });

    hook.rerender({ chat: undefined, resultShown: true });

    expect(hook.result.current.open).toBe(false);
  });
});
