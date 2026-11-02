import { describe, expect, it } from "vitest";
import { getArenaGamepadLayout } from "@/game/input/getArenaGamepadLayout";

describe("controller family", () => {
  it.each([
    ["Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)", "xbox"],
    ["DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", "playstation"],
    ["Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)", "playstation"],
    ["Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)", "nintendo"],
    ["Generic USB gamepad", "xbox"],
  ])("labels %s as %s", (id, layout) => {
    expect(getArenaGamepadLayout(id).value).toBe(layout);
  });
});
