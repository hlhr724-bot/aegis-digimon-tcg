import { useEffect, useState } from "react";

type Params = { element: HTMLElement };

type Box = { top: number; left: number; width: number; height: number };

function measure(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function isSameBox(left: Box, right: Box): boolean {
  return (
    left.top === right.top && left.left === right.left && left.width === right.width && left.height === right.height
  );
}

export function TutorialSpotlight({ element }: Params) {
  const [box, setBox] = useState(() => measure(element));
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const next = measure(element);
      setBox((current) => (isSameBox(current, next) ? current : next));
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [element]);
  if (box.width === 0 || box.height === 0) {
    return null;
  }
  return (
    <div
      className="tutorial-spotlight"
      aria-hidden="true"
      style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
    >
      <span className="tutorial-spotlight__badge">1</span>
    </div>
  );
}
