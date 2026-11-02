import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { OrganizedBattleRow } from "./OrganizedBattleRow";
import { I18nProvider } from "../../../i18n";
import { BattleLanes, setBattleLanes } from "../../../design/battleLanes";
import { SINGLE_LANE_PHONE_QUERY } from "../queries";
import { useFieldCardWidth } from "./fieldCardWidth";

function permanent(id: string) {
  const card = new Permanent();
  card.permanentId = id;
  return card;
}

function mockViewport({ phone }: { phone: boolean }) {
  const listeners = new Set<() => void>();
  const query = { matches: phone };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      get matches() {
        return media === SINGLE_LANE_PHONE_QUERY && query.matches;
      },
      media,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return (next: boolean) => {
    query.matches = next;
    for (const listener of listeners) listener();
  };
}

function view(support: Permanent[], supportFirst = false, layoutWidth = 100) {
  return (
    <I18nProvider>
      <OrganizedBattleRow
        arrangement={{
          digimon: [permanent("digimon")],
          support: support.map((member) => ({ key: member.permanentId, members: [member] })),
        }}
        layoutWidth={layoutWidth}
        supportFirst={supportFirst}
        digimonLabel="Digimon"
        supportLabel="Support"
        emptyLabel={null}
        rowProps={{ style: { "--field-reserve-support": "1", "--field-support-scale": "1" } as React.CSSProperties }}
        isSuspended={(member) => member.isSuspended}
        renderCard={(card) => <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }} />}
      />
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  setBattleLanes(BattleLanes.Two);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
});

afterEach(() => {
  cleanup();
  arenaAppearancePreference.resetAppearance();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("organized battle lanes", () => {
  it.each([164, 220])("#5033/#4927 grows rendered desktop cards within the %ipx ceiling", (ceiling) => {
    mockViewport({ phone: false });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(2400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(900);
    const { container } = render(view([permanent("tamer")], false, ceiling));
    const card = container.querySelector<HTMLElement>('[data-field-key="digimon"]')!;
    const width = Number.parseFloat(card.style.width);
    expect(width).toBeGreaterThan(116);
    expect(width).toBeLessThanOrEqual(ceiling);
  });

  it("outlines empty places in the support lane, like the Digimon lane", () => {
    mockViewport({ phone: false });
    const { container } = render(view([permanent("tamer")]));
    const row = container.querySelector("[data-field-layout]")!;
    expect(row.getAttribute("data-lanes")).toBe("stacked");
    const support = container.querySelector(".game-battle-lane--support")!;
    expect(support.hasAttribute("data-card-slots")).toBe(true);
    expect(support.querySelectorAll(".game-field-card-slot").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".game-battle-lane--digimon .game-field-card-slot").length).toBeGreaterThan(0);
  });

  it("keeps an empty support lane drawn with its places when two lanes are chosen", () => {
    mockViewport({ phone: false });
    for (const supportFirst of [false, true]) {
      const { container, unmount } = render(view([], supportFirst));
      const support = container.querySelector(".game-battle-lane--support");
      expect(support).not.toBeNull();
      expect(support!.querySelectorAll(".game-field-card-slot").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("puts the groups after the Digimon in one lane when one lane is chosen", () => {
    mockViewport({ phone: false });
    setBattleLanes(BattleLanes.One);
    const { container } = render(view([permanent("tamer")]));
    expect(container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe("merged");
    expect(container.querySelector(".game-battle-lane--support")).toBeNull();
    const keys = [...container.querySelectorAll(".game-battle-lane--digimon [data-field-key]")].map((card) =>
      card.getAttribute("data-field-key"),
    );
    expect(keys).toEqual(["digimon", "tamer"]);
  });

  it.each([false, true])("keeps two separate lanes on short desktop rows (support first: %s)", (supportFirst) => {
    mockViewport({ phone: false });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(180);
    const { container } = render(view([permanent("tamer"), permanent("option")], supportFirst));
    expect(container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe("side-by-side");
    expect(container.querySelectorAll(".game-battle-lane")).toHaveLength(2);
    const cards = [...container.querySelectorAll<HTMLElement>(".game-battle-lane [data-field-key]")];
    expect(cards.map((card) => card.getAttribute("data-field-key")).sort()).toEqual(["digimon", "option", "tamer"]);
    expect(container.querySelector('.game-battle-lane--support [data-field-key="tamer"]')).not.toBeNull();
    expect(new Set(cards.map((card) => card.style.width)).size).toBe(1);
    expect(localStorage.getItem("aegis.battle-lanes")).toBe("two");

    act(() => setBattleLanes(BattleLanes.One));
    expect(container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe("merged");
    expect(container.querySelectorAll(".game-battle-lane")).toHaveLength(1);
    act(() => setBattleLanes(BattleLanes.Two));
    expect(container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe("side-by-side");
    expect(container.querySelectorAll(".game-battle-lane")).toHaveLength(2);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe("stacked");
    expect(container.querySelectorAll(".game-battle-lane")).toHaveLength(2);
  });

  it("draws one lane on a phone and restores the saved two lanes on a wider screen", () => {
    const resize = mockViewport({ phone: true });
    const { container } = render(view([permanent("tamer")]));
    const lanes = () => container.querySelector("[data-field-layout]")!.getAttribute("data-lanes");
    expect(lanes()).toBe("merged");
    expect(localStorage.getItem("aegis.battle-lanes")).toBe("two");

    act(() => resize(false));
    expect(lanes()).toBe("stacked");
    expect(container.querySelector(".game-battle-lane--support .game-field-card-slot")).not.toBeNull();
  });

  it("grows a single lane's cards while the pieces beside the rows keep the two-lane size", () => {
    mockViewport({ phone: false });
    const twoLanes = render(view([permanent("tamer")]));
    const twoLaneWidth = renderHook(useFieldCardWidth).result.current!;
    twoLanes.unmount();

    setBattleLanes(BattleLanes.One);
    render(view([permanent("tamer")]));
    const oneLane = renderHook(useFieldCardWidth).result.current!;
    expect(oneLane.drawn).toBeGreaterThan(twoLaneWidth.drawn);
    expect(oneLane.beside).toBe(twoLaneWidth.drawn);
    expect(oneLane.heightFitted).toBe(twoLaneWidth.heightFitted);
  });

  it("stacks the lanes only when the viewport keeps both rows at a readable size", () => {
    mockViewport({ phone: false });
    const placement = (width: number, height: number) => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
      const { container, unmount } = render(view([permanent("tamer")], false, 116));
      const lanes = container.querySelector("[data-field-layout]")!.getAttribute("data-lanes");
      const digimon = Number.parseFloat(
        container.querySelector<HTMLElement>('[data-field-key="digimon"]')!.style.width,
      );
      unmount();
      return { lanes, digimon };
    };
    const tall = placement(1200, 420);
    expect(tall.lanes).toBe("stacked");
    expect(tall.digimon).toBeGreaterThanOrEqual(84);
    expect(placement(1200, 260).lanes).toBe("side-by-side");
    expect(placement(560, 420).lanes).toBe("stacked");
  });

  it("keeps the placement and shared size when the cards in play change", () => {
    mockViewport({ phone: false });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(420);
    const row = (digimon: Permanent[]) => (
      <I18nProvider>
        <OrganizedBattleRow
          arrangement={{ digimon, support: [{ key: "tamer", members: [permanent("tamer")] }] }}
          layoutWidth={116}
          supportFirst={false}
          digimonLabel="Digimon"
          supportLabel="Support"
          emptyLabel={null}
          rowProps={{ style: { "--field-reserve-support": "1", "--field-support-scale": "1" } as React.CSSProperties }}
          isSuspended={(member) => member.isSuspended}
          renderCard={(card) => (
            <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }} />
          )}
        />
      </I18nProvider>
    );
    const lone = render(row([permanent("lone")]));
    const loneLanes = lone.container.querySelector("[data-field-layout]")!.getAttribute("data-lanes");
    const loneShared = renderHook(useFieldCardWidth).result.current!.heightFitted;
    lone.unmount();
    const deep = permanent("deep");
    for (let source = 0; source < 12; source++) {
      const instance = new CardInstance();
      instance.instanceId = `deep-source-${source}`;
      deep.stack.push(instance);
    }
    const stacked = render(row([deep]));
    expect(stacked.container.querySelector("[data-field-layout]")!.getAttribute("data-lanes")).toBe(loneLanes);
    expect(renderHook(useFieldCardWidth).result.current!.heightFitted).toBe(loneShared);
  });

  it("keeps one card size on a fixed-size board whatever the row holds", () => {
    mockViewport({ phone: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(380);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(164);
    const fixedRow = (digimon: Permanent[]) => (
      <I18nProvider>
        <OrganizedBattleRow
          arrangement={{ digimon, support: [] }}
          layoutWidth={76}
          supportFirst={false}
          digimonLabel="Digimon"
          supportLabel="Support"
          emptyLabel={null}
          rowProps={{
            style: {
              "--field-reserve-support": "1",
              "--field-support-scale": "1",
              "--field-prefer-stacked": "1",
              "--field-fit-width": "1",
              "--field-fixed-width": "64",
            } as React.CSSProperties,
          }}
          isSuspended={(member) => member.isSuspended}
          renderCard={(card) => (
            <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }} />
          )}
        />
      </I18nProvider>
    );
    const widths = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLElement>("[data-field-key]")].map((card) => card.style.width);

    const lone = render(fixedRow([permanent("a")]));
    const loneWidths = widths(lone.container);
    lone.unmount();
    const crowded = Array.from({ length: 6 }, (_, index) => {
      const card = permanent(`crowd-${index}`);
      for (let source = 0; source < 8; source++) {
        const instance = new CardInstance();
        instance.instanceId = `${card.permanentId}-source-${source}`;
        card.stack.push(instance);
      }
      return card;
    });
    const full = render(fixedRow(crowded));

    expect(loneWidths).toEqual(["64px"]);
    expect(new Set(widths(full.container))).toEqual(new Set(["64px"]));
  });
});

it("keeps changing layout measurements out of the synchronous commit loop", () => {
  mockViewport({ phone: false });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let measurements = 0;
  let resizing = true;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-field-layout")) {
      measurements += 1;
      return resizing ? 1200 + measurements : 1200;
    }
    return 1200;
  });
  const screen = render(view([permanent("tamer")]));
  expect(screen.container.querySelector("[data-field-layout]")).not.toBeNull();
  expect(measurements).toBeLessThan(20);
  for (let frame = 0; frame < 10; frame += 1) {
    const callbacks = [...frames.values()];
    frames.clear();
    const before = measurements;
    act(() => {
      for (const callback of callbacks) {
        callback(frame * 16);
      }
    });
    expect(measurements - before).toBeLessThan(20);
    expect(screen.container.querySelector("[data-field-layout]")).not.toBeNull();
  }
  resizing = false;
  for (let frame = 0; frame < 5; frame += 1) {
    const callbacks = [...frames.values()];
    frames.clear();
    act(() => {
      for (const callback of callbacks) {
        callback((frame + 10) * 16);
      }
    });
  }
  expect(frames.size).toBe(0);
  screen.unmount();
  expect(frames.size).toBe(0);
});

it("preserves the enlarged card size on crowded organized lanes instead of fitting it away", () => {
  mockViewport({ phone: false });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(280);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
  const supports = [permanent("first"), permanent("second"), permanent("third")];
  const { container, rerender } = render(view(supports, false, 100));
  const getWidth = () =>
    Number.parseFloat(container.querySelector<HTMLElement>('[data-field-key="digimon"]')!.style.width);
  const standard = getWidth();
  act(() => arenaAppearancePreference.setAppearance({ scale: "larger", transparency: "opaque" }));
  rerender(view(supports, false, 130));
  expect(getWidth()).toBeGreaterThan(standard);
  expect(getWidth()).toBeGreaterThanOrEqual(130);
  expect(container.querySelector(".game-battle-lane")).not.toBeNull();
});
