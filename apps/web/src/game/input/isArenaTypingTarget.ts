export function isArenaTypingTarget(element: EventTarget | null) {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      !!element.closest(
        'textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="range"])',
      ))
  );
}
