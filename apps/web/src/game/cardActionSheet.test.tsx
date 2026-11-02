// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { I18nProvider } from "../i18n";
import { CardActionMenu, StackViewerOverlay, TrashViewerOverlay } from "./overlay";
import { parseActivatable, type ActivatableEntry } from "./boardModel";
import type { PermanentDetail } from "./permanentDetail";

afterEach(() => cleanup());

const noop = () => {};

function renderSheet(props: Partial<React.ComponentProps<typeof CardActionMenu>> = {}) {
  return render(
    <I18nProvider>
      <CardActionMenu
        x={0}
        y={0}
        sheet
        cardId="BT1-009"
        canAttack={false}
        onViewStack={noop}
        onAttack={noop}
        onClose={noop}
        {...props}
      />
    </I18nProvider>,
  );
}

describe("field card action sheet", () => {
  it("shows the DP bonus as a signed delta over the printed DP", () => {
    renderSheet({ dp: 5000, baseDP: 3000 });
    expect(screen.getByText(/5,000 DP|5\.000 DP/)).toBeTruthy();
    expect(screen.getByText(/^\+2[,.]000$/)).toBeTruthy();
  });

  it("marks a DP penalty as negative", () => {
    renderSheet({ dp: 2000, baseDP: 3000 });
    expect(screen.getByText(/^−1[,.]000$/)).toBeTruthy();
  });

  it("omits the delta when the permanent is at its printed DP", () => {
    const { container } = renderSheet({ dp: 3000, baseDP: 3000 });
    expect(container.querySelector(".card-action-sheet__stats em")).toBeNull();
  });

  it("spells synced keywords the way they are printed", () => {
    renderSheet({ keywords: ["SecurityAttack", "Blocker", "DeDigivolve"] });
    expect(screen.getByText("Security Attack")).toBeTruthy();
    expect(screen.getByText("Blocker")).toBeTruthy();
    expect(screen.getByText("De-Digivolve")).toBeTruthy();
  });

  it("lists the cards under the top card, grouped by role", () => {
    renderSheet({
      stackCards: [
        { cardId: "BT1-009", role: "top" },
        { cardId: "ST1-02", role: "stack" },
        { cardId: "ST1-03", role: "linked" },
      ],
    });
    expect(screen.getByText("Digivolution")).toBeTruthy();
    expect(screen.getByText("Link card")).toBeTruthy();
    // The active card is already the large preview; it is not repeated below.
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("opens the dedicated stack viewer from the mobile action sheet", () => {
    const onViewStack = vi.fn<() => void>();
    renderSheet({ stackCards: [{ cardId: "ST1-02", role: "stack" }], onViewStack });
    fireEvent.click(screen.getByText("View stack"));
    expect(onViewStack).toHaveBeenCalledOnce();
  });

  it("enlarges the card in a modal when it is tapped", () => {
    const { container } = renderSheet();
    expect(container.querySelector(".card-zoom")).toBeNull();
    fireEvent.click(screen.getByLabelText("Enlarge card"));
    expect(document.querySelector(".card-zoom")).toBeTruthy();
  });

  it("enlarges a stack card when its thumbnail is tapped", () => {
    renderSheet({ stackCards: [{ cardId: "ST1-02", role: "stack" }] });
    const thumb = document.querySelector<HTMLButtonElement>(".card-action-sheet__stack button");
    expect(thumb).toBeTruthy();
    fireEvent.click(thumb!);
    expect(document.querySelector(".card-zoom")).toBeTruthy();
  });

  it("Discord 1555516815226970172: lets the owner read and enlarge a face-down card under their Tamer", () => {
    renderSheet({ stackCards: [{ cardId: "ST1-02", faceDown: true, role: "stack" }] });
    const thumb = document.querySelector<HTMLButtonElement>(".card-action-sheet__stack button")!;
    const name = getCardDefinition("ST1-02")?.nameEn ?? "ST1-02";
    expect(thumb.textContent).toBe(`${name} · Face down`);
    fireEvent.click(thumb);
    expect(document.querySelector(".card-zoom")).toBeTruthy();
  });

  it("keeps a face-down card the viewer cannot identify closed", () => {
    renderSheet({ stackCards: [{ cardId: "", faceDown: true, role: "stack" }] });
    const thumb = document.querySelector<HTMLButtonElement>(".card-action-sheet__stack button")!;
    expect(thumb.textContent).toBe("Face-down card");
    expect(thumb.disabled).toBe(true);
  });

  it("offers the breeding promote action only when one is supplied", () => {
    const onPromote = vi.fn();
    renderSheet({ promote: { label: "Move to battle", onPromote } });
    fireEvent.click(screen.getByText("Move to battle"));
    expect(onPromote).toHaveBeenCalledOnce();
    cleanup();
    renderSheet();
    expect(screen.queryByText("Move to battle")).toBeNull();
  });

  it("offers attack only when the permanent can attack", () => {
    const onAttack = vi.fn();
    renderSheet({ canAttack: true, onAttack });
    expect(screen.getByText("Attack")).toBeTruthy();
    cleanup();
    renderSheet({ canAttack: false });
    expect(screen.queryByText("Attack")).toBeNull();
  });
});

/**
 * Builds the menu's `effects` prop exactly the way GameScreen does: the synced
 * activatable list, mapped to labelled entries that carry the source instance and
 * effect key the activateEffect intent needs.
 */
function effectsOf(
  activatableEffectsJson: string,
  activate: (instanceId: string, effectKey: string) => void,
): { label: string; onActivate: () => void }[] {
  return parseActivatable(activatableEffectsJson).map((entry) => ({
    label: entry.description,
    onActivate: () => activate(entry.instanceId, entry.effectKey),
  }));
}

const MEMORY_BOOST_DELAY = JSON.stringify([
  {
    instanceId: "blue-memory-boost-top",
    effectKey: "P-036/0",
    description: "[Main] <Delay> Gain 2 memory.",
  },
]);

const TRIAL_DELAY = JSON.stringify([
  {
    instanceId: "trial-four-great-dragons-top",
    effectKey: "EX3-069/1",
    description:
      "[Main] ＜Delay＞ Play 1 Digimon card with [Four Great Dragons] in its traits from your hand without paying the cost.",
  },
]);

describe.each([
  { mode: "sheet", sheet: true },
  { mode: "anchored menu", sheet: false },
])("field card activatable effects ($mode)", ({ sheet }) => {
  it("does not offer a Memory Boost Delay while the engine reports it unavailable", () => {
    renderSheet({ sheet, effects: effectsOf("[]", vi.fn()) });

    expect(screen.queryByRole("button", { name: /activate effect/i })).toBeNull();
  });

  it("identifies the available Delay and sends its exact source and effect key", () => {
    const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
    renderSheet({ sheet, effects: effectsOf(MEMORY_BOOST_DELAY, activate) });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Activate effect: [Main] <Delay> Gain 2 memory.",
      }),
    );

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith("blue-memory-boost-top", "P-036/0");
  });

  it("shows Trial's friendly Delay action and sends its exact source and effect key", () => {
    const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
    renderSheet({ sheet, effects: effectsOf(TRIAL_DELAY, activate) });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Activate effect: \[Main\] ＜Delay＞ Play 1 Digimon card with \[Four Great Dragons\]/,
      }),
    );

    expect(activate).toHaveBeenCalledWith("trial-four-great-dragons-top", "EX3-069/1");
  });

  it("keeps every effect of a multi-effect permanent separately activatable", () => {
    const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
    renderSheet({
      sheet,
      effects: effectsOf(
        JSON.stringify([
          {
            instanceId: "hercules-kabuterimon-top",
            effectKey: "ST4-13/ir-27-0",
            description: "[Main] ＜DigiBurst＞ Trash, Suspend",
          },
          {
            instanceId: "hercules-kabuterimon-top",
            effectKey: "ST4-13/ir-27-1",
            description: "[Main] Gain 1 memory.",
          },
        ]),
        activate,
      ),
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Activate effect: [Main] ＜DigiBurst＞ Trash, Suspend",
      }),
    );

    expect(activate).toHaveBeenCalledWith("hercules-kabuterimon-top", "ST4-13/ir-27-0");
  });
});

describe("desktop field card action menu", () => {
  it("focuses View stack and closes with Escape", () => {
    const onClose = vi.fn<() => void>();
    renderSheet({ sheet: false, onClose });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "View stack" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("view-gated card identity", () => {
  // Colyseus decodes a card the viewer is not authorized to identify with
  // `cardId === undefined` (CARD_ID_VIEW_TAG), so every card surface must
  // survive an id-less card instead of crashing the board.
  const gatedId = undefined as unknown as string;

  it("renders the action sheet when the top card's identity is view-gated", () => {
    renderSheet({ cardId: gatedId });
    expect(document.querySelector(".card-action-sheet")).toBeTruthy();
  });

  it("renders the action sheet when a stack card's identity is view-gated", () => {
    renderSheet({ stackCards: [{ cardId: gatedId, role: "stack" }] });
    expect(document.querySelector(".card-action-sheet__stack")).toBeTruthy();
  });

  it("renders the stack viewer when a stack card's identity is view-gated", () => {
    render(
      <I18nProvider>
        <StackViewerOverlay
          title="Stack"
          cards={[{ cardId: gatedId, role: "top" }]}
          canAttack={false}
          onAttack={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(document.querySelector(".trash-viewer-dialog")).toBeTruthy();
  });
});

describe("trash bottom sheet", () => {
  function renderTrash(cardIds: string[]) {
    return render(
      <I18nProvider>
        <TrashViewerOverlay cardIds={cardIds} title="Your trash" sheet onClose={noop} />
      </I18nProvider>,
    );
  }

  it("queues every trashed card into one scrollable row, newest first", () => {
    renderTrash(["BT1-009", "ST1-02", "ST1-03"]);
    const captions = document.querySelectorAll(".trash-sheet__row figcaption");
    expect(captions).toHaveLength(3);
    expect(captions[0]!.textContent).toBe(getCardDefinition("ST1-03")?.nameEn ?? "ST1-03");
  });

  it("enlarges a trashed card when it is tapped", () => {
    renderTrash(["BT1-009"]);
    fireEvent.click(document.querySelector(".trash-sheet__row > button")!);
    expect(document.querySelector(".card-zoom")).toBeTruthy();
  });

  it("says so when the trash is empty", () => {
    renderTrash([]);
    expect(screen.getByText("trash is empty")).toBeTruthy();
  });
});

describe("trash [Main] activation", () => {
  const malomyotismon = { instanceId: "s1-33", effectKey: "EX10-011/ir-0-0", description: "Play from trash" };

  function renderTrashWithEffects(sheet: boolean, onActivateEffect = vi.fn<(effect: ActivatableEntry) => void>()) {
    render(
      <I18nProvider>
        <TrashViewerOverlay
          cardIds={["BT1-009", "EX10-011"]}
          effects={[[], [malomyotismon]]}
          title="Your trash"
          sheet={sheet}
          onActivateEffect={onActivateEffect}
          onClose={noop}
        />
      </I18nProvider>,
    );
    return onActivateEffect;
  }

  it.each([
    ["sheet", true],
    ["desktop", false],
  ])("offers the projected effect of a trash card in the %s layout and sends it on tap", (_layout, sheet) => {
    const onActivateEffect = renderTrashWithEffects(sheet);
    expect(document.querySelectorAll(".trash-viewer__activations button")).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: /MaloMyotismon/ })[0]!);
    expect(screen.getByRole("dialog", { name: "MaloMyotismon" }).textContent).toContain("[Trash]");
    const buttons = document.querySelectorAll(".trash-viewer__activations button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Activate [Main] effect: MaloMyotismon");
    fireEvent.click(buttons[0]!);
    expect(onActivateEffect).toHaveBeenCalledWith(malomyotismon);
  });

  it("confirms the clicked copy in a dialog and cancels without activating", () => {
    const second = { instanceId: "s1-34", effectKey: "EX10-011/ir-0-0", description: "Play from trash" };
    const onActivateEffect = vi.fn<(effect: ActivatableEntry) => void>();
    render(
      <I18nProvider>
        <TrashViewerOverlay
          cardIds={["EX10-011", "BT1-009", "EX10-011"]}
          effects={[[malomyotismon], [], [second]]}
          title="Your trash"
          onActivateEffect={onActivateEffect}
          onClose={noop}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText("Trash effect")).toHaveLength(2);
    const copies = screen.getAllByRole("button", { name: "MaloMyotismon" });
    fireEvent.click(copies[1]!);
    expect(screen.getByRole("dialog", { name: "MaloMyotismon" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "MaloMyotismon" })).toBeNull();
    expect(onActivateEffect).not.toHaveBeenCalled();

    fireEvent.click(copies[1]!);
    expect(document.querySelectorAll(".trash-viewer__activations button")).toHaveLength(1);
    fireEvent.click(document.querySelector(".trash-viewer__activations button")!);
    expect(onActivateEffect).toHaveBeenCalledWith(malomyotismon);
    expect(screen.queryByRole("dialog", { name: "MaloMyotismon" })).toBeNull();
  });

  it.each([false, true])("#41 sorts duplicate copies without swapping their activations (sheet=%s)", (sheet) => {
    const second = { ...malomyotismon, instanceId: "second-copy" };
    const onActivateEffect = vi.fn<(effect: ActivatableEntry) => void>();
    render(
      <I18nProvider>
        <TrashViewerOverlay
          cardIds={["EX10-011", "ST1-03", "EX10-011"]}
          effects={[[malomyotismon], [], [second]]}
          title="Your trash"
          sheet={sheet}
          onActivateEffect={onActivateEffect}
          onClose={noop}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sort trash" }), { target: { value: "name" } });
    const row = document.querySelector(sheet ? ".trash-sheet__row" : ".trash-viewer__slot")!;
    expect(row.querySelector("img")!.getAttribute("src")).toContain("ST1-03");
    expect(screen.getByText("copy 1 of 2")).toBeTruthy();
    expect(screen.getByText("copy 2 of 2")).toBeTruthy();
    const copies = screen.getAllByRole("button", { name: /MaloMyotismon/ });
    fireEvent.click(copies[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Activate [Main] effect: MaloMyotismon" }));
    expect(onActivateEffect).toHaveBeenLastCalledWith(second);
    fireEvent.click(copies[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Activate [Main] effect: MaloMyotismon" }));
    expect(onActivateEffect).toHaveBeenLastCalledWith(malomyotismon);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort trash" }), { target: { value: "recent" } });
    expect(
      document.querySelector(sheet ? ".trash-sheet__row img" : ".trash-viewer__slot img")!.getAttribute("src"),
    ).toContain("EX10-011");
  });

  it("keeps the confirmed physical copy when live trash positions change", () => {
    const second = { ...malomyotismon, instanceId: "second-copy" };
    const onActivateEffect = vi.fn<(effect: ActivatableEntry) => void>();
    const props = {
      title: "Your trash",
      onClose: noop,
      onActivateEffect,
      cardIds: ["EX10-011", "EX10-011"],
      instanceIds: [malomyotismon.instanceId, second.instanceId],
      effects: [[malomyotismon], [second]],
    };
    const view = render(
      <I18nProvider>
        <TrashViewerOverlay {...props} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "MaloMyotismon" })[0]!);
    view.rerender(
      <I18nProvider>
        <TrashViewerOverlay {...props} cardIds={["EX10-011"]} instanceIds={[second.instanceId]} effects={[[second]]} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Activate [Main] effect: MaloMyotismon" }));
    expect(onActivateEffect).toHaveBeenCalledWith(second);
    fireEvent.click(screen.getByRole("button", { name: "MaloMyotismon" }));
    view.rerender(
      <I18nProvider>
        <TrashViewerOverlay {...props} cardIds={[]} instanceIds={[]} effects={[]} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Activate [Main] effect: MaloMyotismon" })).toBeNull();
  });

  it("offers nothing when no trash card projects an effect", () => {
    render(
      <I18nProvider>
        <TrashViewerOverlay
          cardIds={["BT1-009", "EX10-011"]}
          effects={[[], []]}
          title="Your trash"
          onActivateEffect={noop}
          onClose={noop}
        />
      </I18nProvider>,
    );
    expect(document.querySelector(".trash-viewer__activations")).toBeNull();
  });
});

describe("stack viewer bottom sheet", () => {
  const detail: PermanentDetail = {
    permanentId: "p1",
    cardId: "BT1-010",
    name: "Greymon",
    cards: [],
    currentDP: 5000,
    baseDP: 3000,
    dpDelta: 2000,
    keywords: ["Blocker"],
    grantedKeywords: [],
    grantedEffectTexts: [],
    forcedAttackGrants: [],
    restrictions: [],
    heldDpEffects: [],
    suspended: true,
    summoningSick: false,
    inBreeding: false,
  };

  function renderStackSheet(props: Partial<React.ComponentProps<typeof StackViewerOverlay>> = {}) {
    return render(
      <I18nProvider>
        <StackViewerOverlay
          sheet
          title="Greymon"
          cards={[
            { cardId: "BT1-010", role: "top" },
            { cardId: "ST1-02", role: "stack" },
            { cardId: "ST1-03", role: "stack" },
          ]}
          detail={detail}
          canAttack={false}
          onAttack={noop}
          onClose={noop}
          {...props}
        />
      </I18nProvider>,
    );
  }

  it("reads as one sheet: grip, header stats and keyword chips", () => {
    renderStackSheet();
    expect(document.querySelector(".stack-sheet .card-action-sheet__grip")).toBeTruthy();
    expect(document.querySelector(".trash-viewer-dialog")).toBeNull();
    expect(screen.getByText(/5[,.]000 DP/)).toBeTruthy();
    expect(screen.getByText(/^\+2[,.]000$/)).toBeTruthy();
    expect(screen.getByText("Suspended")).toBeTruthy();
    expect(document.querySelector(".card-action-sheet__keywords")!.textContent).toContain("Blocker");
  });

  it("stacks a wrapping grid per role, numbering the sources from the bottom", () => {
    renderStackSheet();
    const sections = document.querySelectorAll(".stack-sheet__groups > section");
    expect(sections).toHaveLength(2);
    expect(sections[0]!.getAttribute("aria-label")).toBe("Active");
    expect(sections[1]!.getAttribute("aria-label")).toBe("Digivolution");
    const sources = sections[1]!.querySelectorAll(".stack-sheet__grid figcaption");
    expect(sources).toHaveLength(2);
    expect(sources[0]!.querySelector("b")!.textContent).toBe("1");
    expect(sources[1]!.querySelector("b")!.textContent).toBe("2");
  });

  it("opens the card zoom from the active card and from a source", () => {
    renderStackSheet();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge card" }));
    expect(document.querySelector(".card-zoom")).toBeTruthy();
    fireEvent.click(document.querySelector(".card-zoom")!);
    expect(document.querySelector(".card-zoom")).toBeNull();

    fireEvent.click(document.querySelectorAll(".stack-sheet__grid > button")[2]!);
    expect(document.querySelector(".card-zoom")).toBeTruthy();
  });

  it("closes on Escape, but Escape over the zoom only closes the zoom", () => {
    const onClose = vi.fn<() => void>();
    renderStackSheet({ onClose });

    fireEvent.click(document.querySelector(".stack-sheet__grid > button")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".card-zoom")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the two-column dialog off the phone sheet", () => {
    renderStackSheet({ sheet: false });
    expect(document.querySelector(".trash-viewer-dialog")).toBeTruthy();
    expect(document.querySelector(".stack-sheet")).toBeNull();
  });
});

describe("field card link action", () => {
  it("offers Link only when the permanent has a projected link recipient", () => {
    const onLink = vi.fn();
    renderSheet({ link: { onLink } });
    fireEvent.click(screen.getByRole("button", { name: /^Link$|^Vincular$/ }));
    expect(onLink).toHaveBeenCalledTimes(1);
    cleanup();
    renderSheet();
    expect(screen.queryByRole("button", { name: /^Link$|^Vincular$/ })).toBeNull();
  });
});
