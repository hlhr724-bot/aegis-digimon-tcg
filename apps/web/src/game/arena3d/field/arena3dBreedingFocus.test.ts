import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const fieldStyles = readSource("./arena3dField.css");
const fieldSource = readSource("./Arena3dField.tsx");
const boardStageSource = readSource("../../screen/layout/BoardStage.tsx");
const portraitStyles = readSource("../../style/arenaPortrait.css");
const redesignPortraitStyles = readSource("../../style/redesignArenaPortrait.css");

describe("breeding area on the 3D field", () => {
  it("renders the breeding dim inside the 3D field so it can read the projected slots", () => {
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

  it("cuts the dim open over the GL eggs and raising cards on every layout", () => {
    const start = fieldStyles.indexOf(".arena-3d-field > .game-breeding-mode {");
    expect(start).toBeGreaterThan(-1);
    const rule = fieldStyles.slice(start, fieldStyles.indexOf("}", start));
    expect(rule).toContain("mask-composite: exclude");
    expect(rule).toContain("var(--arena-3d-you-eggs-x)");
    expect(rule).toContain("var(--arena-3d-you-raising-x)");
  });

  it.each(["wide", "short"])("places the breeding hint beside the GL eggs on the %s layout", (layout) => {
    const start = fieldStyles.indexOf(`.arena-3d-field[data-arena-layout="${layout}"]`);
    const hintStart = fieldStyles.indexOf("> .game-breeding-hint {", start);
    const rule = fieldStyles.slice(hintStart, fieldStyles.indexOf("}", hintStart));
    expect(rule).toContain("var(--arena-3d-you-eggs-x)");
    expect(rule).toContain("var(--arena-3d-you-eggs-y)");
  });

  it("styles the breeding hint as a panel when the dock sits inside the 3D field", () => {
    const selector = ".game-field > .arena-3d-field > .game-breeding-dock > .game-breeding-hint";
    expect(portraitStyles).toContain(selector);
    expect(redesignPortraitStyles).toContain(selector);
  });
});
