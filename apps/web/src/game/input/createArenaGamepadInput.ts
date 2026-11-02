import { ArenaInputCommand } from "@/game/input/ArenaInputCommand";
import { getArenaGamepadLayout } from "@/game/input/getArenaGamepadLayout";

type Layout = ReturnType<typeof getArenaGamepadLayout>;

type Params = {
  onCommand: (command: ArenaInputCommand, layout: Layout) => void;
};

type PollParams = { gamepads: readonly (Gamepad | null)[]; now: number };

function getButtonCommands(layout: Layout) {
  return [
    [layout.confirmButton, ArenaInputCommand.CONFIRM.value],
    [layout.cancelButton, ArenaInputCommand.CANCEL.value],
    [2, ArenaInputCommand.INSPECT.value],
    [3, ArenaInputCommand.TURN.value],
    [4, ArenaInputCommand.PREVIOUS_REGION.value],
    [5, ArenaInputCommand.NEXT_REGION.value],
  ] as const;
}

export function createArenaGamepadInput({ onCommand }: Params) {
  let activeIndex: number | undefined;
  let armed = false;
  let previous = new Set<ArenaInputCommand>();
  const repeats = new Map<ArenaInputCommand, number>();

  function reset() {
    activeIndex = undefined;
    armed = false;
    previous.clear();
    repeats.clear();
  }

  function poll({ gamepads, now }: PollParams) {
    const standard = gamepads.filter((pad): pad is Gamepad => !!pad?.connected && pad.mapping === "standard");
    const pad = standard.find((candidate) => candidate.index === activeIndex) ?? standard[0];
    if (!pad) {
      reset();
      return;
    }
    if (pad.index !== activeIndex) {
      reset();
      activeIndex = pad.index;
    }
    const layout = getArenaGamepadLayout(pad.id);
    const buttonCommands = getButtonCommands(layout);
    const held = new Set<ArenaInputCommand>();
    for (const [index, command] of buttonCommands) {
      if (pad.buttons[index]?.pressed) {
        held.add(command);
      }
    }
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (pad.buttons[12]?.pressed || y < -0.25) {
      held.add(ArenaInputCommand.UP.value);
    }
    if (pad.buttons[13]?.pressed || y > 0.25) {
      held.add(ArenaInputCommand.DOWN.value);
    }
    if (pad.buttons[14]?.pressed || x < -0.25) {
      held.add(ArenaInputCommand.LEFT.value);
    }
    if (pad.buttons[15]?.pressed || x > 0.25) {
      held.add(ArenaInputCommand.RIGHT.value);
    }
    if ((pad.axes[3] ?? 0) < -0.25) {
      held.add(ArenaInputCommand.SCROLL_UP.value);
    }
    if ((pad.axes[3] ?? 0) > 0.25) {
      held.add(ArenaInputCommand.SCROLL_DOWN.value);
    }
    if (!armed) {
      armed = held.size === 0 && pad.buttons.every((button) => !button.pressed);
      return;
    }
    for (const command of previous) {
      if (!held.has(command)) {
        repeats.delete(command);
      }
    }
    const actions = buttonCommands.map(([, command]) => command);
    const freshAction = actions.find((command) => held.has(command) && !previous.has(command));
    previous = new Set(held);
    if (freshAction) {
      for (const command of held) {
        repeats.set(command, now + 300);
      }
      onCommand(freshAction, layout);
      return;
    }
    for (const command of held) {
      if (actions.includes(command as (typeof actions)[number])) {
        continue;
      }
      const next = repeats.get(command);
      if (next === undefined || now >= next) {
        repeats.set(command, now + (next === undefined ? 300 : 100));
        onCommand(command, layout);
        break;
      }
    }
  }

  return { poll, reset };
}
