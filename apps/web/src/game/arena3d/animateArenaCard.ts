type Params = {
  element: Element | null | undefined;
  keyframes: Keyframe[];
  duration: number;
  delay?: number;
  easing?: string;
};

export function animateArenaCard({ element, keyframes, duration, delay = 0, easing = "ease-out" }: Params): void {
  if (!element || typeof element.animate !== "function") {
    return;
  }
  element.animate(keyframes, { duration, delay, easing, composite: "add", fill: "none" });
}
