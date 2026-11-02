import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { saveLocale } from "@/i18n/saveLocale";
import { EffectText } from "@/game/EffectText";
import { InspectorActiveBadges } from "@/game/InspectorActiveBadges";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ArenaPermanentInspector } from "@/game/ArenaPermanentInspector";
import { buildPrintedCardDetail } from "@/game/permanentDetail";
import { INSPECTOR_SIDE_SOURCES_QUERY } from "@/game/inspectorSourcesLayoutQuery";
import { Side } from "@/game/side";
import { setCardSleeveId } from "@/design/sleeve";
import type { StackCard } from "@/game/overlay/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  saveLocale("en");
});

type Params = { wide: boolean; cards?: StackCard[] };

function renderInspector({ wide, cards }: Params) {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === INSPECTOR_SIDE_SOURCES_QUERY && wide,
    media: query,
    onchange: null,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(() => true),
  }));
  const onZoom = vi.fn<(cardId: string, artId?: string) => void>();
  const detail = {
    ...buildPrintedCardDetail("ST1-11"),
    printedOnly: false,
    cards:
      cards ??
      ([
        { cardId: "ST1-11", role: "top" },
        { cardId: "ST1-01", role: "stack", faceDown: true },
        { cardId: "ST1-03", role: "stack" },
        { cardId: "ST1-07", artId: "alternate-art", role: "stack" },
      ] as StackCard[]),
  };
  function getPanel(cardId = detail.cardId) {
    return (
      <I18nProvider>
        <ArenaPermanentInspector
          detail={{ ...detail, cardId }}
          inspection={{ side: Side.Viewer, container: null }}
          onZoom={onZoom}
          onClose={vi.fn<() => void>()}
        />
      </I18nProvider>
    );
  }
  return { ...render(getPanel()), onZoom, getPanel };
}

it("shows sources directly below top first in an independent region and zooms the source art", () => {
  const { onZoom } = renderInspector({ wide: true });
  const region = screen.getByRole("region", { name: "3 sources" });
  expect([...region.querySelectorAll("[data-card-id]")].map((row) => row.getAttribute("data-card-id"))).toEqual([
    "ST1-07",
    "ST1-03",
    "ST1-01",
  ]);
  expect(region.querySelector('[data-card-id="ST1-01"] p')).toBeNull();
  expect(region.textContent).toContain("Face down");
  fireEvent.click(within(region).getByRole("button", { name: "Open Greymon" }));
  expect(onZoom).toHaveBeenCalledWith("ST1-07", "alternate-art");
  expect(
    document.querySelector(".arena-permanent-inspector__effects .arena-permanent-inspector__effect--source"),
  ).toBeNull();
  expect(screen.getByRole("dialog").getAttribute("data-sources")).toBe("column");
});

it("selects inherited text separately from zoom and resets for another top card", () => {
  const { onZoom, rerender, getPanel } = renderInspector({ wide: false });
  const strip = screen.getByRole("group", { name: "3 sources" });
  const buttons = within(strip).getAllByRole("button");
  expect(buttons).toHaveLength(3);
  expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector(".arena-permanent-inspector__strip-detail")?.textContent).toContain(
    "Security Attack +1",
  );
  fireEvent.click(buttons[1]!);
  expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
  const selected = document.querySelector<HTMLElement>(".arena-permanent-inspector__strip-detail")!;
  expect(selected.textContent).toContain("+1000 DP");
  expect(selected.textContent).not.toContain("Security Attack +1");
  expect(onZoom).not.toHaveBeenCalled();
  fireEvent.click(within(selected).getByRole("button", { name: "Enlarge card" }));
  expect(onZoom).toHaveBeenCalledWith("ST1-03", undefined);
  fireEvent.click(buttons[2]!);
  expect(selected.querySelector("p")).toBeNull();
  rerender(getPanel("ST1-09"));
  expect(
    within(screen.getByRole("group", { name: /sources/ }))
      .getAllByRole("button")[0]!
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it.each([true, false])("keeps hidden sources unreadable and unzoomable at wide=%s", (wide) => {
  const { onZoom } = renderInspector({ wide, cards: [{ cardId: "", role: "stack", faceDown: true }] });
  expect(screen.getByText("Face-down card")).toBeTruthy();
  expect(document.querySelector(".arena-permanent-inspector__effect--source p")).toBeNull();
  expect(document.querySelector(".arena-permanent-inspector__effect--source button")).toBeNull();
  expect(document.querySelector(".arena-permanent-inspector__strip-detail button")).toBeNull();
  expect(onZoom).not.toHaveBeenCalled();
});

const megadramonSources: StackCard[] = [
  { cardId: "ST1-11", role: "top" },
  { cardId: "EX12-064", role: "stack", oncePerTurnUsed: true },
  { cardId: "EX12-064", role: "stack" },
];

it("replaces the inherited role with a used pill and dims the spent inherited effect on wide screens", () => {
  renderInspector({ wide: true, cards: megadramonSources });
  const marks = document.querySelectorAll(".arena-permanent-inspector__used-effect");
  expect(marks).toHaveLength(1);
  expect(marks[0]!.textContent).toBe("Inherited · used this turn");
  const source = marks[0]!.closest(".arena-permanent-inspector__effect--source");
  expect(source?.getAttribute("data-once-per-turn-used")).toBe("true");
  expect(source?.querySelector(".arena-permanent-inspector__effect-label")?.textContent).not.toContain("· Inherited");
});

it("names the source with a used inherited effect in the narrow strip", () => {
  renderInspector({ wide: false, cards: megadramonSources });
  const strip = screen.getByRole("group", { name: "2 sources" });
  expect(within(strip).getAllByRole("button", { name: /Inherited · used this turn/ })).toHaveLength(1);
  expect(strip.querySelectorAll('[data-once-per-turn-used="true"]')).toHaveLength(1);
});

it.each([true, false])("draws hidden sources without the local sleeve at wide=%s", (wide) => {
  setCardSleeveId("omnimon");
  renderInspector({ wide, cards: [{ cardId: "", role: "stack", faceDown: true }] });
  expect(document.querySelector('img[src="/sleeves/omnimon.webp"]')).toBeNull();
  expect(document.querySelector('img[src="/sleeves/digimon-standard.webp"]')).toBeTruthy();
});

it.each([true, false])("keeps cards without sources in the existing layout at wide=%s", (wide) => {
  renderInspector({ wide, cards: [{ cardId: "ST1-11", role: "top" }] });
  expect(screen.getByRole("dialog").hasAttribute("data-sources")).toBe(false);
  expect(screen.queryByRole("region", { name: /sources/ })).toBeNull();
  expect(screen.queryByRole("group", { name: /sources/ })).toBeNull();
});

it.each([true, false])("shows link effects and the missing-effect fallback at wide=%s", (wide) => {
  renderInspector({
    wide,
    cards: [
      { cardId: "ST1-02", role: "stack" },
      { cardId: "BT21-009", role: "linked" },
    ],
  });
  expect(document.querySelector(".arena-permanent-inspector__effect--source p")?.textContent).toBe("No printed effect");
  expect(document.querySelector('[data-card-id="ST1-02"]')?.hasAttribute("data-empty")).toBe(true);
  if (!wide) {
    fireEvent.click(within(screen.getByRole("group", { name: /sources/ })).getByRole("button", { name: "Gatchmon" }));
  }
  expect(document.querySelector('[data-role="linked"] p')?.textContent).toContain("Raid");
  expect(document.querySelector('[data-role="linked"]')?.hasAttribute("data-empty")).toBe(false);
});

it.each([true, false])("reveals the full printed effect of a source without inheritable text at wide=%s", (wide) => {
  renderInspector({ wide, cards: [{ cardId: "BT11-088", role: "stack" }] });
  const source = document.querySelector<HTMLElement>('[data-card-id="BT11-088"]')!;
  expect(source.hasAttribute("data-empty")).toBe(true);
  const printed = source.querySelector<HTMLDetailsElement>(".arena-permanent-inspector__source-printed")!;
  expect(printed.open).toBe(false);
  expect(within(printed).getByText("Printed effect")).toBeTruthy();
  expect(printed.textContent).toContain("If your opponent has 1 or fewer Digimon in play");
});

it.each([true, false])("keeps the printed effect of a face-down source hidden at wide=%s", (wide) => {
  renderInspector({ wide, cards: [{ cardId: "BT11-088", role: "stack", faceDown: true }] });
  expect(document.querySelector(".arena-permanent-inspector__source-printed")).toBeNull();
});

it("resizes the side sources column from its separator and saves the width", () => {
  renderInspector({ wide: true });
  const separator = screen.getByRole("separator", { name: "Drag to resize the sources panel" });
  const panel = screen.getByRole("dialog");
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator.getAttribute("aria-valuenow")).toBe("192");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator.getAttribute("aria-valuenow")).toBe("208");
  expect(panel.style.getPropertyValue("--inspector-sources-width")).toBe("208px");
  expect(localStorage.getItem("aegis.inspector-sources-width")).toBe("208");
  fireEvent.doubleClick(separator);
  expect(separator.getAttribute("aria-valuenow")).toBe("272");
});

it("keeps the strip layout without a separator on narrow screens", () => {
  renderInspector({ wide: false });
  expect(screen.queryByRole("separator")).toBeNull();
});

it("keeps source selection working after a browser translator reparents an effect timing marker", () => {
  renderInspector({ wide: false });
  const buttons = within(screen.getByRole("group", { name: "3 sources" })).getAllByRole("button");
  fireEvent.click(buttons[1]!);
  const effect = document.querySelector(".arena-permanent-inspector__strip-detail .card-effect-text")!;
  const marker = effect.querySelector("mark[data-kind=timing]")!;
  const translated = document.createElement("font");
  translated.style.verticalAlign = "inherit";
  marker.replaceWith(translated);
  translated.append(marker);

  fireEvent.click(buttons[0]!);

  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(document.querySelector(".arena-permanent-inspector__strip-detail")?.textContent).toContain(
    "Security Attack +1",
  );
  fireEvent.click(buttons[1]!);
  expect(document.querySelector(".arena-permanent-inspector__strip-detail")?.textContent).toContain("+1000 DP");
});

it("collapses secondary information on the field and expands it for printed cards", () => {
  const { rerender } = renderInspector({ wide: true });
  const details = document.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.textContent).toContain("ST1-11");
  rerender(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={buildPrintedCardDetail("BT26-050")}
        inspection={{ side: Side.Viewer, container: null }}
        onZoom={() => undefined}
        onClose={() => undefined}
      />
    </I18nProvider>,
  );
  expect(document.querySelector("details")!.open).toBe(true);
  expect(document.querySelector("details")!.textContent).toContain("[Burst Digivolve]");
  expect(document.querySelector('[data-role="top"]')!.textContent).toContain("[When Digivolving]");
  expect(document.querySelector('[data-role="top"]')!.textContent).not.toContain("[Burst Digivolve]");
});

it("frames multicolor sources without exposing the colors of hidden sources", () => {
  renderInspector({
    wide: true,
    cards: [
      { cardId: "BT26-050", role: "stack" },
      { cardId: "BT26-050", faceDown: true, role: "stack" },
    ],
  });
  const sources = [...document.querySelectorAll<HTMLElement>(".arena-permanent-inspector__effect--source")];
  expect(sources[0]!.style.getPropertyValue("--source-border")).not.toBe(
    sources[1]!.style.getPropertyValue("--source-border"),
  );
  expect(sources[0]!.querySelector("p")).toBeNull();
});

it("uses semantic markers only when the inspector requests them", () => {
  const text = "[When Attacking] [When Digivolving] [Once Per Turn] [Rosemon]";
  const { rerender, container } = render(
    <I18nProvider>
      <EffectText text={text} inspector />
    </I18nProvider>,
  );
  expect([...container.querySelectorAll("mark")].map((mark) => mark.dataset.marker)).toEqual([
    "attack",
    "evolution",
    "limit",
    "reference",
  ]);
  rerender(
    <I18nProvider>
      <EffectText text={text} />
    </I18nProvider>,
  );
  expect(container.querySelector("[data-marker]")).toBeNull();
});

it("shows server-resolved abilities separately from restrictions", () => {
  render(
    <I18nProvider>
      <InspectorActiveBadges
        detail={{
          ...buildPrintedCardDetail("ST1-11"),
          keywords: ["Blocker", "SecurityAttack"],
          securityAttackModifier: -1,
          restrictions: [
            { kind: "cannotUnsuspend", labelKey: "game.restriction.cannotUnsuspend", icon: "unsuspendOff" },
          ],
        }}
      />
    </I18nProvider>,
  );
  expect(document.querySelector('[data-keyword="Blocker"]')?.getAttribute("data-tone")).toBe("defense");
  expect(document.querySelector('[data-restriction="cannotUnsuspend"]')?.getAttribute("data-tone")).toBe("restriction");
  expect(document.querySelector('[data-restriction="cannotUnsuspend"] svg')).toBeTruthy();
  expect(document.querySelector('[data-keyword="SecurityAttack"]')?.textContent).toContain("-1");
});

it.each([true, false])("shows keywords gained from effects in the inspector when wide is %s", (wide) => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === INSPECTOR_SIDE_SOURCES_QUERY && wide,
    media: query,
    onchange: null,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(() => true),
  }));
  render(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={{
          ...buildPrintedCardDetail("BT21-075"),
          printedOnly: false,
          keywords: ["Raid", "Retaliation"],
          grantedKeywords: ["Raid", "Retaliation"],
        }}
        inspection={{ side: Side.Viewer, container: null }}
        onZoom={vi.fn<(cardId: string, artId?: string) => void>()}
        onClose={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  const state = document.querySelector(".arena-permanent-inspector__state")!;
  expect(state.querySelector('[data-keyword="Raid"]')?.textContent).toContain("Raid");
  expect(state.querySelector('[data-keyword="Retaliation"]')?.textContent).toContain("Retaliation");
});

it("preserves expanded details while live state updates", () => {
  const { rerender, getPanel } = renderInspector({ wide: true });
  const details = document.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  rerender(getPanel());
  expect(document.querySelector("details")!.open).toBe(true);
  rerender(getPanel("ST1-09"));
  expect(document.querySelector("details")!.open).toBe(false);
});

it("highlights translated per-turn limits", () => {
  const { container } = render(
    <I18nProvider>
      <EffectText inspector text="[攻击时]（每回合1次）抽1张卡" />
    </I18nProvider>,
  );
  expect(container.querySelector('[data-marker="limit"]')?.textContent).toBe("（每回合1次）");
});

it("keeps the full printed translation when separating card requirements", async () => {
  await loadPrintedCardTranslations();
  saveLocale("zh-CN");
  const { rerender, getPanel } = renderInspector({ wide: true });
  rerender(getPanel("BT20-041"));
  expect(document.querySelector('[data-role="top"]')?.textContent).toContain("[进化时]");
  expect(document.querySelector('[data-role="top"]')?.textContent).not.toContain("[When Digivolving]");
  expect(document.querySelector("details")?.textContent).toContain("[进化]");
  expect(document.querySelector('[data-marker="evolution"]')?.textContent).toBe("[进化时]");
});

it("opens a keyword explanation from the keyboard", () => {
  render(
    <I18nProvider>
      <EffectText inspector text="＜Blocker＞" />
    </I18nProvider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "＜Blocker＞" }), { key: "Enter" });
  expect(document.querySelector(".game-badge-hint")?.textContent).toContain("Blocker");
});

it.each([
  ["[DNA Digivolve] Blue Lv.4 + Green Lv.4: Cost 0", "[DNA Digivolve]", "8-2"],
  ["[DNA Digivolution] Red Lv.4 + yellow Lv.4: Cost 0", "[DNA Digivolution]", "8-2"],
  ["[App Fusion] [Gatchmon] & [Navimon]: Cost 0", "[App Fusion]", "8-4"],
  ["[DigiXros -2] 1 Lv.5 or lower Digimon card", "[DigiXros -2]", "7-2"],
  ["[Assembly -2] Lv.4 or lower [TB] trait card", "[Assembly -2]", "7-3"],
])("explains the %s requirement with its rule", (text, marker, rule) => {
  render(
    <I18nProvider>
      <EffectText inspector text={text} />
    </I18nProvider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: marker }), { key: "Enter" });
  const hint = document.querySelector(".game-badge-hint");
  expect(hint?.textContent).toContain(marker);
  expect(hint?.textContent).toContain(`Comprehensive Rules ${rule}`);
});

it("keeps ordinary timing markers without an explanation", () => {
  render(
    <I18nProvider>
      <EffectText inspector text="[On Play] [Gatchmon]" />
    </I18nProvider>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
