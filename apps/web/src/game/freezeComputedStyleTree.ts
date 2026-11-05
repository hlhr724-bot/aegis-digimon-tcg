const DASH = 45;

function isCustomProperty(property: string): boolean {
  return property.charCodeAt(0) === DASH && property.charCodeAt(1) === DASH;
}

function isMotionProperty(property: string): boolean {
  return property.startsWith("animation") || property.startsWith("transition");
}

function drawsPseudoContent(element: Element): boolean {
  return (
    getComputedStyle(element, "::before").content !== "none" || getComputedStyle(element, "::after").content !== "none"
  );
}

function serializeComputedStyle(element: Element, keepCustomProperties: boolean): string {
  const style = getComputedStyle(element);
  let text = "";
  for (let index = 0; index < style.length; index += 1) {
    const property = style[index]!;
    if (isMotionProperty(property) || (!keepCustomProperties && isCustomProperty(property))) {
      continue;
    }
    text += `${property}:${style.getPropertyValue(property)};`;
  }
  return `${text}animation:none;transition:none;`;
}

export function freezeComputedStyleTree(original: HTMLElement, removedAttributes: readonly string[]): HTMLElement {
  const clone = original.cloneNode(true) as HTMLElement;
  const originals = [original, ...original.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  for (let index = 0; index < originals.length; index += 1) {
    const element = originals[index]!;
    const copy = copies[index]!;
    copy.style.cssText = serializeComputedStyle(element, index === 0 || drawsPseudoContent(element));
    for (const attribute of removedAttributes) {
      copy.removeAttribute(attribute);
    }
  }
  return clone;
}
