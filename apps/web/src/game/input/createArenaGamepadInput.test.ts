import { describe, expect, it, vi } from "vitest";
import type { ArenaInputCommand } from "@/game/input/ArenaInputCommand";
import { createArenaGamepadInput } from "@/game/input/createArenaGamepadInput";

type PadParams = {
  id?: string;
  buttons?: number[];
  axes?: number[];
  index?: number;
  mapping?: GamepadMappingType;
};

function buildPad({
  id = "Test controller",
  buttons = [],
  axes = [0, 0, 0, 0],
  index = 0,
  mapping = "standard",
}: PadParams = {}): Gamepad {
  return {
    index,
    mapping,
    connected: true,
    id,
    timestamp: 0,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      touched: buttons.includes(i),
      value: Number(buttons.includes(i)),
    })),
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe("controller navigation", () => {
  it("requires neutral input on connection and never repeats held confirmations", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    input.poll({ gamepads: [buildPad({ buttons: [0] })], now: 0 });
    expect(onCommand).not.toHaveBeenCalled();
    input.poll({ gamepads: [buildPad()], now: 10 });
    input.poll({ gamepads: [buildPad({ buttons: [0] })], now: 20 });
    input.poll({ gamepads: [buildPad({ buttons: [0] })], now: 1000 });
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["confirm"]);
    input.poll({ gamepads: [buildPad()], now: 1010 });
    input.poll({ gamepads: [buildPad({ buttons: [0] })], now: 1020 });
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("filters drift and repeats directional input after a delay", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    input.poll({ gamepads: [buildPad()], now: 0 });
    input.poll({ gamepads: [buildPad({ axes: [0.24, 0, 0, 0] })], now: 10 });
    expect(onCommand).not.toHaveBeenCalled();
    const pad = buildPad({ axes: [0.8, 0, 0, 0] });
    for (const now of [20, 319, 320, 419, 420]) {
      input.poll({ gamepads: [pad], now });
    }
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["right", "right", "right"]);
  });

  it("rearms after blur, disconnect, and replacement by another controller", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    input.poll({ gamepads: [buildPad()], now: 0 });
    input.reset();
    input.poll({ gamepads: [buildPad({ buttons: [1] })], now: 10 });
    input.poll({ gamepads: [], now: 20 });
    input.poll({ gamepads: [buildPad({ buttons: [0], index: 1 })], now: 30 });
    expect(onCommand).not.toHaveBeenCalled();
    input.poll({ gamepads: [buildPad({ index: 1 })], now: 40 });
    input.poll({ gamepads: [buildPad({ buttons: [2], index: 1 })], now: 50 });
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["inspect"]);
  });

  it("dispatches only one action from a simultaneous confirm and cancel", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    input.poll({ gamepads: [buildPad()], now: 0 });
    for (const now of [10, 20, 400]) {
      input.poll({ gamepads: [buildPad({ buttons: [0, 1] })], now });
    }
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["confirm"]);
  });

  it("supports shoulder regions and right-stick scrolling and ignores nonstandard mappings", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    input.poll({ gamepads: [buildPad({ mapping: "" })], now: 0 });
    input.poll({ gamepads: [buildPad({ mapping: "", buttons: [5] })], now: 10 });
    expect(onCommand).not.toHaveBeenCalled();
    input.poll({ gamepads: [buildPad()], now: 20 });
    input.poll({ gamepads: [buildPad({ buttons: [5] })], now: 30 });
    input.poll({ gamepads: [buildPad({ axes: [0, 0, 0, -0.8] })], now: 40 });
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["nextRegion", "scrollUp"]);
  });

  it("confirms with the right face button on Nintendo controllers", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand) => void>();
    const input = createArenaGamepadInput({ onCommand });
    const id = "Nintendo Switch Pro Controller (Vendor: 057e Product: 2009)";
    input.poll({ gamepads: [buildPad({ id })], now: 0 });
    input.poll({ gamepads: [buildPad({ id, buttons: [1] })], now: 10 });
    input.poll({ gamepads: [buildPad({ id })], now: 20 });
    input.poll({ gamepads: [buildPad({ id, buttons: [0] })], now: 30 });
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["confirm", "cancel"]);
  });

  it("reports the controller family with each command", () => {
    const onCommand = vi.fn<(command: ArenaInputCommand, layout: { value: string }) => void>();
    const input = createArenaGamepadInput({ onCommand });
    const id = "DualSense Wireless Controller (Vendor: 054c Product: 0ce6)";
    input.poll({ gamepads: [buildPad({ id })], now: 0 });
    input.poll({ gamepads: [buildPad({ id, buttons: [0] })], now: 10 });
    expect(onCommand.mock.calls.map(([command, layout]) => [command, layout.value])).toEqual([
      ["confirm", "playstation"],
    ]);
  });
});
