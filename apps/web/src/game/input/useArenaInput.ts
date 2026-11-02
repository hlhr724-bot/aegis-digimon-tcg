import { isArenaNativeInputTarget } from "@/game/input/isArenaNativeInputTarget";
import { ArenaInputDevice } from "@/game/input/ArenaInputDevice";
import { isArenaTypingTarget } from "@/game/input/isArenaTypingTarget";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArenaInputCommand } from "@/game/input/ArenaInputCommand";
import { createArenaInputController } from "@/game/input/createArenaInputController";
import { createArenaGamepadInput } from "@/game/input/createArenaGamepadInput";
import { getArenaKeyboardCommand } from "@/game/input/getArenaKeyboardCommand";
import type { getArenaGamepadLayout } from "@/game/input/getArenaGamepadLayout";

type Params = {
  root: RefObject<HTMLElement | null>;
  onCancel: () => void;
};

export function useArenaInput({ root, onCancel }: Params) {
  const [device, setDevice] = useState<ArenaInputDevice>();
  const [layout, setLayout] = useState<ReturnType<typeof getArenaGamepadLayout>>();
  const [hints, setHints] = useState({ inSurface: false, canCancel: false, canInspect: false, reordering: false });
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const controllerRef = useRef<ReturnType<typeof createArenaInputController>>(undefined);
  const getPrompts = useCallback(() => controllerRef.current?.getPrompts() ?? [], []);
  useEffect(() => {
    const controller = createArenaInputController({ getRoot: () => root.current, onCancel: () => cancel.current() });
    controllerRef.current = controller;
    function updateHints() {
      const next = controller.getHints();
      setHints((current) =>
        current.inSurface === next.inSurface &&
        current.canCancel === next.canCancel &&
        current.canInspect === next.canInspect &&
        current.reordering === next.reordering
          ? current
          : next,
      );
    }
    let suspended = document.hidden;
    const gamepad = createArenaGamepadInput({
      onCommand: (command, padLayout) => {
        setDevice(ArenaInputDevice.GAMEPAD.value);
        setLayout(padLayout);
        controller.handle(command);
        updateHints();
      },
    });
    function onKeyDown(event: KeyboardEvent) {
      if (
        controller.isForwarded(event) ||
        event.defaultPrevented ||
        isArenaTypingTarget(event.target) ||
        isArenaNativeInputTarget(event.target)
      ) {
        return;
      }
      suspended = document.hidden;
      const command = getArenaKeyboardCommand(event);
      if (!command || !controller.hasTargets()) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const repeatable = [
        ArenaInputCommand.UP.value,
        ArenaInputCommand.DOWN.value,
        ArenaInputCommand.LEFT.value,
        ArenaInputCommand.RIGHT.value,
        ArenaInputCommand.SCROLL_UP.value,
        ArenaInputCommand.SCROLL_DOWN.value,
      ];
      if (event.repeat && !repeatable.some((entry) => entry === command)) {
        return;
      }
      setDevice(ArenaInputDevice.KEYBOARD.value);
      controller.handle(command);
      updateHints();
    }
    function stopForwarded(event: KeyboardEvent) {
      if (controller.isForwarded(event)) {
        event.stopImmediatePropagation();
      }
    }
    function onPointerDown() {
      suspended = document.hidden;
      controller.deactivate();
      setDevice(undefined);
    }
    function onBlur() {
      suspended = true;
      gamepad.reset();
    }
    function onFocus() {
      suspended = document.hidden;
      gamepad.reset();
    }
    function onVisibilityChange() {
      if (document.hidden) {
        onBlur();
      } else {
        onFocus();
      }
    }
    function onDisconnect() {
      gamepad.reset();
    }
    let frame = 0;
    let changed = false;
    const observer = new MutationObserver(() => {
      changed = true;
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "aria-disabled", "disabled"],
    });
    function tick(now: number) {
      if (!suspended) {
        if (changed) {
          changed = false;
          controller.refresh();
          updateHints();
        }
        if (typeof navigator.getGamepads === "function") {
          gamepad.poll({ gamepads: navigator.getGamepads(), now });
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", stopForwarded);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controllerRef.current = undefined;
      controller.deactivate();
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", stopForwarded);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [root]);
  return { device, layout, getPrompts, ...hints };
}
