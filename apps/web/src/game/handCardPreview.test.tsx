// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { HandCardPreview } from "./GameScreen";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { cardEffectClauseForTiming } from "@/game/overlay/effectText";

afterEach(() => cleanup());

it("translates the hand activation tooltip and accessible name while keeping its effect identity", async () => {
  const onActivateEffect = vi.fn<(effect: { instanceId: string; effectKey: string; description: string }) => void>();
  const effect = {
    instanceId: "hand-wargreymon",
    effectKey: "BT22-013/hand-main",
    description: cardEffectClauseForTiming("BT22-013", "Main")!,
  };
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <HandCardPreview
        cardId="BT22-013"
        activatableEffects={[effect]}
        canPlay={false}
        canDigivolve={false}
        onPlay={vi.fn<() => void>()}
        onActivateEffect={onActivateEffect}
        onChooseBase={vi.fn<() => void>()}
        onCancel={vi.fn<() => void>()}
      />
    </I18nContext.Provider>,
  );
  const button = await screen.findByRole("button", { name: /主要.*亚古兽/ });
  expect(button.getAttribute("title")).toContain("[主要]");
  expect(button.getAttribute("title")).not.toContain("[Hand]");
  fireEvent.click(button);
  expect(onActivateEffect).toHaveBeenCalledWith(effect);
});

it("offers a server-projected hand Main effect and sends its exact source key", () => {
  const onActivateEffect = vi.fn();
  const effect = {
    instanceId: "cyber-instance",
    effectKey: "BT10-025/ir-14-0",
    description: "[Hand][Main] Place this card under a Blue Flare Digimon.",
  };

  render(
    <I18nProvider>
      <HandCardPreview
        cardId="BT10-025"
        activatableEffects={[effect]}
        canPlay
        canDigivolve={false}
        onPlay={() => undefined}
        onActivateEffect={onActivateEffect}
        onChooseBase={() => undefined}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: `Activate effect: ${effect.description}` }));
  expect(onActivateEffect).toHaveBeenCalledWith(effect);
  expect(screen.getByRole("button", { name: "Play Digimon" })).toBeTruthy();
});

it("does not invent a hand effect action when the server projection is empty", () => {
  render(
    <I18nProvider>
      <HandCardPreview
        cardId="BT10-025"
        activatableEffects={[]}
        canPlay
        canDigivolve={false}
        onPlay={() => undefined}
        onActivateEffect={() => undefined}
        onChooseBase={() => undefined}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );

  expect(screen.queryByRole("button", { name: /^Activate effect/ })).toBeNull();
});
