// @vitest-environment jsdom
import { Phase } from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { ArenaDemo } from "./ArenaDemo";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/dev/arena?hand=20&opponentHand=20");
});
afterEach(() => cleanup());

function demo() {
  const result = render(
    <I18nProvider>
      <ArenaDemo />
    </I18nProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Demo tools" });
  function open() {
    fireEvent.pointerDown(trigger);
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit demo keywords" }));
    return screen.getByRole("dialog", { name: "Grant keywords" });
  }
  function grant(keyword: string, amount?: number, parameter?: string) {
    const panel = screen.getByRole("dialog", { name: "Grant keywords" });
    fireEvent.change(within(panel).getByRole("searchbox", { name: "Search keywords" }), { target: { value: keyword } });
    if (amount !== undefined)
      fireEvent.change(within(panel).getByRole("spinbutton"), { target: { value: String(amount) } });
    if (parameter !== undefined)
      fireEvent.change(within(panel).getByRole("textbox", { name: "Requirement (optional text)" }), {
        target: { value: parameter },
      });
    fireEvent.click(within(panel).getByRole("button", { name: "Grant keyword" }));
  }
  function close() {
    fireEvent.click(screen.getByRole("button", { name: "View arena" }));
  }
  function field(id = "you-chronomon") {
    return result.container.querySelector<HTMLElement>(`[data-drop="perm-you"][data-id="${id}"]`)!;
  }
  return { ...result, trigger, open, grant, close, field };
}

it("grants, retains through phase changes, removes and resets while preserving both 20-card hands", () => {
  const ui = demo();
  const panel = ui.open();
  expect(panel.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(within(panel).getByRole("searchbox"));
  expect(ui.container.inert).toBe(true);
  expect(
    within(within(panel).getByRole("combobox", { name: "Your Digimon" })).queryByRole("option", { name: /Shota/ }),
  ).toBeNull();
  ui.grant("Blocker");
  ui.close();
  expect(document.activeElement).toBe(ui.trigger);
  expect(ui.container.inert).toBe(false);
  expect(ui.field().querySelector('[aria-label="Active keywords: Blocker"]')).toBeTruthy();
  expect(ui.container.querySelectorAll(".game-hand-card")).toHaveLength(20);
  // Pile chips are hidden by default (4886cf605); the screen-reader pile list always carries the counts.
  for (const side of ["You", "Opponent"])
    expect(within(screen.getByRole("list", { name: side })).getByText("Hand: 20 cards in hand")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Phase" }), { target: { value: Phase.End } });
  expect(ui.field().querySelector('[aria-label="Active keywords: Blocker"]')).toBeTruthy();
  ui.open();
  fireEvent.click(screen.getByRole("button", { name: "Remove Blocker" }));
  ui.grant("Guard");
  fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
  expect(within(screen.getByRole("group", { name: "Granted keywords" })).getByText("No test grants yet.")).toBeTruthy();
  ui.close();
  expect(ui.field().querySelector('[aria-label^="Active keywords:"]')).toBeNull();
});

it("displays signed numeric and textual parameters in the inspector with an explicit visual-preview limit", () => {
  const ui = demo();
  const panel = ui.open();
  expect(panel.textContent).toContain("Effects and requirements are not executed in this demo.");
  ui.grant("Security Attack", 2);
  ui.grant("Succession", undefined, "[Ceresmon]");
  ui.close();
  fireEvent.keyDown(ui.field(), { key: "Enter" });
  const detail = screen.getByRole("dialog", { name: "Chronomon: Holy Mode" });
  // The chip prints the SIGNED modifier now, not the resolved number of security checks.
  expect(within(detail).getByRole("region", { name: "Active keywords" }).textContent).toContain("Security Attack +2");
  expect(detail.textContent).toContain("Succession ([Ceresmon])");
  expect(ui.field().querySelector('[aria-label^="Active keywords:"]')?.getAttribute("aria-label")).toContain(
    "Succession ([Ceresmon])",
  );
});

it("keeps more than ten grants summarized on the field and individually accessible in the scrolling inspector", () => {
  const ui = demo();
  ui.open();
  const keywords = [
    "Blocker",
    "Piercing",
    "Rush",
    "Raid",
    "Reboot",
    "Jamming",
    "Retaliation",
    "Barrier",
    "Evade",
    "Guard",
    "Detach",
    "Succession",
  ];
  for (const keyword of keywords) ui.grant(keyword);
  ui.close();
  const summary = ui.field().querySelector('[aria-label$="more keywords"]');
  expect(summary).toBeTruthy();
  const hiddenCount = Number(summary!.getAttribute("aria-label")!.split(" ")[0]);
  const visibleCount = ui.field().querySelectorAll(".game-keyword-badge:not(.game-keyword-badge--more)").length;
  expect(hiddenCount + visibleCount).toBe(keywords.length);
  expect(ui.field().querySelector('[aria-label^="Active keywords:"]')?.getAttribute("aria-label")).toContain(
    "Succession",
  );
  fireEvent.keyDown(ui.field(), { key: "Enter" });
  const region = within(screen.getByRole("dialog", { name: "Chronomon: Holy Mode" })).getByRole("region", {
    name: "Active keywords",
  });
  expect(region.tabIndex).toBe(0);
  expect([...region.children].map((chip) => chip.textContent)).toEqual(keywords.map((keyword) => `<${keyword}>`));
});

it("traps focus inside the modal and returns to its trigger on Escape", () => {
  const ui = demo();
  const panel = ui.open();
  const done = within(panel).getByRole("button", { name: "View arena" });
  done.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Close keyword editor" }));
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(done);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Grant keywords" })).toBeNull();
  expect(document.activeElement).toBe(ui.trigger);
});
