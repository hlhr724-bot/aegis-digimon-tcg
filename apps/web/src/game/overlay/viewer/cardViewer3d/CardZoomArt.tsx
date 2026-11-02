import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { ClientErrorBoundary } from "@/clientErrors/ClientErrorBoundary";
import { CardFull } from "@/design/cards";
import { motionPreference } from "@/design/motion/motionPreference";
import { DEFAULT_CARD_SLEEVE, useCardSleeve } from "@/design/sleeve";
import { useCardImageUrls } from "@/design/tokenArt/useCardImageUrls";
import { createCardGrip } from "@/design/webglCard/createCardGrip";
import { dragCardGrip } from "@/design/webglCard/dragCardGrip";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import { getCardDetailFinish } from "@/game/overlay/viewer/cardFoil/getCardDetailFinish";
import type { CardViewerPointer } from "@/game/overlay/viewer/cardViewer3d/CardViewerPointer";
import { useCardViewer3dEnabled } from "@/game/overlay/viewer/cardViewer3d/useCardViewer3dEnabled";
import { createLazyComponent } from "@/net/createLazyComponent";
import "@/game/overlay/viewer/cardViewer3d/cardViewer3d.css";

type Props = {
  cardId: string;
  artId?: string;
  width: number;
};

type FailureProps = {
  onFail: () => void;
};

const CARD_ASPECT = 1.4;
const HOVER_REACH = 1.4;

const CardViewer3d = createLazyComponent({
  load: () => import("@/game/overlay/viewer/cardViewer3d/CardViewer3d"),
  pick: (module) => module.CardViewer3d,
});

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function ReportFailure({ onFail }: FailureProps) {
  useEffect(onFail, [onFail]);
  return null;
}

function CardZoomArtStage({ cardId, artId, width }: Props) {
  const enabled = useCardViewer3dEnabled();
  const reducedMotion = motionPreference.useReduced();
  const frontUrls = useCardImageUrls({ cardId, artId });
  const backUrl = useCardSleeve().src ?? DEFAULT_CARD_SLEEVE.src;
  const definition = getCardDefinition(cardId);
  const finish = getCardDetailFinish({ cardId, artId });
  const grip = useMemo(createCardGrip, []);
  const pointer = useRef<CardViewerPointer>({ x: 0, y: 0, active: false });
  const frame = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const markFailed = useCallback(() => setFailed(true), []);
  const viewerAllowed = enabled && !failed && Boolean(definition) && isWebGlAvailable();
  const showing3d = viewerAllowed && ready;

  useEffect(() => {
    if (!showing3d) {
      return;
    }
    function track(event: globalThis.PointerEvent) {
      const rect = frame.current?.getBoundingClientRect();
      if (!rect || event.pointerType === "touch") {
        return;
      }
      const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = -(event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      pointer.current.x = clampUnit(x);
      pointer.current.y = clampUnit(y);
      pointer.current.active = Math.abs(x) <= HOVER_REACH && Math.abs(y) <= HOVER_REACH;
    }
    function forget() {
      pointer.current.active = false;
    }
    window.addEventListener("pointermove", track);
    document.documentElement.addEventListener("pointerleave", forget);
    window.addEventListener("blur", forget);
    return () => {
      window.removeEventListener("pointermove", track);
      document.documentElement.removeEventListener("pointerleave", forget);
      window.removeEventListener("blur", forget);
    };
  }, [showing3d]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!showing3d || grip.pointerId !== undefined) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    Object.assign(grip, {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      travel: 0,
      dragged: false,
      yawVelocity: 0,
      pitchVelocity: 0,
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (grip.pointerId !== event.pointerId) {
      return;
    }
    dragCardGrip({ grip, x: event.clientX, y: event.clientY, time: event.timeStamp });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (grip.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    grip.pointerId = undefined;
  }

  const style = {
    width,
    height: Math.round(width * CARD_ASPECT),
    "--card-zoom-art-glow": finish.glowColor,
  } as CSSProperties;

  return (
    <div
      ref={frame}
      className="card-zoom-art"
      data-viewer={showing3d ? "3d" : "flat"}
      data-finish={finish.value}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => {
        if (grip.dragged) {
          grip.dragged = false;
          event.stopPropagation();
        }
      }}
    >
      <CardFull cardId={cardId} artId={artId} width={width} zoomOnHover={!showing3d} />
      {viewerAllowed ? (
        <div className="card-zoom-art__stage" aria-hidden="true">
          <ClientErrorBoundary fallback={<ReportFailure onFail={markFailed} />}>
            <Suspense fallback={null}>
              <CardViewer3d
                frontUrls={frontUrls}
                backUrl={backUrl}
                finish={finish}
                reducedMotion={reducedMotion}
                grip={grip}
                pointer={pointer}
                frame={frame}
                onReady={markReady}
                onFail={markFailed}
              />
            </Suspense>
          </ClientErrorBoundary>
        </div>
      ) : null}
    </div>
  );
}

export function CardZoomArt(props: Props) {
  return <CardZoomArtStage key={`${props.cardId}:${props.artId ?? ""}`} {...props} />;
}
