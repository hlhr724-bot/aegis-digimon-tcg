// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import { buildSecurityClashScene } from "../../securityClash";
import { activeAttackArrow } from "../../trackingArrow";
import { AttackArrowLayer } from "../layout/AttackArrowLayer";
import { useTrackingArrow } from "./useTrackingArrow";

const declaration: Extract<ServerEvent, { kind: "attackDeclared" }> = {
  kind: "attackDeclared",
  seat: 0,
  attackerPermanentId: "attacker",
  attackerCardId: "BT5-086",
  target: { kind: "player" },
};
const events: ServerEvent[] = [declaration, { kind: "attackEnded", seat: 0, attackerPermanentId: "attacker" }];
const originalAnimations = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getAnimations");

function Harness({
  exiting = false,
  effect = false,
  effectTarget = "defender",
  targetDecision = false,
  attack = declaration,
  sceneVisible = true,
  phasePending = false,
  closed = true,
  defenderVisible = true,
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const permRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const permCentersRef = useRef({ defender: { x: 650, y: 50 } });
  const viewerSecurityRef = useRef<HTMLDivElement>(null);
  const opponentSecurityRef = useRef<HTMLDivElement>(null);
  const scene = buildSecurityClashScene({
    key: exiting ? 1 : 2,
    revealedCardId: "BT1-010",
    resolution: "battle",
    defenderSeat: 1,
    viewerSeat: 0,
    attacker: { seat: 0, cardId: attack.attackerCardId, attackArrow: activeAttackArrow([attack])! },
  });
  const tracking = useTrackingArrow({
    state: undefined,
    events: closed ? events : [attack],
    decision: targetDecision
      ? {
          decisionId: "return-to-hand",
          kind: "chooseTargets",
          seat: 0,
          sourcePermanentId: "attacker",
          promptText: "Return a Digimon to hand",
          options: { candidateInstanceIds: ["defender"], targetFate: "returnToHand" },
        }
      : undefined,
    picks: targetDecision ? ["defender"] : [],
    viewerSeat: 0,
    fieldClash: null,
    securityClash: sceneVisible ? { ...scene, exiting } : null,
    phasePresentationPending: phasePending,
    effectSelection: effect ? { sourcePermanentId: "attacker", targetPermanentIds: [effectTarget] } : undefined,
    boardRef,
    permRefs,
    permCentersRef,
    viewerSecurityRef,
    opponentSecurityRef,
  });
  return (
    <div ref={boardRef}>
      <div
        ref={(element) => {
          permRefs.current.attacker = element;
        }}
      />
      {defenderVisible ? (
        <div
          data-testid="defender"
          ref={(element) => {
            permRefs.current.defender = element;
          }}
        />
      ) : null}
      <div ref={opponentSecurityRef} />
      <AttackArrowLayer preview={null} tracking={tracking} />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalAnimations) Object.defineProperty(SVGElement.prototype, "getAnimations", originalAnimations);
  else Reflect.deleteProperty(SVGElement.prototype, "getAnimations");
});

it.each([0, 0.5, 1, 2].flatMap((rate) => [false, true].map((effect) => ({ rate, effect }))))(
  "retains the painted sweep across security-check remounts at rate $rate, effect interruption $effect",
  ({ rate, effect }) => {
    let now = 1000;
    let age = 280;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      frame = undefined;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const left = this.previousElementSibling ? 300 : 0;
      return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, toJSON() {} };
    });
    Object.defineProperty(SVGElement.prototype, "getAnimations", {
      configurable: true,
      value: function (this: SVGElement) {
        return this.classList.contains("game-attack-arrow__reveal")
          ? [
              {
                animationName: "battle-arrow-extend",
                currentTime: age,
                startTime: null,
                playbackRate: rate,
                playState: rate === 0 ? "paused" : "running",
                effect: { getTiming: () => ({ delay: 0 }) },
              },
            ]
          : [];
      },
    });
    const tick = () =>
      act(() => {
        const callback = frame;
        frame = undefined;
        callback?.(now);
      });
    const screen = render(<Harness sceneVisible={false} phasePending closed={false} />);
    tick();
    expect(screen.container.querySelector("svg")).toBeNull();
    screen.rerender(<Harness phasePending />); // A presented clash owns its arrow even while later phases are queued.
    tick();
    expect(screen.container.querySelector("svg")).not.toBeNull();
    tick(); // Observe the native clock after the SVG has mounted.
    if (effect) {
      screen.rerender(<Harness effect />);
      tick();
      age = 90;
      tick(); // The effect's native clock must not replace the declared attack's.
    }
    screen.rerender(<Harness exiting />);
    expect(screen.container.querySelector("svg")).toBeNull();
    now += 200;
    screen.rerender(<Harness />);
    tick();
    const resumed = screen.container.querySelector("svg")!;
    expect(resumed.style.getPropertyValue("--attack-arrow-delay")).toBe(`${-(280 + 200 * rate)}ms`);

    age = 310;
    screen.rerender(<Harness attack={{ ...declaration, attackerCardId: "ST1-10" }} />);
    tick();
    expect(screen.container.querySelector("svg")!.style.getPropertyValue("--attack-arrow-delay")).toBe("0ms");
  },
);

it.each([false, true])(
  "keeps the arrow at the defender's last visible bounds after deletion (effect: %s)",
  (effect) => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const left = this.dataset.testid === "defender" ? 300 : 0;
      return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, toJSON() {} };
    });
    const tick = () =>
      act(() => {
        frame?.(1000);
      });
    const attack = { ...declaration, target: { kind: "permanent" as const, permanentId: "defender" } };
    const screen = render(<Harness effect={effect} attack={attack} sceneVisible={false} closed={false} />);
    tick();
    const geometry = screen.container.querySelector("svg")!.innerHTML;
    screen.rerender(
      <Harness effect={effect} attack={attack} sceneVisible={false} closed={false} defenderVisible={false} />,
    );
    tick();
    expect(screen.container.querySelector("svg")!.innerHTML).toBe(geometry);
  },
);

it("redirects the painted arrow before the next animation frame", () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = this.previousElementSibling ? 300 : 0;
    return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, toJSON() {} };
  });
  const view = render(<Harness sceneVisible={false} closed={false} />);
  act(() => frame?.(1000));
  const arrow = () => view.container.querySelector("[data-attack-targets]");
  expect(arrow()?.getAttribute("data-attack-targets")).toBe('["security-opp"]');
  view.rerender(
    <Harness
      sceneVisible={false}
      closed={false}
      attack={{
        ...declaration,
        redirected: true,
        target: { kind: "permanent", permanentId: "defender" },
      }}
    />,
  );
  expect(arrow()?.getAttribute("data-attack-targets")).toBe('["defender"]');
});

it.each([false, true])("aims at the chosen return target over an earlier effect cue: %s", (effect) => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = this.previousElementSibling ? 300 : 0;
    return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, toJSON() {} };
  });
  const view = render(<Harness sceneVisible={false} closed={false} />);
  act(() => frame?.(1000));
  const arrow = () => view.container.querySelector("[data-attack-targets]");
  expect(arrow()?.getAttribute("data-attack-targets")).toBe('["security-opp"]');
  view.rerender(<Harness sceneVisible={false} closed={false} targetDecision effect={effect} effectTarget="attacker" />);
  act(() => frame?.(1016));
  expect(arrow()?.getAttribute("data-attack-targets")).toBe('["defender"]');
  view.rerender(<Harness sceneVisible={false} closed={false} />);
  act(() => frame?.(1032));
  expect(arrow()?.getAttribute("data-attack-targets")).toBe('["security-opp"]');
});
