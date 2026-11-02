import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ManualRestartControls } from "@/game/manual/ManualRestartControls";
import { GameState } from "@aegis/shared/schema/GameState";
import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";

vi.mock("@/i18n/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("manual restart proposal", () => {
  it("disables proposing a restart while an attack is in progress", () => {
    const state = new GameState();
    state.manual.combatStage = ManualCombatStage.ATTACK.value;
    const markup = renderToStaticMarkup(
      <ManualRestartControls state={state} seat={0} send={vi.fn<(command: ManualCommand) => void>()} />,
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>manual.restart.propose<\/button>/);
  });

  it("permits proposing a restart when combat is closed", () => {
    const state = new GameState();
    const markup = renderToStaticMarkup(
      <ManualRestartControls state={state} seat={0} send={vi.fn<(command: ManualCommand) => void>()} />,
    );
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>manual.restart.propose<\/button>/);
  });
});
