import { afterEach, describe, expect, it, vi } from "vitest";
import { createArenaDomWatch } from "@/game/arena3d/field/createArenaDomWatch";

type MutationEntry = {
  type: string;
  attributeName: string | null;
  target: { own: boolean; layout?: boolean };
  oldValue?: string | null;
};

type Notify = (records: readonly MutationEntry[]) => void;

function installFakeObserver() {
  const observers: { notify: Notify; disconnected: boolean }[] = [];
  class FakeMutationObserver {
    private readonly entry: { notify: Notify; disconnected: boolean };

    constructor(notify: Notify) {
      this.entry = { notify, disconnected: false };
      observers.push(this.entry);
    }

    observe() {
      return undefined;
    }

    disconnect() {
      this.entry.disconnected = true;
    }
  }
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  return observers;
}

function createWatch() {
  const observers = installFakeObserver();
  const watch = createArenaDomWatch({
    root: {} as HTMLElement,
    isOwnStyleWrite: (target) => (target as unknown as { own: boolean }).own,
    isLayoutTarget: (target) => (target as unknown as { layout?: boolean }).layout === true,
  });
  return { watch, observer: observers[0]! };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watching the arena DOM for proxy changes", () => {
  it("reports a change on the first frame so the first read happens", () => {
    const { watch } = createWatch();

    expect(watch.consumeChanges()).toBe(true);
    expect(watch.consumeChanges()).toBe(false);
  });

  it("ignores the inline translate the arena writes to its own slots and overlay", () => {
    const { watch, observer } = createWatch();
    watch.consumeChanges();

    observer.notify([{ type: "attributes", attributeName: "style", target: { own: true } }]);

    expect(watch.consumeChanges()).toBe(false);
  });

  it("reports class, child, and foreign style changes", () => {
    const { watch, observer } = createWatch();
    watch.consumeChanges();

    observer.notify([{ type: "attributes", attributeName: "class", target: { own: true } }]);
    expect(watch.consumeChanges()).toBe(true);

    observer.notify([{ type: "childList", attributeName: null, target: { own: false } }]);
    expect(watch.consumeChanges()).toBe(true);

    observer.notify([{ type: "attributes", attributeName: "style", target: { own: false } }]);
    expect(watch.consumeChanges()).toBe(true);
  });

  it("reports a layout change only for layout targets", () => {
    const { watch, observer } = createWatch();
    watch.consumeChanges();
    expect(watch.consumeLayoutChanges()).toBe(true);

    observer.notify([{ type: "childList", attributeName: null, target: { own: false } }]);
    expect(watch.consumeChanges()).toBe(true);
    expect(watch.consumeLayoutChanges()).toBe(false);

    observer.notify([{ type: "attributes", attributeName: "class", target: { own: false, layout: true } }]);
    expect(watch.consumeChanges()).toBe(true);
    expect(watch.consumeLayoutChanges()).toBe(true);
  });

  it("stops observing when disconnected", () => {
    const { watch, observer } = createWatch();

    watch.disconnect();

    expect(observer.disconnected).toBe(true);
  });
});
