import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const fieldStyles = readSource("./arena3dField.css");
const fieldSource = readSource("./Arena3dField.tsx");
const sceneSource = readSource("./Arena3dScene.tsx");
const boardStageSource = readSource("../../screen/layout/BoardStage.tsx");
const portraitStyles = readSource("../../style/arenaPortrait.css");
const redesignPortraitStyles = readSource("../../style/redesignArenaPortrait.css");

describe("breeding area on the 3D field", () => {
  it("renders the breeding dim inside the 3D field, where the DOM fallback and the CSS hooks read it", () => {
    const fieldStart = boardStageSource.indexOf("<Arena3dField");
    const fieldEnd = boardStageSource.indexOf("</Arena3dField>", fieldStart);
    expect(boardStageSource.slice(fieldStart, fieldEnd)).toContain("{breedingMode}");
    expect(boardStageSource).toContain("{arena3d ? null : breedingMode}");
  });

  it("renders the viewer's breeding dock inside the 3D field on every layout and never in the player dock", () => {
    const fieldStart = boardStageSource.indexOf("<Arena3dField");
    const fieldEnd = boardStageSource.indexOf("</Arena3dField>", fieldStart);
    expect(boardStageSource.slice(fieldStart, fieldEnd)).toMatch(/\n\s*\{breedingDock\}\n/);
    expect(boardStageSource).toContain("breedingDock={layout.portraitArena || arena3d ? null : breedingDock}");
  });

  it("publishes the projected width of the viewer's eggs and raising slots", () => {
    expect(fieldSource).toContain("style[`--arena-3d-${name}-w`] = `${width.toFixed(1)}px`;");
  });

  it("hides the DOM dim once the canvas draws the board, so the GL scene dims it instead", () => {
    const selector =
      '.game-board[data-board-style="arena3d"][data-arena-3d-live] .arena-3d-field > .game-breeding-mode {';
    const start = fieldStyles.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    expect(fieldStyles.slice(start, fieldStyles.indexOf("}", start))).toContain("display: none");
    expect(fieldStyles).not.toContain("mask-composite");
  });

  it("dims the DOM above the canvas during the breeding step but leaves the viewer's eggs and raising slots lit", () => {
    const start = fieldStyles.indexOf(":has(.arena-3d-field > .game-breeding-mode)");
    expect(start).toBeGreaterThan(-1);
    const rule = fieldStyles.slice(start, fieldStyles.indexOf("}", start));
    expect(rule).toContain("filter: brightness(0.38) !important");
    expect(rule).toContain(".game-player-dock");
    expect(rule).toContain(".game-opponent-bar");
    expect(rule).toContain(":not(.game-utility-slot--you-eggs, .game-utility-slot--you-raising)");
    expect(rule).not.toContain(".game-memory-band");
    expect(rule).not.toContain(".game-breeding-hint");
  });

  it("tells the GL scene when the breeding step opens", () => {
    const layerStart = boardStageSource.indexOf("<Arena3dLayer");
    const layerEnd = boardStageSource.indexOf("/>", layerStart);
    expect(boardStageSource.slice(layerStart, layerEnd)).toContain("breedingFocus={guards.breedingActionsOpen}");
    expect(sceneSource).toContain("<ArenaBreedingFocus");
    expect(sceneSource).toContain("active={props.breedingFocus}");
  });

  it.each(["wide", "short"])("places the breeding hint beside the GL raising slot on the %s layout", (layout) => {
    const start = fieldStyles.indexOf(`.arena-3d-field[data-arena-layout="${layout}"]`);
    const hintStart = fieldStyles.indexOf("> .game-breeding-hint {", start);
    const rule = fieldStyles.slice(hintStart, fieldStyles.indexOf("}", hintStart));
    expect(rule).toContain("var(--arena-3d-you-raising-x)");
    expect(rule).toContain("var(--arena-3d-you-raising-y)");
  });

  it("styles the breeding hint as a panel when the dock sits inside the 3D field", () => {
    const selector = ".game-field > .arena-3d-field > .game-breeding-dock > .game-breeding-hint";
    expect(portraitStyles).toContain(selector);
    expect(redesignPortraitStyles).toContain(selector);
  });
});
