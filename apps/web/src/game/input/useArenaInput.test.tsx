import { Dialog } from "@/design/primitives";
import { EmotePicker } from "@/game/chat/EmotePicker";
import { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArenaInput } from "@/game/input/useArenaInput";
import { DecisionReorderHandle } from "@/game/overlay/choice/DecisionReorderHandle";
import { I18nProvider } from "@/i18n/I18nProvider";

function TestBoard({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const input = useArenaInput({ root, onCancel });
  const [order, setOrder] = useState(["one", "two", "three"]);
  return (
    <div ref={root} className="game-layout">
      <output>{input.device}</output>
      <div data-arena-region="hand">
        <button onClick={onConfirm}>Card action</button>
      </div>
      <input aria-label="Chat" />
      <div role="dialog">
        <div>
          {order.map((id, index) => (
            <div key={id} data-testid={id}>
              <DecisionReorderHandle
                position={index + 1}
                onCancel={() => undefined}
                onMove={(delta) =>
                  setOrder((current) => {
                    const next = [...current];
                    const destination = index + delta;
                    if (destination >= 0 && destination < next.length) {
                      [next[index], next[destination]] = [next[destination]!, next[index]!];
                    }
                    return next;
                  })
                }
                onRestore={(position) =>
                  setOrder((current) => {
                    const next = current.filter((value) => value !== id);
                    next.splice(position - 1, 0, id);
                    return next;
                  })
                }
              />
              {id}
            </div>
          ))}
        </div>
        <button data-arena-cancel onClick={onCancel}>
          Close
        </button>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}

function TestNestedSurfaces({ onCancel }: { onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useArenaInput({ root, onCancel });
  return (
    <div ref={root} className="game-layout">
      <button ref={trigger} onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <Dialog labelledBy="test-dialog-title" onClose={() => setOpen(false)}>
          <h2 id="test-dialog-title">Test dialog</h2>
          <button ref={pickerTrigger} onClick={() => setPickerOpen(true)}>
            Open commands
          </button>
          {pickerOpen ? (
            <EmotePicker
              disabled={false}
              anchor={pickerTrigger.current}
              onPick={() => undefined}
              onClose={() => setPickerOpen(false)}
            />
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 60,
    height: 80,
  } as DOMRect);
  localStorage.setItem("aegis.locale", "en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared keyboard routing", () => {
  it("confirms once without reaching existing window shortcuts and ignores held confirmation", () => {
    const onConfirm = vi.fn<() => void>();
    const globalShortcut = vi.fn<() => void>();
    window.addEventListener("keydown", globalShortcut);
    render(
      <I18nProvider>
        <TestBoard onConfirm={onConfirm} onCancel={vi.fn<() => void>()} />
      </I18nProvider>,
    );
    const button = screen.getByRole("button", { name: "Confirm" });
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(globalShortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", globalShortcut);
  });

  it("wakes keyboard input after the window lost focus without a focus event", () => {
    const onConfirm = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TestBoard onConfirm={onConfirm} onCancel={vi.fn<() => void>()} />
      </I18nProvider>,
    );
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    const button = screen.getByRole("button", { name: "Confirm" });
    button.focus();
    act(() => {
      fireEvent.keyDown(button, { key: "Enter" });
    });
    expect(screen.getByRole("status").textContent).toBe("keyboard");
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("leaves typing and modified keys to the focused control", () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TestBoard onConfirm={onConfirm} onCancel={onCancel} />
      </I18nProvider>,
    );
    const chat = screen.getByRole("textbox", { name: "Chat" });
    chat.focus();
    for (const key of ["Enter", "Escape", "i", "e", "ArrowRight"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => {
        chat.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(document.activeElement).toBe(chat);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Confirm" });
    button.focus();
    fireEvent.keyDown(button, { key: "Enter", altKey: true });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("reorders by identity, reverts a cancelled move, and consumes only that cancel", () => {
    const onCancel = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TestBoard onConfirm={vi.fn<() => void>()} onCancel={onCancel} />
      </I18nProvider>,
    );
    const first = screen.getByTestId("one").querySelector("button")!;
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByTestId("one").parentElement?.lastElementChild).toBe(screen.getByTestId("one"));
    fireEvent.keyDown(first, { key: "Escape" });
    expect(screen.getByTestId("one").parentElement?.firstElementChild).toBe(screen.getByTestId("one"));
    expect(first.getAttribute("aria-pressed")).toBe("false");
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

it("closes only the nested popover and then its generic dialog", () => {
  const onCancel = vi.fn<() => void>();
  render(
    <I18nProvider>
      <TestNestedSurfaces onCancel={onCancel} />
    </I18nProvider>,
  );
  const open = screen.getByRole("button", { name: "Open dialog" });
  open.focus();
  fireEvent.keyDown(open, { key: "Enter" });
  const picker = screen.getByRole("button", { name: "Open commands" });
  picker.focus();
  fireEvent.keyDown(picker, { key: "Enter" });
  expect(screen.getByRole("group", { name: "Tamer commands" })).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("group", { name: "Tamer commands" })).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(picker, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(open);
  expect(onCancel).not.toHaveBeenCalled();
});

it("keeps pointer gestures separate from the button reorder mode", () => {
  render(
    <I18nProvider>
      <TestBoard onConfirm={() => undefined} onCancel={() => undefined} />
    </I18nProvider>,
  );
  const handle = screen.getByTestId("one").querySelector("button")!;
  fireEvent.click(handle, { detail: 1 });
  expect(handle.getAttribute("aria-pressed")).toBe("false");
  handle.focus();
  fireEvent.keyDown(handle, { key: "Enter" });
  expect(handle.getAttribute("aria-pressed")).toBe("true");
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
  expect(handle.getAttribute("aria-pressed")).toBe("false");
});

type TestNativeChatBoundaryParams = { onBoardAction: () => void };
function TestNativeChatBoundary({ onBoardAction }: TestNativeChatBoundaryParams) {
  const root = useRef<HTMLDivElement>(null);
  useArenaInput({ root, onCancel: onBoardAction });
  return (
    <>
      <div ref={root} className="game-layout">
        <button onClick={onBoardAction}>Board action</button>
      </div>
      <aside data-arena-native-input>
        <button>Quick chat action</button>
      </aside>
    </>
  );
}

it("keeps quick-chat button keys native instead of dispatching board commands", () => {
  const onBoardAction = vi.fn<() => void>();
  render(
    <I18nProvider>
      <TestNativeChatBoundary onBoardAction={onBoardAction} />
    </I18nProvider>,
  );
  const chatAction = screen.getByRole("button", { name: "Quick chat action" });
  chatAction.focus();
  for (const key of ["Enter", " ", "Escape", "ArrowRight"]) {
    expect(fireEvent.keyDown(chatAction, { key })).toBe(true);
  }
  expect(onBoardAction).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(chatAction);
});
