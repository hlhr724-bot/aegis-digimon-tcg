// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { DnaMaterialChoiceOverlay } from "./DnaMaterialChoiceOverlay";

afterEach(cleanup);
const routes = [
  { materialPermanentIds: ["yellow", "first-purple"], projectedCost: 0 },
  { materialPermanentIds: ["yellow", "second-purple"], projectedCost: 1 },
];
const permanents = ["yellow", "first-purple", "second-purple"].map((id, index) => {
  const permanent = new Permanent();
  permanent.permanentId = id;
  permanent.topCard = Object.assign(new CardInstance(), {
    cardId: index === 0 ? "ST10-05" : "ST10-12",
    instanceId: id,
  });
  if (index === 2) permanent.stack.push(Object.assign(new CardInstance(), { cardId: "BT1-009", instanceId: "source" }));
  return permanent;
});

it("#5166: lets the player confirm the second physical DNA pair with a compact price summary", () => {
  const onConfirm = vi.fn<(ids: string[]) => void>();
  render(
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={routes}
        permanents={permanents}
        pickedPermanentIds={routes[1]!.materialPermanentIds}
        onConfirm={onConfirm}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("region").getAttribute("data-prompt-surface")).toBe("left");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "DNA Digivolve" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(["yellow", "second-purple"]);
  expect(screen.queryByText("1 digivolution cards")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText(/^Cost: 1/)).toBeTruthy();
});

it("#5166: cannot silently switch to the first pair when the selected route disappears", () => {
  const onConfirm = vi.fn<(ids: string[]) => void>();
  const view = render(
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={routes}
        permanents={permanents}
        pickedPermanentIds={routes[1]!.materialPermanentIds}
        onConfirm={onConfirm}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  view.rerender(
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={[routes[0]!]}
        permanents={permanents}
        pickedPermanentIds={routes[1]!.materialPermanentIds}
        onConfirm={onConfirm}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  const confirm = screen.getByRole("button", { name: "DNA Digivolve" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("#5166: supports cancellation and normal evolution without consuming a DNA pair", () => {
  const onConfirm = vi.fn<(ids: string[]) => void>();
  const onCancel = vi.fn<() => void>();
  const onNormalEvolution = vi.fn<() => void>();
  render(
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={routes}
        permanents={permanents}
        pickedPermanentIds={routes[0]!.materialPermanentIds}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onNormalEvolution={onNormalEvolution}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Digivolve normally" }));
  fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
  expect(onNormalEvolution).toHaveBeenCalledOnce();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});

it("waits for the live action guard before confirming a selected DNA pair", () => {
  const onConfirm = vi.fn<(ids: string[]) => void>();
  const prompt = (disabled: boolean) => (
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={routes}
        permanents={permanents}
        pickedPermanentIds={routes[0]!.materialPermanentIds}
        disabled={disabled}
        onConfirm={onConfirm}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>
  );
  const view = render(prompt(true));
  const confirm = screen.getByRole("button", { name: "DNA Digivolve" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
  view.rerender(prompt(false));
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(["yellow", "first-purple"]);
});

it("allows a normal play while DNA materials are available", () => {
  const onConfirm = vi.fn<(ids: string[]) => void>();
  const onNormalPlay = vi.fn<() => void>();
  render(
    <I18nProvider>
      <DnaMaterialChoiceOverlay
        routes={routes}
        permanents={permanents}
        pickedPermanentIds={[]}
        onConfirm={onConfirm}
        onNormalPlay={onNormalPlay}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Play normally" }));
  expect(onNormalPlay).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});
