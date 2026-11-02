import { getCardDefinition, type CardInstance } from "@aegis/shared";
import { COLORS, colorKey } from "../../design/theme";
import { sourceFanStepLimit } from "../boardModel";

/**
 * The digivolution stack peeking out from under a permanent's top card, one
 * sliver per card underneath, cascading down and to the left (rules 4-8-1).
 * Tinted per card so a mixed-colour stack still reads at a glance.
 */
export function PermanentCardStack({ stack, width }: { stack: readonly CardInstance[]; width: number }) {
  const step = `min(var(--arena-source-step, 4px), ${sourceFanStepLimit(width, stack.length)}px)`;
  return (
    <>
      {stack.map((ci, i) => {
        const sc = COLORS[colorKey(ci.faceUp === false ? undefined : getCardDefinition(ci.cardId)?.colors[0])];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(-4px - ${i} * ${step})`,
              top: `calc(var(--arena-source-top, 6px) + ${i} * ${step})`,
              width,
              height: width * 1.4,
              borderRadius: 9,
              background: sc.soft,
              border: `1.5px solid ${sc.edge}66`,
              zIndex: 0,
            }}
          />
        );
      })}
    </>
  );
}
