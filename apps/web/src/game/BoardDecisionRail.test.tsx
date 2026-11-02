// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import {
  BoardAlliancePrompt,
  BoardBlockPrompt,
  BoardOptionalPrompt,
  BoardPromptRail,
  BoardSelectionRail,
  BoardSourceHostPrompt,
  OpponentSelectingPill,
} from "./BoardDecisionRail";
import { CardOpenerProvider } from "./cardLinks";
import { Hand } from "./piece";

it("translates a board selection's resolving clause with its source card", async () => {
  const clause = getCardDefinition("LM-034")!.effectText!.split("\n")[1]!;
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <BoardPromptRail variant="selection" label="Select a card" prompt="Select a card" clause={clause} art="LM-034">
        <button type="button">Confirm</button>
      </BoardPromptRail>
    </I18nContext.Provider>,
  );
  await waitFor(() =>
    expect(container.querySelector(".board-prompt__clause")?.textContent).toContain("蓝色/红色数码宝贝卡牌"),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const noop = () => {};

function renderIn(node: React.ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe("BoardSelectionRail", () => {
  it("reserves selection lift without moving confirmation buttons when cards are picked", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    let cardTop = 580;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("game-hand-card")) return new DOMRect(20, cardTop, 100, 140);
      if (this.classList.contains("game-hand-dock")) return new DOMRect(0, 600, 400, 168);
      return new DOMRect();
    });
    renderIn(
      <>
        <div className="game-hand-dock">
          <button className="game-hand-card game-hand-card--pickable">Physical hand card</button>
        </div>
        <BoardSelectionRail
          prompt="Select 1 card."
          min={1}
          max={1}
          pickCount={0}
          canConfirm={false}
          onConfirm={noop}
          onNoSelection={noop}
        />
      </>,
    );
    const rail = screen.getByTestId("board-prompt");
    expect(rail.style.getPropertyValue("--decision-hand-clearance")).toBe(`${window.innerHeight - 548}px`);
    cardTop = 560;
    fireEvent.transitionEnd(screen.getByRole("button", { name: "Physical hand card" }));
    expect(rail.style.getPropertyValue("--decision-hand-clearance")).toBe(`${window.innerHeight - 548}px`);
    expect(rail.style.getPropertyValue("--mobile-prompt-hand-clearance")).toBe(`${window.innerHeight - 548}px`);
    cardTop = 570;
    fireEvent(window, new Event("resize"));
    expect(rail.style.getPropertyValue("--decision-hand-clearance")).toBe(`${window.innerHeight - 538}px`);
  });

  it("starts expanded on mobile and restores the full effect when resized to desktop", () => {
    const media = { matches: true, addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() };
    vi.stubGlobal("matchMedia", () => media);
    const onConfirm = vi.fn<() => void>();
    renderIn(
      <BoardSelectionRail
        fieldSelection
        prompt="Choose a Digimon."
        clause="Delete one opposing Digimon."
        min={0}
        max={1}
        pickCount={1}
        canConfirm
        onConfirm={onConfirm}
        onNoSelection={noop}
      />,
    );
    expect(screen.getByText("Delete one opposing Digimon.")).toBeTruthy();
    expect(screen.getByText("Choose a Digimon.")).toBeTruthy();
    expect(screen.getByText("1 selected of 0–1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide effect" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide effect" }));
    expect(screen.queryByText("Delete one opposing Digimon.")).toBeNull();
    expect(screen.getByRole("button", { name: "Move effect prompt" }).closest(".board-prompt__heading")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "View effect" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "View effect" }));
    expect(screen.getByText("Delete one opposing Digimon.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide effect" }));
    media.matches = false;
    fireEvent(window, new Event("resize"));
    expect(screen.getByText("Delete one opposing Digimon.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hide effect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View effect" })).toBeNull();
    expect(screen.getByTestId("board-prompt").hasAttribute("data-text-hidden")).toBe(false);
  });

  it("shows the server's own prompt and the running count", () => {
    renderIn(
      <BoardSelectionRail
        prompt="Select 2 cards to trash."
        min={0}
        max={2}
        pickCount={1}
        canConfirm
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );
    expect(screen.getByText("Select 2 cards to trash.")).toBeTruthy();
    expect(screen.getByText("1 selected of 0–2")).toBeTruthy();
  });

  it("hides No Selection when the selection is mandatory", () => {
    const { unmount } = renderIn(
      <BoardSelectionRail
        prompt="Select 1 card."
        fieldSelection
        min={1}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "No Selection" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pass" })).toBeNull();
    unmount();
  });

  it("offers an active Pass action for an optional field selection", () => {
    const onNoSelection = vi.fn<() => void>();
    renderIn(
      <BoardSelectionRail
        prompt="Select up to 1 card."
        fieldSelection
        min={0}
        max={1}
        pickCount={0}
        canConfirm
        onConfirm={noop}
        onNoSelection={onNoSelection}
      />,
    );
    expect((screen.getByRole("button", { name: "Pass" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(onNoSelection).toHaveBeenCalledTimes(1);
  });

  it("keeps End Selection disabled until the count is valid", () => {
    const onConfirm = vi.fn<() => void>();
    renderIn(
      <BoardSelectionRail
        prompt="Select 2 cards."
        min={2}
        max={2}
        pickCount={1}
        canConfirm={false}
        onConfirm={onConfirm}
        onNoSelection={noop}
      />,
    );
    const end = screen.getByRole("button", { name: "End Selection" }) as HTMLButtonElement;
    expect(end.disabled).toBe(true);
    fireEvent.click(end);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps End Selection disabled with no selected cards, including an optional selection", () => {
    renderIn(
      <BoardSelectionRail
        prompt="Select up to 1 card."
        min={0}
        max={1}
        pickCount={0}
        canConfirm
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );
    expect((screen.getByRole("button", { name: "End Selection" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps Escape available without showing a dialog button", () => {
    const onOpenDialog = vi.fn<() => void>();
    renderIn(
      <BoardSelectionRail
        prompt="Select 1 card."
        min={1}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
        onOpenDialog={onOpenDialog}
      />,
    );
    expect(screen.queryByRole("button", { name: "Open the decision dialog" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenDialog).toHaveBeenCalledTimes(1);
  });

  it("shows and opens the source card art when the selection came from a card effect", () => {
    const opened: string[] = [];
    renderIn(
      <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
        <BoardSelectionRail
          sourceCardId="ST1-07"
          prompt="Select 1 card."
          clause="Draw 1 card."
          min={1}
          max={1}
          pickCount={0}
          canConfirm={false}
          onConfirm={noop}
          onNoSelection={noop}
        />
      </CardOpenerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Open / }));
    expect(opened).toEqual(["ST1-07"]);
  });
});

describe("board prompt scrim", () => {
  it("mounts a scrim beside the rail for the phone stylesheet to show", () => {
    const { container } = renderIn(
      <BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={noop} onDecline={noop} />,
    );
    const scrim = container.querySelector(".decision-overlay-backdrop");
    expect(scrim).toBeTruthy();
    expect(scrim?.nextElementSibling?.classList.contains("board-prompt")).toBe(true);
  });

  it("tags a yes/no prompt so the phone sheet may cover the hand, and a hand selection so it must not", () => {
    const prompt = renderIn(
      <BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={noop} onDecline={noop} />,
    );
    expect(prompt.container.querySelector('.board-prompt[data-variant="prompt"]')).toBeTruthy();
    expect(prompt.container.querySelector('.decision-overlay-backdrop[data-variant="prompt"]')).toBeTruthy();
    prompt.unmount();
    const selection = renderIn(
      <BoardSelectionRail
        prompt="Choose 1 card"
        min={1}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );
    expect(selection.container.querySelector('.board-prompt[data-variant="selection"]')).toBeTruthy();
    expect(selection.container.querySelector('.board-prompt-scrim[data-variant="selection"]')).toBeTruthy();
  });
});

describe("BoardSelectionRail board view", () => {
  it("always shows the full field effect on desktop without a collapse control", () => {
    const { container } = renderIn(
      <BoardSelectionRail
        fieldSelection
        sourceCardId="ST1-07"
        prompt="Choose 1 target"
        clause="Draw 1 card."
        min={1}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );

    expect(screen.getByText("Draw 1 card.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View effect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide effect" })).toBeNull();
    expect(container.querySelector(".board-prompt--target-selection")).toBeTruthy();
  });

  it("temporarily hides the confirmation rail and offers a return to the pending decision", () => {
    renderIn(
      <BoardSelectionRail
        fieldSelection
        prompt="Choose 1 target"
        min={1}
        max={1}
        pickCount={1}
        canConfirm
        onConfirm={noop}
        onNoSelection={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select on board" }));
    expect(screen.queryByRole("region", { name: "Confirm targets" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
    expect(screen.getByRole("region", { name: "Confirm targets" })).toBeTruthy();
  });

  it("counts and confirms the field picks while the board is in view", () => {
    const onConfirm = vi.fn<() => void>();
    const { rerender } = renderIn(
      <BoardSelectionRail
        fieldSelection
        prompt="＜Decoy＞: delete this Digimon to prevent the other Digimon's deletion?"
        min={0}
        max={1}
        pickCount={0}
        canConfirm
        onConfirm={onConfirm}
        onNoSelection={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select on board" }));
    expect(screen.getByText("0 selected of 0–1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm targets" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <I18nProvider>
        <BoardSelectionRail
          fieldSelection
          prompt="＜Decoy＞: delete this Digimon to prevent the other Digimon's deletion?"
          min={0}
          max={1}
          pickCount={1}
          canConfirm
          onConfirm={onConfirm}
          onNoSelection={noop}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("1 selected of 0–1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("BoardBlockPrompt", () => {
  it("keeps the blocker choice on the field and offers the decline action", () => {
    const onDecline = vi.fn<() => void>();
    renderIn(<BoardBlockPrompt attackerCardId="ST1-07" mustBlock={false} onDecline={onDecline} />);

    expect(screen.getByRole("region", { name: "Block window" }).classList.contains("board-prompt--block")).toBe(true);
    expect(screen.getByText("Choose your blocker")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take the attack, no block" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("does not offer decline when blocking is mandatory", () => {
    renderIn(<BoardBlockPrompt mustBlock onDecline={noop} />);
    expect(screen.queryByRole("button", { name: "Take the attack, no block" })).toBeNull();
  });
});

describe("BoardAlliancePrompt", () => {
  it("keeps the ally choice on the field and offers the pass action", () => {
    const onPass = vi.fn<() => void>();
    renderIn(<BoardAlliancePrompt attackerCardId="ST1-07" onPass={onPass} />);

    expect(screen.getByRole("region", { name: "Alliance window" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Alliance window" }).classList.contains("board-prompt--alliance")).toBe(
      true,
    );
    expect(screen.getByText(/When this Digimon attacks, by suspending 1 of your other Digimon/)).toBeTruthy();
    expect(screen.getByText("＜Alliance＞").classList.contains("board-prompt__eyebrow")).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Alliance window" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pass" }).querySelector("svg")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(onPass).toHaveBeenCalledTimes(1);
  });
});

describe("BoardOptionalPrompt", () => {
  it("asks the Use / Don't use question against the source card's clause", () => {
    const onUse = vi.fn<() => void>();
    const onDecline = vi.fn<() => void>();
    renderIn(<BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={onUse} onDecline={onDecline} />);
    expect(screen.getByText("Use this effect?")).toBeTruthy();
    expect(screen.getByText("Draw 1 card.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    fireEvent.click(screen.getByRole("button", { name: "Don't use" }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("keeps the standard activation question above the clause", () => {
    renderIn(<BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={noop} onDecline={noop} />);
    expect(screen.getByText("Use this effect?")).toBeTruthy();
    expect(screen.getByText("Draw 1 card.")).toBeTruthy();
  });

  it("offers no way into the dialog beyond Escape, since the dialog shows nothing more", () => {
    const onOpenDialog = vi.fn<() => void>();
    renderIn(
      <BoardOptionalPrompt
        sourceCardId="ST1-07"
        clause="Draw 1 card."
        onUse={noop}
        onDecline={noop}
        onOpenDialog={onOpenDialog}
      />,
    );
    expect(screen.queryByRole("button", { name: "Open the decision dialog" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenDialog).toHaveBeenCalledTimes(1);
  });

  it("names itself after the source card so the rail is addressable", () => {
    renderIn(<BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={noop} onDecline={noop} />);
    expect(screen.getByRole("dialog", { name: /· effect/i })).toBeTruthy();
  });

  it("opens the source card from the rail's own eyebrow", () => {
    const opened: string[] = [];
    renderIn(
      <CardOpenerProvider onOpenCard={(cardId) => opened.push(cardId)}>
        <BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={noop} onDecline={noop} />
      </CardOpenerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Open / }));
    expect(opened).toEqual(["ST1-07"]);
  });
});

describe("OpponentSelectingPill", () => {
  it("says only that the opponent is choosing, never what", () => {
    renderIn(<OpponentSelectingPill />);
    const pill = screen.getByTestId("opponent-selecting-pill");
    expect(pill.textContent).toBe("The opponent is selecting cards.");
  });

  it("shows the status it is given", () => {
    renderIn(<OpponentSelectingPill status="game.opponentIsThinking" />);
    const pill = screen.getByTestId("opponent-selecting-pill");
    expect(pill.textContent).toBe("The opponent is thinking…");
  });
});

describe("Hand in selection mode", () => {
  const cards = [
    {
      instanceId: "h1",
      cardId: "ST1-03",
      activatableEffectsJson: "",
      playableFromHand: true,
      projectedPlayCost: -1,
      digivolveTargetPermanentIds: [],
      linkTargetPermanentIds: [],
    },
    {
      instanceId: "h2",
      cardId: "ST1-03",
      activatableEffectsJson: "",
      playableFromHand: false,
      projectedPlayCost: -1,
      digivolveTargetPermanentIds: [],
      linkTargetPermanentIds: [],
    },
    {
      instanceId: "h3",
      cardId: "ST1-07",
      activatableEffectsJson: "",
      playableFromHand: false,
      projectedPlayCost: -1,
      digivolveTargetPermanentIds: [],
      linkTargetPermanentIds: [],
    },
  ];

  it("numbers picks in the order they were made and marks the rest unpickable", () => {
    const onToggle = vi.fn<(instanceId: string) => void>();
    renderIn(
      <Hand
        cards={cards}
        startDrag={noop}
        selection={{ selectableInstanceIds: ["h1", "h2"], pickedInstanceIds: ["h2", "h1"], onToggle }}
      />,
    );
    const hand = screen.getByTestId("hand");
    expect(within(hand).getByRole("button", { name: /copy 1 of 2, selected, pick 2$/ }).textContent).toBe("2");
    expect(within(hand).getByRole("button", { name: /copy 2 of 2, selected, pick 1$/ }).textContent).toBe("1");
    expect(within(hand).getByRole("button", { name: "Pick Greymon" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("routes a tap on a selectable card to the pick handler, and ignores the rest", () => {
    const onToggle = vi.fn<(instanceId: string) => void>();
    renderIn(
      <Hand
        cards={cards}
        startDrag={noop}
        selection={{ selectableInstanceIds: ["h1"], pickedInstanceIds: [], onToggle }}
      />,
    );
    const hand = screen.getByTestId("hand");
    fireEvent.click(within(hand).getByRole("button", { name: /copy 1 of 2$/ }));
    fireEvent.click(within(hand).getByRole("button", { name: "Pick Greymon" }));
    expect(onToggle.mock.calls).toEqual([["h1"]]);
  });

  describe("on touch", () => {
    /** A finger landing on a card and lifting `travel` px away from where it landed. */
    function fingerTap(card: Element, travel: { dx: number; dy: number } = { dx: 0, dy: 0 }) {
      const at = { clientX: 120, clientY: 400, pointerId: 7, pointerType: "touch" };
      fireEvent.pointerDown(card, at);
      fireEvent.pointerUp(card, { ...at, clientX: at.clientX + travel.dx, clientY: at.clientY + travel.dy });
    }

    function renderPickableHand() {
      const onToggle = vi.fn<(instanceId: string) => void>();
      renderIn(
        <Hand
          cards={cards}
          startDrag={noop}
          selection={{ selectableInstanceIds: ["h1"], pickedInstanceIds: [], onToggle }}
        />,
      );
      const hand = screen.getByTestId("hand");
      return { onToggle, hand, card: within(hand).getByRole("button", { name: /copy 1 of 2$/ }) };
    }

    it("picks a card from the tap itself, not from the click the browser may never send", () => {
      // The hand is a `pan-x` scroll-snap row on a phone, so the browser is free to
      // swallow or retarget the trailing click. The pick must not depend on it.
      const { onToggle, card } = renderPickableHand();
      fingerTap(card);
      expect(onToggle.mock.calls).toEqual([["h1"]]);
    });

    it("counts the tap once when the browser does send its trailing click", () => {
      const { onToggle, card } = renderPickableHand();
      fingerTap(card);
      fireEvent.click(card, { detail: 1 });
      expect(onToggle.mock.calls).toEqual([["h1"]]);
    });

    it("still answers a browser that reports the tap as a click alone", () => {
      // The pointerup lands on the row rather than the card there, so the click is
      // the only signal the pick ever gets.
      const { onToggle, card } = renderPickableHand();
      fireEvent.pointerDown(card, { clientX: 120, clientY: 400, pointerId: 7, pointerType: "touch" });
      fireEvent.pointerUp(window, { clientX: 120, clientY: 400, pointerId: 7, pointerType: "touch" });
      fireEvent.click(card, { detail: 1 });
      expect(onToggle.mock.calls).toEqual([["h1"]]);
    });

    it("picks again when the same card is tapped a second time", () => {
      const { onToggle, card } = renderPickableHand();
      fingerTap(card);
      fireEvent.click(card, { detail: 1 });
      fingerTap(card);
      fireEvent.click(card, { detail: 1 });
      expect(onToggle.mock.calls).toEqual([["h1"], ["h1"]]);
    });

    it("leaves a sideways swipe to the row it scrolls", () => {
      const { onToggle, card } = renderPickableHand();
      fingerTap(card, { dx: 60, dy: 4 });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("drops the pick when the browser takes the gesture over for a scroll", () => {
      const { onToggle, card } = renderPickableHand();
      fireEvent.pointerDown(card, { clientX: 120, clientY: 400, pointerId: 7, pointerType: "touch" });
      fireEvent.pointerCancel(card, { pointerId: 7, pointerType: "touch" });
      fireEvent.pointerUp(card, { clientX: 120, clientY: 400, pointerId: 7, pointerType: "touch" });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("ignores a tap on a card the decision does not offer", () => {
      const { onToggle, hand } = renderPickableHand();
      fingerTap(within(hand).getByRole("button", { name: "Pick Greymon" }));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("still answers keyboard and assistive activation, which sends no pointer at all", () => {
      const { onToggle, card } = renderPickableHand();
      fireEvent.click(card);
      expect(onToggle.mock.calls).toEqual([["h1"]]);
    });
  });
});

it("focuses the left optional dialog and keeps Tab within its controls", () => {
  const use = vi.fn<() => void>();
  const decline = vi.fn<() => void>();
  renderIn(<BoardOptionalPrompt sourceCardId="ST1-07" clause="Draw 1 card." onUse={use} onDecline={decline} />);
  const dialog = screen.getByRole("dialog", { name: /· effect/i });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.getAttribute("data-prompt-surface")).toBe("left");
  expect(document.activeElement).toBe(dialog);
  const accept = within(dialog).getByRole("button", { name: "Use" });
  const viewBoard = within(dialog).getByRole("button", { name: "View board" });
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(viewBoard);
  fireEvent.keyDown(viewBoard, { key: "Tab" });
  expect(document.activeElement).toBe(accept);
  fireEvent.keyDown(accept, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(viewBoard);
  expect(use).not.toHaveBeenCalled();
  expect(decline).not.toHaveBeenCalled();
});

describe("Return to decision position", () => {
  const promptRect = new DOMRect(300, 400, 400, 180);
  const returnControlRect = new DOMRect(0, 0, 320, 56);

  function pressAndFindReturn(name: string) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("decision-board-return")) return returnControlRect;
      if (this.classList.contains("board-prompt")) return promptRect;
      return new DOMRect(300, 540, 200, 40);
    });
    fireEvent.click(screen.getByRole("button", { name }));
    return screen.getByRole("button", { name: "Return to decision" }).parentElement!;
  }

  afterEach(() => localStorage.clear());

  it.each([
    [
      "optional prompt",
      <BoardOptionalPrompt key="optional" sourceCardId="ST1-07" onUse={noop} onDecline={noop} />,
      "View board",
    ],
    ["block window", <BoardBlockPrompt key="block" mustBlock={false} onDecline={noop} />, "View board"],
    ["source host choice", <BoardSourceHostPrompt key="host" />, "View board"],
    ["alliance window", <BoardAlliancePrompt key="alliance" onPass={noop} />, "View board"],
    [
      "field selection",
      <BoardSelectionRail
        key="selection"
        fieldSelection
        prompt="Choose 1 target"
        min={1}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
      />,
      "Select on board",
    ],
  ])("opens the %s return control on the left edge, level with the pressed button", (_, prompt, buttonName) => {
    renderIn(prompt);

    const control = pressAndFindReturn(buttonName);

    expect(control.hasAttribute("data-docked")).toBe(true);
    expect(control.style.getPropertyValue("--decision-return-left")).toBe("16px");
    expect(control.style.getPropertyValue("--decision-return-top")).toBe("532px");
  });

  it("moves the return control with its handle without returning to the decision", () => {
    const onDecline = vi.fn<() => void>();
    renderIn(<BoardOptionalPrompt sourceCardId="ST1-07" onUse={noop} onDecline={onDecline} />);
    const control = pressAndFindReturn("View board");

    fireEvent.keyDown(screen.getByRole("button", { name: "Move decision bar" }), { key: "ArrowDown" });

    expect(control.hasAttribute("data-dragged")).toBe(true);
    expect(control.style.getPropertyValue("--decision-return-drag-top")).toBe("20px");
    expect(screen.getByRole("button", { name: "Return to decision" })).toBeTruthy();
    expect(onDecline).not.toHaveBeenCalled();
  });
});

describe("board prompt move handle", () => {
  function pointer(element: Element, type: string, x: number, y: number) {
    act(() => {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          pointerType: "touch",
          clientX: x,
          clientY: y,
        }),
      );
    });
  }

  it("drags the selection rail to viewport coordinates without confirming", () => {
    const onConfirm = vi.fn<() => void>();
    renderIn(
      <BoardSelectionRail
        prompt="Select 1 card."
        min={1}
        max={1}
        pickCount={1}
        canConfirm
        onConfirm={onConfirm}
        onNoSelection={noop}
      />,
    );
    const rail = screen.getByTestId("board-prompt");
    vi.spyOn(rail, "getBoundingClientRect").mockImplementation(() => {
      const left = Number.parseFloat(rail.style.getPropertyValue("--effect-prompt-drag-left")) || 100;
      const top = Number.parseFloat(rail.style.getPropertyValue("--effect-prompt-drag-top")) || 200;
      return new DOMRect(left, top, 320, 200);
    });
    const handle = screen.getByRole("button", { name: "Move effect prompt" });
    expect(rail.dataset.promptDragged).toBeUndefined();
    pointer(handle, "pointerdown", 120, 220);
    pointer(handle, "pointermove", 220, 320);
    pointer(handle, "pointerup", 220, 320);
    expect(rail.dataset.promptDragged).toBe("true");
    expect(rail.style.getPropertyValue("--effect-prompt-drag-left")).toBe("200px");
    expect(rail.style.getPropertyValue("--effect-prompt-drag-top")).toBe("300px");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

it.each(["selection", "optional", "sourceHost"] as const)("highlights the active passage in the %s prompt", (kind) => {
  const props = {
    clause: "Delete a Digimon. Then, this Digimon may attack.",
    clauseEmphasis: "Then, this Digimon may attack.",
  };
  const { container } = renderIn(
    kind === "selection" ? (
      <BoardSelectionRail
        {...props}
        fieldSelection
        prompt="Select a target"
        min={0}
        max={1}
        pickCount={0}
        canConfirm={false}
        onConfirm={noop}
        onNoSelection={noop}
      />
    ) : kind === "optional" ? (
      <BoardOptionalPrompt {...props} onUse={noop} onDecline={noop} />
    ) : (
      <BoardSourceHostPrompt {...props} />
    ),
  );
  expect(container.querySelector(".board-prompt__clause")?.textContent).toBe(props.clause);
  expect(container.querySelector(".decision-overlay__effect-step")?.textContent).toBe(props.clauseEmphasis);
});
