import { InputSurfaceEvent } from "@/design/InputSurfaceEvent";
import { useEffect, useRef, type RefObject } from "react";

type Params = {
  ref: RefObject<HTMLElement | null>;
  onCancel: (() => void) | undefined;
};

export function useArenaInputCancel({ ref, onCancel }: Params) {
  const callback = useRef(onCancel);
  callback.current = onCancel;
  const enabled = !!onCancel;
  useEffect(() => {
    const element = ref.current;
    function cancel(event: Event) {
      if (callback.current) {
        event.preventDefault();
        event.stopPropagation();
        callback.current();
      }
    }
    element?.toggleAttribute("data-arena-cancelable", enabled);
    element?.addEventListener(InputSurfaceEvent.CANCEL.value, cancel);
    return () => {
      element?.removeEventListener(InputSurfaceEvent.CANCEL.value, cancel);
      element?.removeAttribute("data-arena-cancelable");
    };
  });
}
