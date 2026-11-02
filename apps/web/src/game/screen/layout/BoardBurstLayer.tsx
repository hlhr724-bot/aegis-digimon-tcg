import { HandTrashFlight } from "@/game/HandTrashFlight";
/* The free-floating cues the board plays over itself: a deleted card breaking apart
   where it stood, the small burst a drawn card lands with, and the cards flying
   from a deck to a hand. All three are positioned in board coordinates, which is why
   they live here rather than on the piece that caused them. */

import type { CSSProperties } from "react";
import { CardFull } from "../../../design/cards";
import { CardBurst } from "../../CardBurst";
import { FieldCardShatter } from "../../FieldCardShatter";
import { StackStripPeel } from "../../StackStripPeel";
import { DeckReturnFlight } from "../../DeckReturnFlight";
import { HandReturnFlight } from "../../HandReturnFlight";
import { DrawPresentation } from "../../DrawPresentationView";
import type { DeleteBurst, DrawBurst, DrawFlight } from "../../match/types";

/** Matches `--draw-flight-w` on `.game-draw-flight--face`; the stylesheet has the final say. */
const DRAW_FLIGHT_FACE_WIDTH = 60;

export function BoardBurstLayer({
  deleteBursts,
  drawBursts,
  drawFlights,
}: {
  deleteBursts: readonly DeleteBurst[];
  drawBursts: readonly DrawBurst[];
  drawFlights: readonly DrawFlight[];
}) {
  return (
    <>
      {deleteBursts.map((burst) =>
        burst.stackStrip && burst.cardId ? (
          <span
            key={burst.key}
            aria-hidden="true"
            className="game-stack-strip-peel"
            data-stack-strip={burst.key}
            data-permanent-id={burst.permanentId}
            data-card-id={burst.cardId}
            style={
              {
                left: burst.x,
                top: burst.y,
                width: burst.face?.width,
                height: burst.face?.height,
                "--stack-strip-direction": burst.stackStripDirection ?? 1,
              } as CSSProperties
            }
          >
            <StackStripPeel color={burst.color ?? "Neutral"} />
          </span>
        ) : (
          <span
            key={burst.key}
            aria-hidden="true"
            className="game-delete-burst"
            data-field-shatter={burst.key}
            style={{
              left: burst.x,
              top: burst.y,
              width: burst.face?.width,
              height: burst.face?.height,
              rotate: `${burst.face?.angle ?? 0}deg`,
            }}
          >
            {/* The card's own art breaking apart where it stood, when the board still
              remembers which card that was; a plain burst otherwise. */}
            {burst.cardId ? (
              <FieldCardShatter
                cardId={burst.cardId}
                artId={burst.artId}
                color={burst.color ?? "Neutral"}
                face={burst.face ?? { x: burst.x, y: burst.y, width: 72, height: 101, angle: 0 }}
              />
            ) : (
              <CardBurst variant="delete" />
            )}
          </span>
        ),
      )}

      {drawBursts.map((burst) => (
        <span key={burst.key} aria-hidden="true" className="game-draw-burst" style={{ left: burst.x, top: burst.y }}>
          <CardBurst variant="draw" />
        </span>
      ))}

      {drawFlights.map((flight) =>
        flight.handTrash ? (
          <HandTrashFlight key={flight.key} flight={flight} />
        ) : flight.handReturn ? (
          <HandReturnFlight key={flight.key} flight={flight} />
        ) : flight.deckReturn ? (
          <DeckReturnFlight key={flight.key} flight={flight} />
        ) : flight.presentation ? (
          <DrawPresentation key={flight.key} flight={flight} />
        ) : (
          <div
            key={flight.key}
            aria-hidden="true"
            className={`game-draw-flight${flight.card ? " game-draw-flight--face" : ""}`}
            style={
              {
                left: flight.x,
                top: flight.y,
                // The cue queue waits on this same number, so the card back is
                // never unmounted part-way across the board.
                "--t-draw-flight": `${flight.duration}ms`,
                "--battle-flight-dx": `${flight.dx}px`,
                "--battle-flight-dy": `${flight.dy}px`,
              } as CSSProperties
            }
          >
            {flight.card ? (
              <CardFull
                cardId={flight.card.cardId}
                artId={flight.card.artId}
                width={DRAW_FLIGHT_FACE_WIDTH}
                zoomOnHover={false}
              />
            ) : null}
          </div>
        ),
      )}
    </>
  );
}
