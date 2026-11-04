// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoverZoomPreference } from "@/design/hoverZoomPreference";
import { I18nProvider } from "@/i18n/I18nProvider";
import { Hand } from "@/game/piece/Hand";
import { PermanentView } from "@/game/piece/PermanentView";
import type { HandEntry } from "@/game/piece/types";

const hand: HandEntry[] = [
  { instanceId: "agumon", cardId: "ST1-03" },
  { instanceId: "gabumon", cardId: "ST2-03" },
].map((entry) => ({
  ...entry,
  activatableEffectsJson: "[]",
  playableFromHand: false,
  projectedPlayCost: 3,
  digivolveTargetPermanentIds: [],
  linkTargetPermanentIds: [],
}));

beforeEach(() => {
  hoverZoomPreference.setEnabled(true);
  vi.stubGlobal(
    "DOMMatrix",
    class {
      a = 1;
      b = 0;
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(hover: hover) and (pointer: fine)",
    media: query,
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
  }));
});

afterEach(() => {
  cleanup();
  hoverZoomPreference.setEnabled(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function handCard(instanceId: string) {
  return document.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)!;
}

function hoverWithMouse(element: Element) {
  fireEvent.pointerOver(element, { pointerType: "mouse" });
  fireEvent.pointerMove(element, { pointerType: "mouse", clientX: 240, clientY: 320 });
}

function zoomedCardName() {
  return screen.queryByTestId("card-zoom-preview")?.querySelector("img")?.alt;
}

function renderHand(draggingInstanceId?: string) {
  render(
    <I18nProvider>
      <Hand cards={hand} startDrag={() => {}} draggingInstanceId={draggingInstanceId} />
    </I18nProvider>,
  );
}

function renderPermanent(faceUp = true) {
  const permanent = new Permanent();
  permanent.permanentId = "field-greymon";
  permanent.controllerSeat = 1;
  permanent.topCard = Object.assign(new CardInstance(), { instanceId: "greymon", cardId: "ST1-07", faceUp });
  render(
    <I18nProvider>
      <PermanentView perm={permanent} onClick={() => undefined} />
    </I18nProvider>,
  );
  return document.querySelector<HTMLElement>('[data-permanent-id="field-greymon"]')!;
}

describe("hover zoom on hand cards", () => {
  it("previews the hovered hand card next to the pointer", () => {
    renderHand();
    hoverWithMouse(handCard("gabumon"));
    expect(zoomedCardName()).toBe("Gabumon");
  });

  it("closes the preview when the player presses the card", () => {
    renderHand();
    hoverWithMouse(handCard("agumon"));
    fireEvent.pointerDown(handCard("agumon"), { pointerType: "mouse" });
    expect(zoomedCardName()).toBeUndefined();
  });

  it("shows no preview while a hand card is dragged", () => {
    renderHand("agumon");
    hoverWithMouse(handCard("gabumon"));
    expect(zoomedCardName()).toBeUndefined();
  });

  it("shows no preview when the setting is off", () => {
    hoverZoomPreference.setEnabled(false);
    renderHand();
    hoverWithMouse(handCard("agumon"));
    expect(zoomedCardName()).toBeUndefined();
  });
});

describe("hover zoom on field permanents", () => {
  it("previews the hovered permanent's top card", () => {
    hoverWithMouse(renderPermanent());
    expect(zoomedCardName()).toBe("Greymon");
  });

  it("hides the preview when the pointer leaves the permanent", () => {
    const permanent = renderPermanent();
    hoverWithMouse(permanent);
    fireEvent.pointerOut(permanent, { pointerType: "mouse", relatedTarget: document.body });
    expect(zoomedCardName()).toBeUndefined();
  });

  it("never reveals a face-down permanent", () => {
    hoverWithMouse(renderPermanent(false));
    expect(screen.queryByTestId("card-zoom-preview")).toBeNull();
  });
});
