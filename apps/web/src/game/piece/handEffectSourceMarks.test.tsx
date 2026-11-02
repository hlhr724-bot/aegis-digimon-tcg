import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import { Hand } from "@/game/piece/Hand";
import type { HandEntry } from "@/game/piece/types";

vi.mock("@/design/cards", () => ({
  CardFull: ({ cardId }: { cardId: string }) => <div data-card-id={cardId} />,
}));

const copies: HandEntry[] = ["copy-1", "copy-2", "copy-3"].map((instanceId) => ({
  instanceId,
  cardId: "BT1-001",
  activatableEffectsJson: "[]",
  playableFromHand: false,
  projectedPlayCost: 3,
  digivolveTargetPermanentIds: [],
  linkTargetPermanentIds: [],
}));

afterEach(() => {
  cleanup();
});

function renderHand(effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>) {
  render(
    <I18nProvider>
      <Hand cards={copies} startDrag={() => {}} effectSourceMarks={effectSourceMarks} />
    </I18nProvider>,
  );
}

function handCard(instanceId: string) {
  return document.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)!;
}

it("marks only the exact hand copy whose effect is pending", () => {
  renderHand(new Map([["copy-2", EffectSourceMark.PENDING.value]]));

  expect(handCard("copy-2").dataset.effectMark).toBe(EffectSourceMark.PENDING.value);
  expect(handCard("copy-2").getAttribute("aria-label")).toContain("Effect pending");
  expect(handCard("copy-1").dataset.effectMark).toBeUndefined();
  expect(handCard("copy-3").dataset.effectMark).toBeUndefined();
  expect(document.querySelectorAll(".game-hand-card__effect-mark")).toHaveLength(1);
});

it("announces a resolving hand source", () => {
  renderHand(new Map([["copy-3", EffectSourceMark.RESOLVING.value]]));

  expect(screen.getByRole("button", { name: /Effect resolving/ })).toBe(handCard("copy-3"));
});

it("removes the hand marker once no effect is pending or resolving", () => {
  renderHand(new Map());

  expect(document.querySelector("[data-effect-mark]")).toBeNull();
});
