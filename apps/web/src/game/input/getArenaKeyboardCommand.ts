import { ArenaInputCommand } from "@/game/input/ArenaInputCommand";

const commands: Readonly<Record<string, ArenaInputCommand>> = {
  ArrowUp: ArenaInputCommand.UP.value,
  ArrowDown: ArenaInputCommand.DOWN.value,
  ArrowLeft: ArenaInputCommand.LEFT.value,
  ArrowRight: ArenaInputCommand.RIGHT.value,
  Enter: ArenaInputCommand.CONFIRM.value,
  " ": ArenaInputCommand.CONFIRM.value,
  Escape: ArenaInputCommand.CANCEL.value,
  i: ArenaInputCommand.INSPECT.value,
  t: ArenaInputCommand.TURN.value,
  q: ArenaInputCommand.PREVIOUS_REGION.value,
  e: ArenaInputCommand.NEXT_REGION.value,
  PageUp: ArenaInputCommand.SCROLL_UP.value,
  PageDown: ArenaInputCommand.SCROLL_DOWN.value,
};

export function getArenaKeyboardCommand(event: KeyboardEvent): ArenaInputCommand | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) {
    return undefined;
  }
  return Object.hasOwn(commands, event.key) ? commands[event.key] : undefined;
}
