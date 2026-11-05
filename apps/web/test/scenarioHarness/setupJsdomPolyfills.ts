/**
 * jsdom environment polyfills the real client needs but jsdom doesn't provide.
 * Runs before every test file regardless of environment (vite.config.ts
 * test.setupFiles), so anything jsdom-only is guarded on `typeof window`.
 */
import { WebSocket } from "ws";

// Real field layouts observe their height. jsdom has no layout engine or resize events;
// callers still take their initial measurement, and tests supply geometry when needed.
if (typeof window !== "undefined" && typeof window.ResizeObserver !== "function") {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = window.ResizeObserver;
}

// jsdom ships a `WebSocket` global that throws "not implemented" on connect
// rather than actually opening a socket. Scenario tests need a real client
// websocket to reach the in-process Colyseus server
// (test/scenarioHarness/server.ts), so this swaps in the `ws` package's
// implementation. @colyseus/sdk itself already falls back to `ws` when
// `globalThis.WebSocket` is undefined; jsdom's stub defeats that fallback by
// merely existing, so it must be replaced outright.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

// jsdom ships no `PointerEvent` constructor at all (only the base `Event`).
// `@testing-library/dom`'s `fireEvent.pointerDown/Move/Up` shorthands look up
// `window.PointerEvent` to build the native event (falling back to plain `Event`
// when it's missing) — without it, `clientX`/`clientY` passed to those shorthands
// are silently dropped (a plain `Event`'s constructor init dict doesn't recognize
// them), which breaks any test driving the client's real drag-and-drop gesture
// (GameScreen.tsx's pointer-move-distance "started" threshold and its drop-point
// zone lookup both read `clientX`/`clientY` off the raw native event). A minimal
// `MouseEvent`-based polyfill (pointer id fields only) is enough for that gesture.
if (typeof window !== "undefined" && typeof window.PointerEvent !== "function") {
  class PointerEventPolyfill extends MouseEvent {
    public readonly pointerId: number;
    public readonly isPrimary: boolean;
    public readonly pointerType: string;
    constructor(
      type: string,
      params: MouseEventInit & { pointerId?: number; isPrimary?: boolean; pointerType?: string } = {},
    ) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.isPrimary = params.isPrimary ?? true;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  globalThis.PointerEvent = window.PointerEvent;
}

// jsdom has no `matchMedia` implementation at all. apps/web/src/design/cards.tsx
// reads it to decide whether hover-zoom is enabled; a scenario test rendering
// real cards needs a real (if inert) implementation instead of a thrown error.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const computeStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element, pseudoElement?: string | null) => {
    if (!pseudoElement) return computeStyle(element);
    const declaration = document.createElement("span").style;
    declaration.setProperty("content", "none");
    return declaration;
  }) as typeof window.getComputedStyle;
}
