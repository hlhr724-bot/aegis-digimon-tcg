// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DeviceHandoffSettings } from "@/game/handoff/DeviceHandoffSettings";

describe("continuing a match on another device from the match settings", () => {
  beforeEach(() => {
    localStorage.setItem("aegis.locale", "en");
    render(
      <I18nProvider>
        <DeviceHandoffSettings url="https://aegis.test/" />
      </I18nProvider>,
    );
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("keeps the QR code hidden until the player asks for it", () => {
    expect(screen.queryByRole("img", { name: "QR code that opens Aegis to resume this match" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));

    const code = screen.getByRole("img", { name: "QR code that opens Aegis to resume this match" });
    expect(code.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(screen.getByText("https://aegis.test/")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide QR code" }).getAttribute("aria-expanded")).toBe("true");
  });
});
