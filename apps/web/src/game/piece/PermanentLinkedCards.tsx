import type { CardInstance } from "@aegis/shared";
import { CardMini } from "../../design/cards";
import { linkCardSlots } from "../boardModel";

/**
 * A permanent's link cards, each plugged in sideways from the right so a later
 * link stays visible under the earlier ones (rules 4-8-3). It reads as visually
 * distinct from the (unrotated, upper-left) digivolution stack, and is purely
 * decorative: pointer events pass through to the host so selection/attack
 * targeting on the permanent is unaffected.
 */
export function PermanentLinkedCards({
  linked,
  width,
  useSelectedSleeve,
}: {
  linked: readonly CardInstance[];
  width: number;
  useSelectedSleeve: boolean;
}) {
  return (
    <>
      {linked.map((ci, i) => {
        const slot = linkCardSlots(linked.length, width)[i]!;
        return (
          <div
            key={ci.instanceId}
            style={{
              position: "absolute",
              left: slot.left,
              top: slot.top,
              width: slot.width,
              height: slot.height,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {/* Counter-clockwise: maps the card's bottom name/DP band onto the edge
                that ends up exposed, so the readable strip is what actually peeks
                out (see linkCardSlots' doc comment for the rotation-direction math). */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transformOrigin: "top left",
                transform: "rotate(-90deg) translateX(-100%)",
              }}
            >
              <CardMini
                cardId={ci.cardId}
                artId={ci.artId}
                width={slot.height}
                faceDown={ci.faceUp === false}
                useSelectedSleeve={useSelectedSleeve}
                info
                zoomOnHover={false}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
