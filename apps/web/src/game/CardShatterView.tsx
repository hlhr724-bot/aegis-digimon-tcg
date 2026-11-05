import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { CardFull } from "../design/cards";
import { CardBurst } from "./CardBurst";
import { CARD_FRACTURE } from "./cardShatter";
import type { ColorName } from "../design/theme";
import type { ParticleLightOwner } from "./independentParticleLight";
import { scheduleIdleTask } from "./scheduleIdleTask";

const SHARDS_PER_TASK = 10;
const SHARD_TASK_TIMEOUT_MS = 120;

function mirrorFirstShard(shatter: HTMLElement): () => void {
  const [source, ...targets] = shatter.querySelectorAll<HTMLElement>(":scope > .game-card-shatter__shard");
  if (!source) return () => undefined;
  let cancelPending = () => undefined as void;
  const copy = (from: number) => {
    const card = source.firstElementChild;
    const until = Math.min(targets.length, from + SHARDS_PER_TASK);
    for (let index = from; index < until; index += 1) {
      targets[index]!.replaceChildren(...(card ? [card.cloneNode(true)] : []));
    }
    cancelPending =
      until < targets.length ? scheduleIdleTask(() => copy(until), SHARD_TASK_TIMEOUT_MS) : () => undefined;
  };
  const restart = () => {
    cancelPending();
    copy(0);
  };
  restart();
  const observer = new MutationObserver(restart);
  observer.observe(source, { subtree: true, childList: true, attributes: true, characterData: true });
  return () => {
    observer.disconnect();
    cancelPending();
  };
}

export function CardShatter({
  cardId,
  artId,
  width,
  color,
  lightOwner,
}: {
  cardId: string;
  artId?: string;
  width: number;
  color: ColorName;
  lightOwner?: ParticleLightOwner;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => (ref.current ? mirrorFirstShard(ref.current) : undefined), [cardId, artId, width]);
  return (
    <span ref={ref} className="game-card-shatter" aria-hidden="true">
      {CARD_FRACTURE.map((shard, index) => (
        <span
          key={index}
          className="game-card-shatter__shard"
          style={
            {
              clipPath: shard.clipPath,
              "--shard-x": `${shard.driftX}%`,
              "--shard-y": `${shard.driftY}%`,
            } as CSSProperties
          }
        >
          {index === 0 ? <CardFull cardId={cardId} artId={artId} width={width} zoomOnHover={false} /> : null}
        </span>
      ))}
      <CardBurst variant="evolve" color={color} className="game-card-shatter__burst" lightOwner={lightOwner} />
    </span>
  );
}
