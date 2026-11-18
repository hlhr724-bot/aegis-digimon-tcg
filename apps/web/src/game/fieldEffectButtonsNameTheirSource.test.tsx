// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { I18nProvider } from "@/i18n/I18nProvider";
import { FieldCardMenu } from "@/game/screen/layout/FieldCardMenu";
import { Side } from "@/game/side";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function card(cardId: string, instanceId: string): CardInstance {
  return Object.assign(new CardInstance(), { cardId, instanceId, faceUp: true });
}

function boltmonWithTwoMainSources(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "boltmon";
  permanent.topCard = card("BT22-078", "top");
  permanent.stack.push(card("BT22-010", "bottom-source"), card("BT22-095", "upper-source"));
  permanent.activatableEffectsJson = JSON.stringify([
    { instanceId: "bottom-source", effectKey: "BT22-010/main", description: "[Main] Bottom source effect." },
    { instanceId: "upper-source", effectKey: "BT22-095/main", description: "[Main] Upper source effect." },
  ]);
  return permanent;
}

it("labels each [Main] button with its source card and effect, ordered like the displayed sources", () => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(() => true),
  }));
  const permanent = boltmonWithTwoMainSources();
  const onActivateEffect = vi.fn<(instanceId: string, effectKey: string) => void>();
  const noop = () => {};
  render(
    <I18nProvider>
      <FieldCardMenu
        permanent={permanent}
        presentedPermanent={permanent}
        side={Side.Viewer}
        x={0}
        y={0}
        container={null}
        returnFocusTo={null}
        viewerSeat={0}
        fate={undefined}
        sheet={false}
        stackCards={[]}
        mine
        activatable
        promotable={false}
        linkTargets={[]}
        onPromote={noop}
        onActivateEffect={onActivateEffect}
        onLink={noop}
        onViewStack={noop}
        onAttack={noop}
        onVortex={noop}
        onClose={noop}
      />
    </I18nProvider>,
  );

  const buttons = screen.getAllByRole("button", { name: /^Activate effect:/ });
  expect(buttons.map((button) => button.textContent)).toEqual([
    `Activate [Main] effect · ${getCardDefinition("BT22-095")!.nameEn}[Main] Upper source effect.`,
    `Activate [Main] effect · ${getCardDefinition("BT22-010")!.nameEn}[Main] Bottom source effect.`,
  ]);

  fireEvent.click(buttons[0]!);
  expect(onActivateEffect).toHaveBeenCalledWith("upper-source", "BT22-095/main");
});
