import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ArenaInputCommand } from "@/game/input/ArenaInputCommand";

type Prompt = { element: HTMLElement; command: ArenaInputCommand };

type PlacedPrompt = { id: number; command: ArenaInputCommand; left: number; top: number };

type Props = {
  getPrompts: () => Prompt[];
  glyphs: Partial<Record<ArenaInputCommand, string>>;
  face: boolean;
  layout: string | undefined;
};

function isSamePlacement(current: PlacedPrompt[], next: PlacedPrompt[]) {
  return (
    current.length === next.length &&
    current.every(
      (prompt, index) =>
        prompt.id === next[index]?.id &&
        prompt.command === next[index]?.command &&
        prompt.left === next[index]?.left &&
        prompt.top === next[index]?.top,
    )
  );
}

export function ArenaInputPrompts({ getPrompts, glyphs, face, layout }: Props) {
  const [placed, setPlaced] = useState<PlacedPrompt[]>([]);
  useEffect(() => {
    const ids = new WeakMap<HTMLElement, number>();
    let nextId = 0;
    let frame = 0;
    function place() {
      const stacked = new Map<HTMLElement, number>();
      const next = getPrompts()
        .filter(({ element }) => element.getClientRects().length > 0)
        .map(({ element, command }) => {
          const slot = stacked.get(element) ?? 0;
          stacked.set(element, slot + 1);
          let id = ids.get(element);
          if (id === undefined) {
            id = nextId++;
            ids.set(element, id);
          }
          const preview = element.dataset.handInstanceId
            ? document.querySelector(`[data-hand-hover-instance-id="${CSS.escape(element.dataset.handInstanceId)}"]`)
            : null;
          const rects = [element, ...Array.from(element.children), ...(preview ? [preview] : [])]
            .map((part) => part.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0);
          const right = Math.max(...rects.map((rect) => rect.right));
          const top = Math.min(...rects.map((rect) => rect.top));
          return { id, command, left: Math.round(right - 14 - slot * 24), top: Math.round(top - 8) };
        });
      setPlaced((current) => (isSamePlacement(current, next) ? current : next));
      frame = requestAnimationFrame(place);
    }
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [getPrompts]);
  return createPortal(
    <div className="arena-input-prompts" data-arena-input-layout={layout} aria-hidden="true">
      {placed.map((prompt) => (
        <kbd
          key={`${prompt.id}:${prompt.command}`}
          className="arena-input-glyph arena-input-prompt"
          data-shape={face ? "face" : undefined}
          data-button={prompt.command}
          style={{ left: prompt.left, top: prompt.top }}
        >
          {glyphs[prompt.command]}
        </kbd>
      ))}
    </div>,
    document.body,
  );
}
