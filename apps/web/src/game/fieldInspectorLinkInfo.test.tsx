// @vitest-environment jsdom
import { getCardDefinition } from "@aegis/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ArenaPermanentInspector } from "@/game/ArenaPermanentInspector";
import { buildPrintedCardDetail } from "@/game/permanentDetail";
import { Side } from "@/game/side";
import { normalizeKeywordBrackets } from "@/game/keywordReminders";

afterEach(cleanup);

function renderFieldInspector(cardId: string) {
  render(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={{ ...buildPrintedCardDetail(cardId), printedOnly: false }}
        inspection={{ side: Side.Viewer, container: null }}
        onZoom={vi.fn<(cardId: string, artId?: string) => void>()}
        onClose={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  return screen.getByRole("dialog");
}

it.each(["EX11-027", "BT21-009"])("shows the link effect, link cost and link DP of %s on the field", (cardId) => {
  const definition = getCardDefinition(cardId)!;
  const panel = renderFieldInspector(cardId);
  expect(panel.querySelector('[data-role="printed-linked"]')?.textContent).toContain(
    normalizeKeywordBrackets(definition.linkEffect!),
  );
  expect(panel.querySelector('[data-role="link-requirement"]')?.textContent).toBe(definition.linkRequirement!.trim());
  expect(panel.textContent).toContain(`Link DP +${definition.linkDp!.toLocaleString("en")}`);
});

it("keeps inherited and security text hidden for a Digimon on the field", () => {
  const panel = renderFieldInspector("ST1-07");
  expect(panel.querySelector('[data-role="printed-inherited"]')).toBeNull();
  expect(panel.querySelector('[data-role="printed-linked"]')).toBeNull();
  expect(panel.querySelector('[data-role="link-requirement"]')).toBeNull();
});
