// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardKind, EffectDuration, type FieldEffectView } from "@aegis/shared";
import { I18nProvider } from "../../../i18n";
import { FieldEffectsIndicator } from "./FieldEffectsIndicator";
import { readFieldEffects } from "@/game/readFieldEffects";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 390,
    bottom: 200,
    width: 390,
    height: 200,
    toJSON: () => ({}),
  });
});
const reduction: FieldEffectView = {
  kind: "dp",
  value: -4000,
  duration: EffectDuration.UntilEachTurnEnd,
  ownerSeat: 0,
  sourceCardId: "BT25-018",
  effectText: "All of your opponent's Digimon get -4000 DP for the turn.",
};
function indicator(effects: FieldEffectView[], ownField = true) {
  return (
    <I18nProvider>
      <div className="game-field">
        <section className="game-battle-zones">
          <div className="game-battle-row--opp" />
          <div className="game-memory-band" />
          <div className="game-battle-row--you" />
        </section>
        <FieldEffectsIndicator json={JSON.stringify(effects)} ownField={ownField} playerNames={["Tai", "Matt"]} />
      </div>
    </I18nProvider>
  );
}
it("keeps a field reduction visible without any field cards and exposes its source and expiry", () => {
  render(indicator([reduction]));
  const summary = screen.getByLabelText("Your field: DP −4,000");
  fireEvent.click(summary);
  expect(summary.closest("details")).toHaveProperty("open", true);
  expect(screen.getByText("Apollomon · BT25-018")).toBeTruthy();
  expect(screen.getAllByText("Until the end of this turn")).toHaveLength(1);
});
it("separates opponent effects and shows each rule instead of summing filtered DP", () => {
  render(
    indicator(
      [
        reduction,
        {
          kind: "restriction",
          value: "beSuspended",
          ownerSeat: 1,
          duration: EffectDuration.UntilOpponentTurnEnd,
          sourceCardId: "BT25-028",
        },
      ],
      false,
    ),
  );
  expect(screen.getByLabelText("Opponent field: 2 active effects")).toBeTruthy();
  expect(screen.getByText("Can't suspend")).toBeTruthy();
  expect(screen.getByText("Until the end of Tai’s turn")).toBeTruthy();
});
it("removes the indicator when the server expires the last field rule", () => {
  const view = render(indicator([reduction]));
  view.rerender(indicator([]));
  expect(document.querySelector("details")).toBeNull();
});
it("shows a granted keyword and a continuous source without a misleading turn deadline", () => {
  render(
    indicator([
      {
        kind: "keyword",
        value: "Blocker",
        ownerSeat: 0,
        duration: EffectDuration.Permanent,
        continuous: true,
        sourceCardId: "BT22-052",
      },
    ]),
  );
  expect(screen.getByLabelText("Your field: Blocker")).toBeTruthy();
  expect(screen.getAllByText("While active")).toHaveLength(1);
});
it("supports older state snapshots and ignores malformed projections", () => {
  expect(readFieldEffects(undefined)).toEqual([]);
  expect(readFieldEffects("not JSON")).toEqual([]);
  expect(readFieldEffects("{}")).toEqual([]);
  expect(readFieldEffects('[null,{"kind":"hidden"}]')).toEqual([]);
});

it("anchors multiple indicators outside the battle grid and keeps their collapsed controls compact", () => {
  const view = render(indicator([reduction, { ...reduction, value: -2000 }]));
  const zones = view.container.querySelector(".game-battle-zones")!;
  expect(zones.children).toHaveLength(3);
  const summary = screen.getByLabelText("Your field: 2 active effects");
  expect(summary.textContent).toBe("2");
  expect(summary.closest("details")?.parentElement).toBe(document.body);
  fireEvent.click(summary);
  expect(summary.closest("details")).toHaveProperty("open", true);
  expect(screen.getByText("DP −4,000")).toBeTruthy();
  expect(screen.getByText("DP −2,000")).toBeTruthy();
  view.rerender(indicator([reduction]));
  expect(screen.getByLabelText("Your field: DP −4,000").textContent).toBe("1");
});

it("names the next opponent turn when the current boundary must be skipped", () => {
  render(
    indicator([{ ...reduction, duration: EffectDuration.UntilOpponentTurnEnd, skipsCurrentOpponentTurnEnd: true }]),
  );
  fireEvent.click(screen.getByLabelText("Your field: DP −4,000"));
  expect(screen.getByText("Until the end of Matt’s next turn")).toBeTruthy();
});

it("keeps the desktop viewer indicator visible when its battle row extends below the field container", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...window.matchMedia(""), matches: false });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.matches(".game-field") ? new DOMRect(0, 69, 1440, 623) : new DOMRect(258, 470, 923, 274);
  });
  render(indicator([reduction]));
  const badge = screen.getByLabelText("Your field: DP −4,000").closest("details")!;
  expect(Number.parseFloat(badge.style.top)).toBeGreaterThanOrEqual(470);
  expect(Number.parseFloat(badge.style.top) + 44).toBeLessThanOrEqual(692);
});

it("Discord 1557582673117970482 keeps field chrome in the board's modal stacking context", () => {
  const view = render(<div id="aegis-stage">{indicator([reduction])}</div>);
  const badge = screen.getByLabelText("Your field: DP −4,000").closest("details")!;
  expect(badge.parentElement).toBe(view.container.querySelector("#aegis-stage"));
  expect(badge.closest(".game-battle-zones")).toBeNull();
});

it("keeps field chrome inside the isolated board so board notices and prompts can cover it", () => {
  const view = render(
    <div id="aegis-stage">
      <div className="game-board">{indicator([reduction], false)}</div>
    </div>,
  );
  const badge = screen.getByLabelText("Opponent field: DP −4,000").closest("details")!;
  expect(badge.parentElement).toBe(view.container.querySelector(".game-board"));
  expect(badge.closest(".game-battle-zones")).toBeNull();
});

it("uses the body fallback for standalone boards even if an unrelated stage exists", () => {
  render(<div id="aegis-stage" />);
  render(indicator([reduction], false));
  expect(screen.getByLabelText("Opponent field: DP −4,000").closest("details")?.parentElement).toBe(document.body);
});

it("dismisses explanations on outside pointer interaction without cancelling the board action", () => {
  render(indicator([reduction]));
  const summary = screen.getByLabelText("Your field: DP −4,000");
  const details = summary.closest("details")!;
  fireEvent.click(summary);
  fireEvent.pointerDown(screen.getByText("Apollomon · BT25-018"));
  expect(details.open).toBe(true);
  const action = document.createElement("button");
  document.body.append(action);
  const handle = vi.fn<(event: PointerEvent) => void>();
  action.addEventListener("pointerdown", handle);
  fireEvent.pointerDown(action);
  expect(details.open).toBe(false);
  expect(handle).toHaveBeenCalledOnce();
  expect(handle.mock.calls[0]![0].defaultPrevented).toBe(false);
  action.remove();
});

it("dismisses with Escape and preserves keyboard access without stealing focus from another control", () => {
  render(indicator([reduction]));
  const summary = screen.getByLabelText("Your field: DP −4,000");
  const details = summary.closest("details")!;
  summary.focus();
  fireEvent.click(summary);
  fireEvent.keyDown(summary, { key: "Escape" });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  fireEvent.click(summary);
  const action = document.createElement("button");
  document.body.append(action);
  action.focus();
  fireEvent.keyDown(action, { key: "Escape" });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(action);
  action.remove();
});

it("updates both field anchors on scrolling and fold resize and removes offscreen open chrome", () => {
  let shift = 0;
  let visible = true;
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...window.matchMedia(""), matches: true });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.matches(".game-field")) return new DOMRect(0, 0, 900, visible ? 600 : 10);
    return this.matches(".game-battle-row--you")
      ? new DOMRect(100, 250 + shift, 700, 200)
      : new DOMRect(100, 100 + shift, 700, 100);
  });
  const view = render(
    <>
      {indicator([reduction])}
      {indicator([reduction], false)}
    </>,
  );
  const own = screen.getByLabelText("Your field: DP −4,000");
  const opponent = screen.getByLabelText("Opponent field: DP −4,000");
  expect(own.closest("details")!.style.top).toBe("420px");
  expect(opponent.closest("details")!.style.top).toBe("72px");
  fireEvent.click(own);
  shift = 10;
  fireEvent.scroll(window);
  expect(own.closest("details")!.style.top).toBe("430px");
  expect(opponent.closest("details")!.style.top).toBe("82px");
  visible = false;
  fireEvent.resize(window);
  expect(document.querySelectorAll(".game-field-effects")).toHaveLength(0);
  visible = true;
  fireEvent.resize(window);
  expect(screen.getByLabelText("Your field: DP −4,000").closest("details")!.open).toBe(false);
  view.unmount();
  fireEvent.pointerDown(document.body);
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(document.querySelectorAll(".game-field-effects")).toHaveLength(0);
});

it.each([
  { kind: CardKind.Digimon, label: "Protected from opposing Digimon effects" },
  { kind: CardKind.Option, label: "Protected from opposing Option effects" },
])("names the specific $kind effects that a field protection blocks", ({ kind, label }) => {
  render(
    indicator([
      {
        kind: "restriction",
        value: "beAffected",
        duration: EffectDuration.UntilOpponentTurnEnd,
        ownerSeat: 0,
        fromSourceKind: [kind],
        byOpponentEffectsOnly: true,
      },
    ]),
  );
  expect(screen.getByLabelText(`Your field: ${label}`)).toBeTruthy();
});
