// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { CardOpenerProvider } from "./cardLinks";
import { NarrationStack } from "./NarrationStack";
import { narrationReadingTime, type NarrationItem } from "./narration";
import type { MatchNotice } from "./notices";
import { Side } from "./side";
import { TIMINGS } from "./timings";

afterEach(cleanup);

it("translates the folded card name without nesting a card-opening button", async () => {
  const shown: NarrationItem = {
    ...item("translated-name"),
    notice: {
      id: "translated-name",
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "effect", cardId: "ST18-05", timing: "OnPlay", count: 2 },
    },
  };
  const onOpenCard = vi.fn<(cardId: string) => void>();
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <CardOpenerProvider onOpenCard={onOpenCard}>
        <NarrationStack
          narration={new Map([[shown.id, shown]])}
          compact
          nowMs={0}
          rejection={null}
          onAdvance={() => undefined}
          onDismissRejection={() => undefined}
        />
      </CardOpenerProvider>
    </I18nContext.Provider>,
  );
  await waitFor(() => expect(container.querySelector(".narration-peek__name")?.textContent).toBe("五彩兽 ×2"));
  expect(container.querySelector(".narration-peek button")).toBeNull();
  expect(onOpenCard).not.toHaveBeenCalled();
});

it("translates the folded resolving clause using the notice card", async () => {
  const shown: NarrationItem = {
    ...item("translated-effect"),
    notice: {
      id: "translated-effect",
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "effect", cardId: "LM-034", timing: "Main" },
    },
  };
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <NarrationStack
        narration={new Map([[shown.id, shown]])}
        compact
        nowMs={0}
        rejection={null}
        onAdvance={() => undefined}
        onDismissRejection={() => undefined}
      />
    </I18nContext.Provider>,
  );
  await waitFor(() =>
    expect(container.querySelector(".narration-peek__clause")?.textContent).toContain("蓝色/红色数码宝贝卡牌"),
  );
  expect(container.querySelector(".narration-peek__clause")?.textContent).not.toContain("内存值");
});

// The dock holds the upper right, which is the card column's corner — so that is the
// column that steps out of its way.
it("reserves space for the security dock and releases it when the dock closes", () => {
  const opponent = { ...cardItem("security-reveal"), side: Side.Opponent as const };
  const view = (active: boolean, compact: boolean) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map([[opponent.id, opponent]])}
        compact={compact}
        securityDockActive={active}
        rejection={null}
        nowMs={0}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const { container, rerender } = render(view(true, false));
  expect(container.querySelector('[data-slot="narration-cards"][data-security-dock]')).toBeTruthy();
  rerender(view(false, false));
  expect(container.querySelector("[data-security-dock]")).toBeNull();
  rerender(view(true, true));
  expect(container.querySelector('[data-slot="narration"][data-security-dock]')).toBeTruthy();
});

function cardItem(id: string): NarrationItem {
  return {
    id,
    side: Side.Opponent,
    batchId: "batch",
    createdAt: 0,
    panel: {
      id,
      titleKey: "panel.revealedCards",
      side: Side.Opponent,
      cards: [{ cardId: "BT1-010", badge: 1 }],
      ordered: false,
      createdAt: 0,
    },
  };
}

function item(id: string): NarrationItem {
  return {
    id,
    side: Side.Viewer,
    batchId: "batch",
    createdAt: 0,
    notice: { id, side: Side.Viewer, fromSecurity: false, createdAt: 0, body: { variant: "recovery", amount: 1 } },
  };
}

it("shows only two recent toasts per side without dismissing older occurrences", () => {
  const onAdvance = vi.fn<(id: string) => void>();
  const entries = [
    item("left-old"),
    item("left-middle"),
    item("left-new"),
    cardItem("right-old"),
    cardItem("right-middle"),
    cardItem("right-new"),
  ];
  const view = (shown: NarrationItem[]) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map(shown.map((entry) => [entry.id, entry]))}
        nowMs={0}
        rejection={null}
        onAdvance={onAdvance}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const { container, rerender } = render(view(entries));
  const ids = (slot: string) =>
    [...container.querySelectorAll(`[data-slot="${slot}"] .narration-item`)].map((node) =>
      node.getAttribute("data-narration-id"),
    );
  expect(ids("narration-text")).toEqual(["left-middle", "left-new"]);
  expect(ids("narration-cards")).toEqual(["right-middle", "right-new"]);
  expect(onAdvance).not.toHaveBeenCalled();
  rerender(view(entries.filter((entry) => !entry.id.endsWith("new"))));
  expect(ids("narration-text")).toEqual(["left-old", "left-middle"]);
  expect(ids("narration-cards")).toEqual(["right-old", "right-middle"]);
});

it("counts a rejection toward the left limit and keeps its own dismissal", () => {
  const dismissRejection = vi.fn<() => void>();
  const rejected: MatchNotice = {
    id: "refused",
    side: Side.Viewer,
    fromSecurity: false,
    createdAt: 0,
    body: { variant: "rejection", reason: "Cannot play" },
  };
  const { container } = render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([item("old"), item("new")].map((entry) => [entry.id, entry]))}
        nowMs={0}
        rejection={rejected}
        onAdvance={() => {}}
        onDismissRejection={dismissRejection}
      />
    </I18nProvider>,
  );
  const left = container.querySelector('[data-slot="narration-text"]')!;
  expect(left.querySelectorAll(".match-notice")).toHaveLength(2);
  expect(left.querySelectorAll(".narration-item")).toHaveLength(1);
  fireEvent.click(left.querySelector('[data-variant="rejection"] .match-notice__close')!);
  expect(dismissRejection).toHaveBeenCalledOnce();
});

it("counts each card panel when one occurrence contains two card toasts", () => {
  const onAdvance = vi.fn<(id: string) => void>();
  const dual: NarrationItem = {
    ...cardItem("dual"),
    notice: {
      id: "dual",
      side: Side.Opponent,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "deletion", cards: [{ cardId: "BT1-010" }] },
    },
  };
  const { container } = render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([cardItem("old"), dual].map((entry) => [entry.id, entry]))}
        nowMs={0}
        rejection={null}
        onAdvance={onAdvance}
        onDismissRejection={() => {}}
      />
    </I18nProvider>,
  );
  const right = container.querySelector('[data-slot="narration-cards"]')!;
  expect(right.querySelectorAll(".side-panel")).toHaveLength(2);
  fireEvent.click(right.querySelector(".side-panel__close")!);
  expect(onAdvance).toHaveBeenCalledExactlyOnceWith("dual");
});

it("gives notices opened during a long decision their remaining reading time after resuming", () => {
  const original = item("paused-effect");
  const paused = { ...original, pausedAt: 1000 };
  const view = (entry: NarrationItem, nowMs: number) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map([[entry.id, entry]])}
        compact
        nowMs={nowMs}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const { container, rerender } = render(view(paused, 12_000));
  const expected = `${narrationReadingTime(original) - 1000}ms`;
  expect(container.querySelector<HTMLElement>(".narration-peek__life")!.style.animationDuration).toBe(expected);
  fireEvent.click(container.querySelector(".narration-peek")!);
  expect(container.querySelector<HTMLElement>(".match-notice__erode")!.style.animationDuration).toBe(expected);
  expect(container.querySelector("[data-reading-paused]")).not.toBeNull();
  rerender(view({ ...original, createdAt: 11_000 }, 12_000));
  expect(container.querySelector<HTMLElement>(".match-notice__erode")!.style.animationDuration).toBe(expected);
  expect(container.querySelector("[data-reading-paused]")).toBeNull();
});

it("shows Wizardmon's End of Your Turn clause in the effect toast", () => {
  const endTurn: NarrationItem = {
    id: "wizardmon-end-turn",
    side: Side.Viewer,
    batchId: "batch",
    createdAt: 0,
    notice: {
      id: "wizardmon-end-turn",
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: {
        variant: "effect",
        cardId: "BT26-067",
        timing: "EndOfYourTurn",
        description:
          "[End of Your Turn] If you have a blue or yellow Digimon, by returning this Digimon to the bottom of the deck, you may play 1 red or blue [Iliad] trait Digimon card from your trash with the cost reduced by 4.",
      },
    },
  };

  render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([[endTurn.id, endTurn]])}
        nowMs={0}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>,
  );

  expect(screen.getByText("End of Your Turn")).toBeTruthy();
  expect(document.querySelector(".match-notice__text")?.textContent).toMatch(
    /^\[End of Your Turn\].*cost reduced by 4\.$/,
  );
});

/* The portrait column collapses whole: the accordion stands in for every record until the
   viewer opens it, so the band is all the board carries. */
it("collapses the whole portrait column into the accordion", () => {
  const { container } = render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([item("one"), item("two")].map((entry) => [entry.id, entry]))}
        compact
        nowMs={0}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>,
  );
  expect(container.querySelectorAll('[data-slot="narration"] .narration-item')).toHaveLength(0);
  expect(container.querySelectorAll(".narration-peek")).toHaveLength(1);
  // The band names the newest moment, so a browser check can tie it to its clause.
  expect(container.querySelector<HTMLElement>(".narration-peek")!.dataset.narrationPeekId).toBe("two");
});

it("opens the whole portrait column from the accordion, and dismisses only the selected ID", () => {
  const onAdvance = vi.fn<(id: string) => void>();
  const { container } = render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([item("one"), item("two")].map((entry) => [entry.id, entry]))}
        compact
        nowMs={0}
        rejection={null}
        onAdvance={onAdvance}
        onDismissRejection={() => {}}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show the full notice" }));
  expect(container.querySelectorAll('[data-slot="narration"] .narration-item')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notice" })[1]!);
  expect(onAdvance).toHaveBeenCalledExactlyOnceWith("two");
  fireEvent.click(screen.getByRole("button", { name: "Fold the notice back" }));
  expect(container.querySelectorAll('[data-slot="narration"] .narration-item')).toHaveLength(0);
});

/* Wide, the eye reads the clause on the left and the cards it moved on the right. Folded,
   that same order has to survive as top-then-bottom, or an [On Play] that reveals three
   cards shows the three cards first and names the clause underneath — the result before
   the cause. */
it("folds a moment clause-first, the way the two columns read", () => {
  const moment: NarrationItem = { ...item("moment"), panel: cardItem("moment").panel };
  const { container } = render(
    <I18nProvider>
      <CardOpenerProvider onOpenCard={() => {}}>
        <NarrationStack
          narration={new Map([[moment.id, moment]])}
          compact
          nowMs={0}
          rejection={null}
          onAdvance={() => {}}
          onDismissRejection={() => {}}
        />
      </CardOpenerProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show the full notice" }));
  const folded = container.querySelector('[data-slot="narration"] .narration-item') as HTMLElement;
  const clause = folded.querySelector(".match-notice-stack");
  const cards = folded.querySelector(".side-panel-stack");
  expect(clause).toBeTruthy();
  expect(cards).toBeTruthy();
  // DOCUMENT_POSITION_FOLLOWING: the cards half is drawn after the clause half.
  expect(clause!.compareDocumentPosition(cards!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

/* The opened column is taller than the phone it is read on, so a control at the end of it
   is only reachable by scrolling past every moment. Leading the column is what lets it
   stick to the top edge from the first paint. */
it("leads the opened portrait column with its close control", () => {
  const { container } = render(
    <I18nProvider>
      <NarrationStack
        narration={new Map([item("one"), item("two")].map((entry) => [entry.id, entry]))}
        compact
        nowMs={0}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show the full notice" }));
  const close = screen.getByRole("button", { name: "Fold the notice back" });
  expect(container.querySelector('[data-slot="narration"]')?.firstElementChild).toBe(close);
  // Named in words, not left as a bare chevron to be guessed at.
  expect(close.textContent).toContain("Close");
});

it("does not accelerate an existing countdown when another record arrives", () => {
  const first = item("one");
  const view = (items: NarrationItem[], nowMs: number) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map(items.map((entry) => [entry.id, entry]))}
        nowMs={nowMs}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const { container, rerender } = render(view([first], 0));
  const ring = container.querySelector(".match-notice__erode") as HTMLElement;
  expect(ring.style.animationDuration).toBe(`${TIMINGS.noticeLifetime}ms`);
  rerender(view([first, { ...item("two"), createdAt: 2000 }], 2000));
  expect(container.querySelector(".match-notice__erode")).toBe(ring);
  expect(ring.style.animationDuration).toBe(`${TIMINGS.noticeLifetime}ms`);
});

/* The band is one row reused for every moment. Rewritten in place it would swap its text
   with nothing to see, on the layout where it is the only thing a moment gets — so each
   moment gets its own row, and with it the row's entrance and its own running clock. */
it("replaces the folded band per moment and runs its clock from that moment", () => {
  const first = item("one");
  const view = (items: NarrationItem[], nowMs: number) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map(items.map((entry) => [entry.id, entry]))}
        compact
        nowMs={nowMs}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const { container, rerender } = render(view([first], 0));
  const band = container.querySelector(".narration-peek");
  const life = container.querySelector(".narration-peek__life") as HTMLElement;
  expect(life.style.animationDuration).toBe(`${TIMINGS.noticeLifetime}ms`);
  rerender(view([first, { ...item("two"), createdAt: 2000 }], 2000));
  expect(container.querySelector(".narration-peek")).not.toBe(band);
  // The newest moment's own reading time, not what is left of the one it replaced.
  const next = container.querySelector(".narration-peek__life") as HTMLElement;
  expect(next.style.animationDuration).toBe(`${TIMINGS.noticeLifetime}ms`);
  // One named, one queued behind it.
  expect(container.querySelector(".narration-peek__more")?.textContent).toBe("+1");
});

it("keeps the folded band naming accepted effects and counting the whole stack during a decision", () => {
  const clause = (id: string, cardId: string): NarrationItem => ({
    id,
    side: Side.Viewer,
    batchId: "b1",
    createdAt: 0,
    notice: {
      id,
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "effect", cardId, timing: "YourTurn", description: `[Your Turn] clause of ${cardId}.` },
    },
  });
  const view = (items: NarrationItem[], promptSourceCardId: string | undefined) => (
    <I18nProvider>
      <NarrationStack
        narration={new Map(items.map((entry) => [entry.id, entry]))}
        compact
        promptSourceCardId={promptSourceCardId}
        nowMs={0}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const band = () => document.querySelector(".narration-peek");
  const named = () => band()?.querySelector(".narration-peek__name")?.textContent;
  const clauseLine = () => band()?.querySelector(".narration-peek__clause");
  const earlier = clause("earlier", "BT1-029");

  const { rerender } = render(view([earlier], undefined));
  const earlierName = named();
  expect(clauseLine()).not.toBeNull();

  rerender(view([earlier], "BT20-091"));
  expect(named()).toBe(earlierName);
  expect(clauseLine()).not.toBeNull();
  expect(band()?.querySelector(".narration-peek__more")).toBeNull();
  expect(band()?.querySelector(".narration-peek__art")).not.toBeNull();
  const promptName = named();

  rerender(view([earlier, clause("prompt", "BT20-091")], "BT20-091"));
  expect(named()).not.toBe(promptName);
  expect(clauseLine()).not.toBeNull();
  expect(band()?.querySelector(".narration-peek__more")?.textContent).toBe("+1");
});

/* The band is a glance before it is a sentence: its accent says what kind of moment it is
   without the viewer reading a word of it. */
it("draws the folded band in the tone its newest moment earns", () => {
  const tone = (entry: NarrationItem) => {
    const { container } = render(
      <I18nProvider>
        <NarrationStack
          narration={new Map([[entry.id, entry]])}
          compact
          nowMs={0}
          rejection={null}
          onAdvance={() => {}}
          onDismissRejection={() => {}}
        />
      </I18nProvider>,
    );
    const band = container.querySelector(".narration-peek")?.getAttribute("data-tone");
    cleanup();
    return band;
  };
  const noticeItem = (id: string, body: MatchNotice["body"]): NarrationItem => ({
    id,
    side: Side.Viewer,
    batchId: "batch",
    createdAt: 0,
    notice: { id, side: Side.Viewer, fromSecurity: false, createdAt: 0, body },
  });
  expect(tone(noticeItem("a", { variant: "effect", cardId: "BT1-010", timing: "OnPlay" }))).toBe("effect");
  expect(tone(noticeItem("b", { variant: "deletion", cards: [{ cardId: "BT1-010" }] }))).toBe("deletion");
  expect(tone(noticeItem("c", { variant: "keyword", keyword: "digiXros", cardId: "BT1-010" }))).toBe("keyword");
  expect(tone(noticeItem("d", { variant: "recovery", amount: 1 }))).toBe("gain");
  expect(tone(noticeItem("e", { variant: "securityGain", amount: 2 }))).toBe("gain");
});

/* A deletion is drawn by the panel component, not by the notice frame: the two are read out
   of the same column and used to arrive in two different backgrounds. */
it("draws a deletion as a titled panel, keeping the art the card was deleted in", () => {
  const opened: Array<[string, string | undefined]> = [];
  const deleted: NarrationItem = {
    id: "deleted",
    side: Side.Viewer,
    batchId: "batch",
    createdAt: 0,
    notice: {
      id: "deleted",
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "deletion", cards: [{ cardId: "BT1-010", artId: "BT1-010_P2" }] },
    },
  };
  const { container } = render(
    <I18nProvider>
      <CardOpenerProvider onOpenCard={(cardId, artId) => opened.push([cardId, artId])}>
        <NarrationStack
          narration={new Map([[deleted.id, deleted]])}
          nowMs={0}
          rejection={null}
          onAdvance={() => {}}
          onDismissRejection={() => {}}
        />
      </CardOpenerProvider>
    </I18nProvider>,
  );
  const panel = screen.getByTestId("side-panel");
  expect(panel.textContent).toContain("Deleted");
  expect(panel.textContent).toContain("Agumon");
  // The same frame the trashed-cards list uses, rather than a second one beside it.
  expect(container.querySelector(".match-notice")).toBeNull();
  expect(panel.querySelector('img[src*="BT1-010_P2"]')).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open Agumon (BT1-010)" }));
  expect(opened).toEqual([["BT1-010", "BT1-010_P2"]]);
});

it("swipes the folded band sideways to dismiss every moment it stands for, without opening it", () => {
  vi.useFakeTimers();
  try {
    const onAdvance = vi.fn<(id: string) => void>();
    const { container } = render(
      <I18nProvider>
        <NarrationStack
          narration={new Map([item("one"), item("two")].map((entry) => [entry.id, entry]))}
          compact
          nowMs={0}
          rejection={null}
          onAdvance={onAdvance}
          onDismissRejection={() => {}}
        />
      </I18nProvider>,
    );
    const band = container.querySelector(".narration-peek") as HTMLElement;
    vi.spyOn(band, "getBoundingClientRect").mockReturnValue({ width: 300 } as DOMRect);
    const setPointerCapture = vi.fn<(pointerId: number) => void>();
    Object.defineProperty(band, "setPointerCapture", { value: setPointerCapture });

    fireEvent.pointerDown(band, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 140 });
    vi.advanceTimersByTime(1000);
    fireEvent.pointerUp(band, { pointerId: 1, clientX: 140 });
    fireEvent.click(band);
    vi.runAllTimers();
    expect(onAdvance).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-slot="narration"] .narration-item')).toHaveLength(0);

    fireEvent.pointerDown(band, { pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(band, { pointerId: 2, clientX: 260 });
    vi.advanceTimersByTime(1000);
    fireEvent.pointerUp(band, { pointerId: 2, clientX: 260 });
    vi.runAllTimers();
    expect(setPointerCapture.mock.calls).toEqual([[1], [2]]);
    expect(onAdvance.mock.calls.map(([id]) => id)).toEqual(["one", "two"]);
  } finally {
    vi.useRealTimers();
  }
});

it("marks the prompt's own clause while retaining other accepted effects", () => {
  const clause = (id: string, cardId: string): NarrationItem => ({
    id,
    side: Side.Viewer,
    batchId: "b1",
    createdAt: 0,
    notice: {
      id,
      side: Side.Viewer,
      fromSecurity: false,
      createdAt: 0,
      body: { variant: "effect", cardId, timing: "YourTurn", description: "[Your Turn] Gain 1 memory." },
    },
  });
  const previous = { ...clause("previous", "EX4-039"), superseded: true };
  const current = clause("current", "BT20-091");
  const view = (promptSourceCardId: string | undefined) => (
    <I18nProvider>
      <NarrationStack
        narration={
          new Map([
            [previous.id, previous],
            [current.id, current],
          ])
        }
        promptSourceCardId={promptSourceCardId}
        nowMs={0}
        rejection={null}
        onAdvance={() => {}}
        onDismissRejection={() => {}}
      />
    </I18nProvider>
  );
  const marked = () =>
    [...document.querySelectorAll("[data-prompt-effect]")].map((element) => element.getAttribute("data-narration-id"));

  const { rerender } = render(view("BT20-091"));
  expect(marked()).toEqual(["current"]);
  rerender(view("ST8-10"));
  expect(marked()).toEqual([]);
  rerender(view(undefined));
  expect(marked()).toEqual([]);
  expect(document.querySelectorAll(".narration-item")).toHaveLength(2);
});
