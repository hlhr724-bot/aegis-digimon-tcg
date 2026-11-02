import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
import { ArenaAppearanceControls } from "@/design/arenaAppearance/ArenaAppearanceControls";
import { setTamerGroupingEnabled } from "@/design/tamerGrouping/setTamerGroupingEnabled";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n";
import { isAutoHatchEnabled, setAutoHatchEnabled } from "../../autoHatch";
import { ArenaBoardSettings } from "./ArenaBoardSettings";

afterEach(cleanup);

it("offers auto hatch disabled by default and applies the match setting", () => {
  localStorage.setItem("aegis.locale", "en");
  setAutoHatchEnabled(false);
  render(
    <I18nProvider>
      <ArenaBoardSettings />
    </I18nProvider>,
  );
  const toggle = screen.getByRole("switch", { name: /^Auto hatch/ });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(isAutoHatchEnabled()).toBe(true);
  expect(localStorage.getItem("aegis.breeding.auto-hatch")).toBe("true");
  fireEvent.click(toggle);
  expect(isAutoHatchEnabled()).toBe(false);
});

it("allows disabling identical Tamer grouping during a match and persists the choice", () => {
  localStorage.setItem("aegis.locale", "en");
  setTamerGroupingEnabled(true);
  render(
    <I18nProvider>
      <ArenaBoardSettings />
    </I18nProvider>,
  );
  const toggle = screen.getByRole("switch", { name: /^Group identical Tamers/ });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(localStorage.getItem("aegis.field.group-tamers")).toBe("false");
  setTamerGroupingEnabled(true);
});

it("shares board scale and effect transparency between settings controls and resets both", () => {
  arenaAppearancePreference.resetAppearance();
  render(
    <I18nProvider>
      <ArenaBoardSettings />
      <ArenaAppearanceControls />
    </I18nProvider>,
  );
  const scales = screen.getAllByRole("combobox", { name: "Board and controls size" });
  fireEvent.change(scales[0]!, { target: { value: "larger" } });
  expect((scales[1] as HTMLSelectElement).value).toBe("larger");
  const transparencies = screen.getAllByRole("combobox", { name: "Effect window transparency" });
  fireEvent.change(transparencies[1]!, { target: { value: "clear" } });
  expect((transparencies[0] as HTMLSelectElement).value).toBe("clear");
  expect(JSON.parse(localStorage.getItem("aegis.arena-appearance")!)).toEqual({
    scale: "larger",
    transparency: "clear",
  });
  expect(document.documentElement.style.getPropertyValue("--arena-ui-scale")).toBe("1.3");
  fireEvent.click(screen.getAllByRole("button", { name: "Reset board appearance" })[0]!);
  expect((scales[1] as HTMLSelectElement).value).toBe("default");
  expect((transparencies[0] as HTMLSelectElement).value).toBe("opaque");
});
