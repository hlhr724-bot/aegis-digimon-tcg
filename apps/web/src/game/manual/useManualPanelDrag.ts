import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export function useManualPanelDrag({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const origin = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!enabled) return;
    if (!element) return;
    const constrain = () => {
      const bounds = element.getBoundingClientRect();
      const dx = Math.max(8 - bounds.left, Math.min(0, innerWidth - 8 - bounds.right));
      const dy = Math.max(8 - bounds.top, Math.min(0, innerHeight - 8 - bounds.bottom));
      if (dx || dy) setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
    };
    const observer = new ResizeObserver(constrain);
    observer.observe(element);
    window.addEventListener("resize", constrain);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", constrain);
    };
  }, [enabled]);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    origin.current = {
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = origin.current;
    if (!start) return;
    const dx = Math.max(8 - start.left, Math.min(event.clientX - start.x, innerWidth - 8 - start.left - start.width));
    const dy = Math.max(8 - start.top, Math.min(event.clientY - start.y, innerHeight - 8 - start.top - start.height));
    setOffset({ x: start.offsetX + dx, y: start.offsetY + dy });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      const bounds = ref.current?.getBoundingClientRect();
      if (bounds) {
        const left = bounds.left - offset.x;
        const top = bounds.top - offset.y;
        setOffset({
          x: Math.max(8 - left, Math.min(0, innerWidth - 8 - left - bounds.width)),
          y: Math.max(8 - top, Math.min(0, innerHeight - 8 - top - bounds.height)),
        });
      }
      return;
    }
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 64 : 16;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    if (event.key === "ArrowRight") dx = step;
    if (event.key === "ArrowUp") dy = -step;
    if (event.key === "ArrowDown") dy = step;
    setOffset((current) => ({
      x: current.x + Math.max(8 - bounds.left, Math.min(dx, innerWidth - 8 - bounds.right)),
      y: current.y + Math.max(8 - bounds.top, Math.min(dy, innerHeight - 8 - bounds.bottom)),
    }));
  };
  const finish = () => {
    origin.current = null;
  };
  return {
    ref,
    style: { translate: `${offset.x}px ${offset.y}px` },
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown,
    },
  };
}
