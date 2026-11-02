import { describe, expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { Phase } from "@aegis/shared/schema/enums";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { getGamePhase } from "@/game/screen/model/getGamePhase";

describe("displayed game phase", () => {
  it("shows the guided manual phase instead of the internal routing phase", () => {
    const state = new GameState();
    state.gameMode = GameMode.MANUAL.value;
    state.phase = Phase.Main;
    state.turnCount = 1;
    state.manual.turnPhase = Phase.Breeding;
    expect(getGamePhase({ state })).toBe(Phase.Breeding);
    state.manual.turnPhase = Phase.Main;
    expect(getGamePhase({ state })).toBe(Phase.Main);
  });

  it("keeps the native setup and automatic game phases", () => {
    const state = new GameState();
    state.phase = Phase.Draw;
    state.manual.turnPhase = Phase.Main;
    expect(getGamePhase({ state })).toBe(Phase.Draw);
    state.gameMode = GameMode.MANUAL.value;
    expect(getGamePhase({ state })).toBe(Phase.Draw);
  });
});
