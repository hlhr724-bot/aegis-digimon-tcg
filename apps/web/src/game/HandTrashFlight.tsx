import type { CSSProperties } from "react";
import { CardMini } from "@/design/cards";
import type { DrawFlight } from "@/game/match/types";
import "@/game/style/handTrash.css";

export function HandTrashFlight({ flight }: { flight: DrawFlight }) {
  return (
    <div
      className="game-hand-trash-flight"
      data-hand-trash={flight.key}
      data-card-id={flight.card?.cardId}
      aria-hidden="true"
      style={
        {
          left: flight.x,
          top: flight.y,
          "--hand-trash-dx": `${flight.dx}px`,
          "--hand-trash-dy": `${flight.dy}px`,
          "--t-hand-trash": `${flight.duration}ms`,
        } as CSSProperties
      }
    >
      <CardMini cardId={flight.card?.cardId} artId={flight.card?.artId} width={60} zoomOnHover={false} />
    </div>
  );
}
