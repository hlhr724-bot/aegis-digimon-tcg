import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

/** Keep Tab cycling inside the dialog panel instead of escaping to the page behind it. */
export function trapDialogFocus({
  event,
  panelRef,
}: {
  event: ReactKeyboardEvent<HTMLDivElement>;
  panelRef: RefObject<HTMLDivElement | null>;
}): void {
  if (event.key !== "Tab") return;
  const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
    'button:not(:disabled):not([tabindex="-1"]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  );
  if (!focusable?.length) {
    event.preventDefault();
    panelRef.current?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first || !Array.from(focusable).includes(document.activeElement as HTMLElement))
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
