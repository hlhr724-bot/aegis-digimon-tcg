// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { SpectatorCodeForm } from "./SpectatorCodeForm";

afterEach(cleanup);

it("enters a shared spectator code without selecting a deck", () => {
  const onWatch = vi.fn();
  render(
    <I18nProvider>
      <SpectatorCodeForm initialCode="ABCDEF" onWatch={onWatch} />
    </I18nProvider>,
  );
  expect((screen.getByRole("textbox", { name: "Match code" }) as HTMLInputElement).value).toBe("ABCDEF");
  fireEvent.click(screen.getByRole("button", { name: /^Watch$/ }));
  expect(onWatch).toHaveBeenCalledWith("ABCDEF");
});

it("keeps incomplete codes from entering a room", () => {
  const onWatch = vi.fn();
  render(
    <I18nProvider>
      <SpectatorCodeForm onWatch={onWatch} />
    </I18nProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Match code" }), { target: { value: "abc" } });
  expect((screen.getByRole("button", { name: /^Watch$/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(onWatch).not.toHaveBeenCalled();
});
