import { describe, expect, it } from "vitest";
import { skipUnchangedPixelRatio } from "@/game/arena3d/field/skipUnchangedPixelRatio";

function createRenderer(initialRatio: number) {
  const calls: number[] = [];
  let ratio = initialRatio;
  const renderer = {
    getPixelRatio: () => ratio,
    setPixelRatio: (value: number) => {
      calls.push(value);
      ratio = value;
    },
  };
  return { renderer, calls };
}

describe("skipping unchanged pixel ratios", () => {
  it("does not reapply the current pixel ratio", () => {
    const { renderer, calls } = createRenderer(2);
    skipUnchangedPixelRatio(renderer);

    renderer.setPixelRatio(2);

    expect(calls).toEqual([]);
  });

  it("applies a new pixel ratio once", () => {
    const { renderer, calls } = createRenderer(2);
    skipUnchangedPixelRatio(renderer);

    renderer.setPixelRatio(1.5);
    renderer.setPixelRatio(1.5);

    expect(calls).toEqual([1.5]);
  });
});
