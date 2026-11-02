import { describe, expect, it } from "vitest";
import { getBoardPromptSurface } from "@/game/getBoardPromptSurface";

describe("board prompt surface", () => {
  it.each(["left", "center"] as const)("places a yes/no board prompt at the chosen %s position", (position) => {
    expect(getBoardPromptSurface({ variant: "prompt", position })).toBe(position);
  });

  it.each(["selection", "field-selection"] as const)(
    "keeps the %s rail on the left so the board stays visible for picking",
    (variant) => {
      expect(getBoardPromptSurface({ variant, position: "center" })).toBe("left");
    },
  );
});
