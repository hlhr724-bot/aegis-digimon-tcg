export function isArenaNativeInputTarget(element: EventTarget | null): boolean {
  return element instanceof HTMLElement && element.closest("[data-arena-native-input]") !== null;
}
