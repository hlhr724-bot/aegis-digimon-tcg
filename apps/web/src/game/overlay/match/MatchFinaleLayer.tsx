import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { CardFull } from "@/design/cards";
import { motionPreference } from "@/design/motion/motionPreference";
import type { MatchFinale } from "@/game/match/finale/MatchFinale";
import type { MatchFinaleTone } from "@/game/match/finale/MatchFinaleTone";
import "@/game/overlay/match/matchFinale.css";

type Props = {
  finale: MatchFinale;
  tone: MatchFinaleTone;
  board: RefObject<HTMLElement | null>;
  field: RefObject<HTMLElement | null>;
  defender: RefObject<HTMLElement | null>;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  arena3d: boolean;
};

type Point = { x: number; y: number };

type Striker = {
  x: number;
  y: number;
  width: number;
  dx: number;
  dy: number;
  suspended: boolean;
};

type StrikerParams = {
  attacker: HTMLElement;
  target: Point;
  origin: Point;
};

type OriginParams = {
  element: HTMLElement | null;
  point: Point;
};

const ORIGIN_PROPERTY = "--finale-origin";
const CARD_HALF_HEIGHT_RATIO = 0.7;

function getCenter(element: Element | null | undefined): Point | undefined {
  if (!element) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return undefined;
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function setOrigin({ element, point }: OriginParams) {
  if (!element) {
    return;
  }
  const rect = element.getBoundingClientRect();
  element.style.setProperty(ORIGIN_PROPERTY, `${point.x - rect.left}px ${point.y - rect.top}px`);
}

function measureStriker({ attacker, target, origin }: StrikerParams): Striker | undefined {
  const center = getCenter(attacker);
  if (!center) {
    return undefined;
  }
  const declaredWidth = Number.parseFloat(getComputedStyle(attacker).getPropertyValue("--permanent-width"));
  const rect = attacker.getBoundingClientRect();
  return {
    x: center.x - origin.x,
    y: center.y - origin.y,
    width: Number.isFinite(declaredWidth) && declaredWidth > 0 ? declaredWidth : rect.width,
    dx: target.x - center.x,
    dy: target.y - center.y,
    suspended: attacker.dataset.suspended === "true",
  };
}

export function MatchFinaleLayer({ finale, tone, board, field, defender, permanents, arena3d }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = motionPreference.useReduced();
  const [striker, setStriker] = useState<Striker | undefined>(undefined);
  const attackerId = finale.attacker?.permanentId;

  useLayoutEffect(() => {
    const boardElement = board.current;
    const layer = root.current;
    if (!boardElement || !layer) {
      return;
    }
    const boardRect = boardElement.getBoundingClientRect();
    const boardOrigin = { x: boardRect.left, y: boardRect.top };
    const fieldElement = field.current;
    const point = getCenter(defender.current) ??
      getCenter(fieldElement) ?? { x: boardRect.left + boardRect.width / 2, y: boardRect.top + boardRect.height / 2 };
    layer.style.setProperty("--finale-x", `${point.x - boardRect.left}px`);
    layer.style.setProperty("--finale-y", `${point.y - boardRect.top}px`);
    const scene = boardElement.querySelector<HTMLElement>(":scope > .arena-3d-scene");
    setOrigin({ element: fieldElement, point });
    setOrigin({ element: scene, point });
    boardElement.dataset.finale = tone;
    const attacker = attackerId ? permanents.current?.[attackerId] : null;
    const measured =
      !arena3d && !reducedMotion && attacker
        ? measureStriker({ attacker, target: point, origin: boardOrigin })
        : undefined;
    setStriker(measured);
    if (measured && attacker) {
      attacker.style.visibility = "hidden";
    }
    return () => {
      if (attacker) {
        attacker.style.visibility = "";
      }
      delete boardElement.dataset.finale;
      fieldElement?.style.removeProperty(ORIGIN_PROPERTY);
      scene?.style.removeProperty(ORIGIN_PROPERTY);
    };
  }, [finale, tone, board, field, defender, permanents, arena3d, reducedMotion, attackerId]);

  function releaseAttacker() {
    const attacker = attackerId ? permanents.current?.[attackerId] : null;
    if (attacker) {
      attacker.style.visibility = "";
    }
  }

  return (
    <div
      ref={root}
      className="game-finale"
      data-finale-key={finale.key}
      data-finale-tone={tone}
      data-finale-board={arena3d ? "arena3d" : "classic"}
      aria-hidden="true"
    >
      <span className="game-finale__vignette" />
      {striker && finale.attacker ? (
        <span
          className="game-finale__striker"
          data-suspended={striker.suspended || undefined}
          onAnimationEnd={releaseAttacker}
          style={
            {
              left: striker.x,
              top: striker.y,
              marginLeft: -striker.width / 2,
              marginTop: -striker.width * CARD_HALF_HEIGHT_RATIO,
              "--finale-dx": `${striker.dx}px`,
              "--finale-dy": `${striker.dy}px`,
            } as CSSProperties
          }
        >
          <CardFull
            cardId={finale.attacker.cardId}
            artId={finale.attacker.artId}
            width={striker.width}
            zoomOnHover={false}
          />
        </span>
      ) : null}
      <span className="game-finale__burst" />
      <span className="game-finale__shockwave" />
      <span className="game-finale__chroma game-finale__chroma--warm" />
      <span className="game-finale__chroma game-finale__chroma--cool" />
      <span className="game-finale__flash" />
    </div>
  );
}
