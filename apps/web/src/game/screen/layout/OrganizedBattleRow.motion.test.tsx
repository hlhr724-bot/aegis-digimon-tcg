// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { OrganizedBattleRow } from "./OrganizedBattleRow";
import { I18nProvider } from "../../../i18n";
import { reportFieldCardWidth } from "./fieldCardWidth";
import { CARD_SUSPEND_MOTION } from "../../../design/cardMotion";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("replaces a departing card with its guide before measuring the remaining cards' motion", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1100);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(245);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const siblings = [...(this.parentElement?.children ?? [])];
    const x = siblings.indexOf(this) * 100 - siblings.length * 50;
    return { x, y: 0, left: x, top: 0, right: x + 100, bottom: 140, width: 100, height: 140, toJSON: () => ({}) };
  });
  const animate = vi.fn<() => Partial<Animation>>(() => ({
    startTime: null,
    playState: "finished",
    cancel: vi.fn<() => void>(),
  }));
  const originalAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = animate as unknown as typeof originalAnimate;
  const permanents = Array.from({ length: 5 }, (_, index) => {
    const permanent = new Permanent();
    permanent.permanentId = `card-${index}`;
    return permanent;
  });
  const view = (digimon: Permanent[]) => (
    <I18nProvider>
      <OrganizedBattleRow
        arrangement={{ digimon, support: [] }}
        layoutWidth={100}
        supportFirst={false}
        digimonLabel="Digimon"
        supportLabel="Support"
        emptyLabel={null}
        rowProps={{}}
        isSuspended={(p) => p.isSuspended}
        renderCard={(card) => <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }} />}
      />
    </I18nProvider>
  );
  try {
    const { container, rerender } = render(view(permanents));
    animate.mockClear();
    rerender(view(permanents.slice(0, 4)));
    expect(container.querySelectorAll(".game-battle-lane--digimon .game-field-card-slot")).toHaveLength(1);
    // The four surviving cards never moved: the fifth card's guide already holds its place.
    expect(animate).not.toHaveBeenCalled();
  } finally {
    HTMLElement.prototype.animate = originalAnimate;
  }
});

it("slides reordered groups from their old positions to rest without restarting on unrelated renders", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(245);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const cards = this.parentElement?.querySelectorAll("[data-field-key]");
    const index = cards ? [...cards].indexOf(this) : 0;
    return {
      x: index * 100,
      y: 0,
      left: index * 100,
      top: 0,
      right: index * 100 + 50,
      bottom: 70,
      width: 50,
      height: 70,
      toJSON: () => ({}),
    };
  });
  const animate = vi.fn<() => Partial<Animation>>(() => ({
    startTime: null,
    playState: "finished",
    cancel: vi.fn<() => void>(),
  }));
  const originalAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = animate as unknown as typeof originalAnimate;
  const permanent = (id: string) => {
    const p = new Permanent();
    p.permanentId = id;
    p.topCard = new CardInstance();
    p.topCard.cardId = "BT22-093";
    return p;
  };
  const a = permanent("a");
  const b = permanent("b");
  const view = (members: Permanent[], label = "Support") => (
    <I18nProvider>
      <OrganizedBattleRow
        arrangement={{ digimon: [], support: members.map((p) => ({ key: p.permanentId, members: [p] })) }}
        layoutWidth={100}
        supportFirst={false}
        digimonLabel="Digimon"
        supportLabel={label}
        emptyLabel={null}
        rowProps={{}}
        isSuspended={(p) => p.isSuspended}
        renderCard={(card) => <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }} />}
      />
    </I18nProvider>
  );
  try {
    const { rerender } = render(view([a, b]));
    animate.mockClear();
    rerender(view([b, a]));
    expect(animate).toHaveBeenCalledTimes(2);
    const frames = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
    expect(frames[0]![0][0]!.translate).toBe("100px 0px");
    expect(frames[1]![0][0]!.translate).toBe("-100px 0px");
    expect(
      frames.every(
        ([keyframes]) =>
          keyframes.length === 2 &&
          keyframes[1]!.translate === "0px 0px" &&
          keyframes[1]!.rotate === "0deg" &&
          keyframes.every((frame) => frame.transform === undefined),
      ),
    ).toBe(true);
    expect(animate.mock.results.every(({ value }) => typeof value.startTime === "number" && value.startTime > 0)).toBe(
      true,
    );
    rerender(view([b, a], "Updated label"));
    expect(animate).toHaveBeenCalledTimes(2);
  } finally {
    HTMLElement.prototype.animate = originalAnimate;
  }
});

it("turns only the artwork when a suspended copy leaves its group", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(245);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const field = this.closest<HTMLElement>("[data-field-key]");
    if (field && field !== this) return field.getBoundingClientRect();
    const index = [...(this.parentElement?.querySelectorAll("[data-field-key]") ?? [])].indexOf(this);
    return {
      x: index * 100,
      y: 0,
      left: index * 100,
      top: 0,
      right: index * 100 + 50,
      bottom: 70,
      width: 50,
      height: 70,
      toJSON: () => ({}),
    };
  });
  const calls: { element: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions; animation: Animation }[] =
    [];
  const cancelTurn = vi.fn<() => void>();
  let nativeProgress = 1;
  const originalAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (frames, options) {
    const animation = {
      startTime: null,
      playState: "running",
      effect: { getComputedTiming: () => ({ progress: nativeProgress }) },
      cancel(this: { playState: AnimationPlayState }) {
        cancelTurn();
        this.playState = "idle";
      },
    } as unknown as Animation;
    calls.push({
      element: this,
      frames: frames as Keyframe[],
      options: options as KeyframeAnimationOptions,
      animation,
    });
    return animation;
  };
  const copies = ["a", "b"].map((id) => {
    const permanent = new Permanent();
    permanent.permanentId = id;
    permanent.topCard = new CardInstance();
    permanent.topCard.cardId = "BT22-093";
    return permanent;
  });
  const view = (split: boolean, mergedMembers = copies) => (
    <I18nProvider>
      <OrganizedBattleRow
        arrangement={{
          digimon: [],
          support: split
            ? [
                { key: "group", members: [copies[1]!] },
                { key: "leaver", members: [copies[0]!] },
              ]
            : [{ key: "group", members: mergedMembers }],
        }}
        layoutWidth={100}
        supportFirst={false}
        digimonLabel="Digimon"
        supportLabel="Support"
        emptyLabel={null}
        rowProps={{}}
        isSuspended={(p) => p.isSuspended}
        renderCard={(card) => (
          <div
            key={card.fieldKey}
            data-field-key={card.fieldKey}
            data-suspended={card.members[0]!.isSuspended || undefined}
          >
            <div className="game-card-enter">
              <div data-state="suspended" />
            </div>
          </div>
        )}
      />
    </I18nProvider>
  );
  try {
    const { container, rerender } = render(view(false));
    calls.length = 0;
    copies[0]!.isSuspended = true;
    rerender(view(true));
    const artwork = calls.find(({ element }) => element.hasAttribute("data-state"));
    expect(artwork?.frames).toEqual([{ rotate: "0deg" }, { rotate: "90deg" }]);
    expect(artwork?.options).toMatchObject({
      duration: CARD_SUSPEND_MOTION.durationMs,
      easing: CARD_SUSPEND_MOTION.easing,
    });
    expect(
      calls
        .filter(({ element }) => element.hasAttribute("data-field-key"))
        .every(({ options }) => options.duration === 420),
    ).toBe(true);
    expect(
      calls
        .filter(({ element }) => element.hasAttribute("data-field-key"))
        .every(({ frames }) => frames.every((frame) => frame.rotate === "0deg")),
    ).toBe(true);
    const originalArt = artwork!.element;
    originalArt.style.rotate = "45deg";
    cancelTurn.mockClear();
    calls.length = 0;
    copies[0]!.isSuspended = false;
    rerender(view(true));
    expect(cancelTurn).toHaveBeenCalled();
    const reversed = calls.find(({ element }) => element === originalArt);
    expect(reversed?.frames).toEqual([{ rotate: "45deg" }, { rotate: "0deg" }]);
    nativeProgress = 0.15625;
    calls.length = 0;
    rerender(view(false, [copies[1]!, copies[0]!]));
    const returning = container.querySelector<HTMLElement>('[data-testid="field-group-return"]');
    expect(returning?.getAttribute("aria-hidden")).toBe("true");
    expect(returning?.inert).toBe(true);
    expect(returning?.hasAttribute("data-field-key")).toBe(false);
    const interruptedTurn = calls.find(
      ({ element, frames }) => element === returning && frames.some((frame) => frame.rotate),
    );
    expect(interruptedTurn?.frames).toEqual([{ rotate: "37.96875deg" }, { rotate: "0deg" }]);
    const slide = calls.find(({ element, frames }) => element === returning && frames.some((frame) => frame.translate));
    expect(slide?.options.duration).toBe(420);
    expect(slide?.frames[1]?.translate).toBe("-100px 0px");
    slide!.animation.onfinish!(new Event("finish") as AnimationPlaybackEvent);
    expect(container.querySelector('[data-testid="field-group-return"]')).toBeNull();
  } finally {
    HTMLElement.prototype.animate = originalAnimate;
  }
});

it("keeps a merging copy on the same clock when another row changes the shared card width", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(245);
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computedStyle(element);
    const property = style.getPropertyValue.bind(style);
    style.getPropertyValue = (name) => (name === "--field-reserve-support" ? "1" : property(name));
    return style;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const field = this.closest<HTMLElement>("[data-field-key]");
    if (field && field !== this) return field.getBoundingClientRect();
    const index = [...(this.parentElement?.querySelectorAll("[data-field-key]") ?? [])].indexOf(this);
    const width = Number.parseFloat(this.style.width) || 50;
    return {
      x: index * 100,
      y: 0,
      left: index * 100,
      top: 0,
      right: index * 100 + width,
      bottom: 70,
      width,
      height: 70,
      toJSON: () => ({}),
    };
  });
  const calls: {
    element: HTMLElement;
    frames: Keyframe[];
    animation: Animation;
    setKeyframes: ReturnType<typeof vi.fn>;
  }[] = [];
  const originalAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (frames) {
    const setKeyframes = vi.fn<(frames: Keyframe[]) => void>();
    const animation = {
      playState: "running",
      currentTime: 105,
      effect: { getComputedTiming: () => ({ progress: 0.25 }), setKeyframes },
      cancel: vi.fn<() => void>(),
    } as unknown as Animation;
    calls.push({ element: this, frames: frames as Keyframe[], animation, setKeyframes });
    return animation;
  };
  const members = ["width-a", "width-b"].map((id) => {
    const permanent = new Permanent();
    permanent.permanentId = id;
    permanent.topCard = new CardInstance();
    permanent.topCard.cardId = "BT22-093";
    return permanent;
  });
  const view = (merged: boolean) => (
    <I18nProvider>
      <OrganizedBattleRow
        arrangement={{
          digimon: [],
          support: merged
            ? [{ key: "width-a", members }]
            : members.map((member) => ({ key: member.permanentId, members: [member] })),
        }}
        layoutWidth={100}
        supportFirst={false}
        digimonLabel="Digimon"
        supportLabel="Support"
        emptyLabel={null}
        rowProps={{}}
        isSuspended={(permanent) => permanent.isSuspended}
        renderCard={(card) => (
          <div key={card.fieldKey} data-field-key={card.fieldKey} style={{ width: card.width }}>
            <div className="game-card-enter">
              <div data-state="active" />
            </div>
          </div>
        )}
      />
    </I18nProvider>
  );
  reportFieldCardWidth("motion-test-peer", { heightFitted: 100, drawn: 35, beside: 35 });
  try {
    const { container, rerender, unmount } = render(view(false));
    rerender(view(true));
    const copy = container.querySelector<HTMLElement>('[data-testid="field-group-return"]');
    expect(copy).not.toBeNull();
    const flight = calls.find((call) => call.element === copy)!;
    const sourceCentre = Number.parseFloat(copy!.style.left) + copy!.parentElement!.getBoundingClientRect().left;
    act(() => reportFieldCardWidth("motion-test-peer", { heightFitted: 100, drawn: 37, beside: 37 }));
    expect(container.querySelector('[data-testid="field-group-return"]')).toBe(copy);
    expect(flight.animation.cancel).not.toHaveBeenCalled();
    expect(flight.animation.currentTime).toBe(105);
    expect(flight.setKeyframes).toHaveBeenCalledTimes(1);
    const frames = flight.setKeyframes.mock.calls[0]![0] as Keyframe[];
    const oldEnd = Number.parseFloat(String(flight.frames[1]!.translate));
    const newStart = Number.parseFloat(String(frames[0]!.translate));
    const newEnd = Number.parseFloat(String(frames[1]!.translate));
    expect(newEnd).not.toBe(oldEnd);
    // Updating the endpoint preserves the currently painted, eased position.
    expect(newStart * 0.75 + newEnd * 0.25).toBeCloseTo(oldEnd * 0.25);
    rerender(view(false));
    expect(container.querySelector('[data-testid="field-group-return"]')).toBeNull();
    const physical = container.querySelector<HTMLElement>('[data-field-key="width-b"]');
    const resumed = calls.filter((call) => call.element === physical).at(-1);
    expect(resumed).toBeDefined();
    const shift = Number.parseFloat(String(resumed!.frames[0]!.translate));
    const physicalArt = physical!.querySelector<HTMLElement>("[data-state]")!.getBoundingClientRect();
    expect(physicalArt.left + physicalArt.width / 2 + shift).toBeCloseTo(sourceCentre + oldEnd * 0.25);
    unmount();
    expect(flight.animation.cancel).toHaveBeenCalledOnce();
    expect(copy!.isConnected).toBe(false);
  } finally {
    reportFieldCardWidth("motion-test-peer", undefined);
    HTMLElement.prototype.animate = originalAnimate;
  }
});

it.each(["digimon", "split support"])(
  "holds a %s destruction target at its painted position through a running slide and later reflow",
  (lane) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(245);
    let progress = 0;
    const animations = new Map<HTMLElement, { frames: Keyframe[]; animation: Animation }>();
    const originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function (frames) {
      const animation = {
        startTime: null,
        playState: "running",
        effect: { getComputedTiming: () => ({ progress }) },
        cancel(this: Animation) {
          Object.defineProperty(this, "playState", { value: "idle", configurable: true });
        },
      } as Animation;
      animations.set(this, { frames: frames as Keyframe[], animation });
      return animation;
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = [...(this.parentElement?.querySelectorAll("[data-field-key]") ?? [])].indexOf(this);
      const flight = animations.get(this);
      const from = Number.parseFloat(String(flight?.frames[0]?.translate)) || 0;
      const to = Number.parseFloat(String(flight?.frames[1]?.translate)) || 0;
      const offset = flight?.animation.playState === "running" ? from * (1 - progress) + to * progress : 0;
      const x = Math.max(0, index) * 100 + (Number.parseFloat(this.style.translate) || 0) + offset;
      return { x, y: 0, left: x, top: 0, right: x + 50, bottom: 70, width: 50, height: 70, toJSON: () => ({}) };
    });
    const permanents = ["target", "survivor", "newcomer"].map((id) => {
      const p = new Permanent();
      p.permanentId = id;
      return p;
    });
    const [target, survivor, newcomer] = permanents as [Permanent, Permanent, Permanent];
    const view = (members: Permanent[], held = false, grouped = false) => (
      <I18nProvider>
        <OrganizedBattleRow
          arrangement={
            lane === "digimon"
              ? { digimon: members, support: [] }
              : {
                  digimon: [],
                  support: grouped
                    ? [{ key: "target", members }]
                    : members.map((p) => ({ key: p.permanentId, members: [p] })),
                }
          }
          layoutWidth={100}
          supportFirst={false}
          digimonLabel="Digimon"
          supportLabel="Support"
          emptyLabel={null}
          rowProps={{}}
          isSuspended={(p) => p.isSuspended}
          renderCard={(card) => (
            <div
              key={card.fieldKey}
              data-field-key={card.fieldKey}
              data-permanent-id={card.permanent.permanentId}
              data-stationary-departure={(card.permanent === target && held) || undefined}
            />
          )}
        />
      </I18nProvider>
    );
    try {
      const { container, rerender } = render(view([target, survivor], false, true));
      rerender(view([survivor, target]));
      progress = 0.5;
      const face = container.querySelector<HTMLElement>('[data-permanent-id="target"]')!;
      expect(face.getBoundingClientRect().x).toBe(50);
      // Marking the same physical face must stop the already-running slide.
      rerender(view([survivor, target], true));
      progress = 1;
      expect(face.getBoundingClientRect().x).toBe(50);
      // A later layout change must preserve that position, while survivors still slide.
      progress = 0;
      rerender(view([target, survivor, newcomer], true));
      expect(face.getBoundingClientRect().x).toBe(50);
      progress = 1;
      expect(face.getBoundingClientRect().x).toBe(50);
      const other = container.querySelector<HTMLElement>('[data-permanent-id="survivor"]')!;
      expect(animations.get(other)?.animation.playState).toBe("running");
      expect(container.querySelector('[data-permanent-id="newcomer"]')).not.toBeNull();
      // Cancelling the selection resumes ordinary layout movement from the held pose.
      progress = 0;
      rerender(view([target, survivor, newcomer]));
      expect(face.getBoundingClientRect().x).toBe(50);
      progress = 1;
      expect(face.getBoundingClientRect().x).toBe(0);
      rerender(view([survivor, newcomer]));
      expect(container.querySelector('[data-permanent-id="target"]')).toBeNull();
      expect(container.querySelector('[data-testid="field-group-return"]')).toBeNull();
    } finally {
      HTMLElement.prototype.animate = originalAnimate;
    }
  },
);
