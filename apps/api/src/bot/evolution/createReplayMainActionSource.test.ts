import { describe, expect, it, vi } from "vitest";
import { createReplayMainActionSource } from "#api/bot/evolution/createReplayMainActionSource";
import type { TrainingAction } from "#api/bot/training/actions";

describe("exact-prefix main action restoration", () => {
  it("only reuses the current matching seat's recorded main catalog", () => {
    let cursor = 0;
    const onReuse = vi.fn<() => void>();
    const onEnumeration = vi.fn<() => void>();
    const mainActions: TrainingAction[] = [{ intent: { type: "endPhase" }, label: "Pass" }];
    const source = createReplayMainActionSource({
      seat: 1,
      prefix: [
        { seat: 0, kind: "main", mainActions },
        { seat: 1, kind: "breeding" },
        { seat: 1, kind: "main", mainActions },
      ],
      cursor: () => cursor,
      enabled: true,
      onReuse,
      onEnumeration,
    });
    expect(source()).toBeUndefined();
    cursor++;
    expect(source()).toBeUndefined();
    cursor++;
    const restored = source()!;
    expect(restored).toEqual(mainActions);
    restored[0]!.label = "Changed";
    expect(mainActions[0]!.label).toBe("Pass");
    cursor++;
    expect(source()).toBeUndefined();
    expect(onReuse).toHaveBeenCalledOnce();
    expect(onEnumeration).not.toHaveBeenCalled();
  });

  it("leaves the reference replay path's enumeration enabled", () => {
    const onReuse = vi.fn<() => void>();
    const onEnumeration = vi.fn<() => void>();
    const source = createReplayMainActionSource({
      seat: 0,
      prefix: [{ seat: 0, kind: "main" }],
      cursor: () => 0,
      enabled: false,
      onReuse,
      onEnumeration,
    });
    expect(source()).toBeUndefined();
    expect(onEnumeration).toHaveBeenCalledOnce();
    expect(onReuse).not.toHaveBeenCalled();
  });

  it("refuses an incomplete accelerated prefix", () => {
    const source = createReplayMainActionSource({
      seat: 0,
      prefix: [{ seat: 0, kind: "main" }],
      cursor: () => 0,
      enabled: true,
      onReuse: vi.fn<() => void>(),
      onEnumeration: vi.fn<() => void>(),
    });
    expect(source).toThrow("Missing exact-prefix main action catalog");
  });
});
