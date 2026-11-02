// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ArenaPermanentInspector } from "./ArenaPermanentInspector";
import { buildPermanentDetail } from "./permanentDetail";
import { Side } from "./side";

afterEach(cleanup);

it("quotes the granted forced-attack clause and its card in the Digimon details (Discord bug 1557482157012680795)", () => {
  const permanent = new Permanent();
  permanent.permanentId = "monodramon";
  permanent.controllerSeat = 1;
  permanent.topCard = Object.assign(new CardInstance(), { instanceId: "monodramon-top", cardId: "BT1-009" });
  permanent.baseDP = 3000;
  permanent.currentDP = 3000;
  permanent.attacksAtStartOfMainPhase = true;
  permanent.forcedAttackGrantsJson = JSON.stringify([
    { clause: "[Start of Your Main Phase] This Digimon attacks.", sourceCardId: "ST15-16" },
  ]);
  render(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={buildPermanentDetail(permanent)}
        inspection={{ side: Side.Opponent, container: document.body }}
        onZoom={vi.fn<(cardId: string) => void>()}
        onClose={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );

  const panel = screen.getByRole("dialog");
  expect(panel.textContent).toContain("Trident Arm granted: [Start of Your Main Phase] This Digimon attacks.");
});

it("shows granted effects on an opponent's Digimon", () => {
  const permanent = new Permanent();
  permanent.permanentId = "protected-opponent";
  permanent.controllerSeat = 1;
  permanent.topCard = Object.assign(new CardInstance(), { instanceId: "protected-top", cardId: "BT1-009" });
  permanent.baseDP = 3000;
  permanent.currentDP = 3000;
  permanent.grantedEffectTexts.push("[All Turns] This Digimon is unaffected by your opponent's effects.");

  render(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={buildPermanentDetail(permanent)}
        inspection={{ side: Side.Opponent, container: document.body }}
        onZoom={vi.fn<(cardId: string) => void>()}
        onClose={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );

  const panel = screen.getByRole("dialog");
  expect(panel.textContent).toContain("Granted effects");
  expect(panel.textContent).toContain("This Digimon is unaffected by your opponent's effects.");
});
