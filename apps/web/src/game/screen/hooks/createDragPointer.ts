type Point = { x: number; y: number };

export type DragPointer = {
  get: () => Point;
  set: (x: number, y: number) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createDragPointer(): DragPointer {
  let point: Point = { x: 0, y: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => point,
    set: (x, y) => {
      if (point.x === x && point.y === y) return;
      point = { x, y };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
