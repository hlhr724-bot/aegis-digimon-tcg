import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";
import type { CardGrip } from "@/packOpening/scene/createCardGrip";
import { resetCardGrip } from "@/packOpening/scene/resetCardGrip";

type Props = {
  grip: CardGrip;
  inspectedIndex: number | undefined;
  inspectDepth: number;
  inspectScale: number;
};

type Point = {
  x: number;
  y: number;
};

type Pinch = {
  distance: number;
  zoom: number;
  center: Point;
  panX: number;
  panY: number;
};

const ZOOM_PER_WHEEL_PIXEL = 0.0015;
const MINIMUM_ZOOM = 0.75;
const MAXIMUM_ZOOM = 3;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function measurePinch(points: Point[]): { distance: number; center: Point } {
  const [first, second] = points as [Point, Point];
  return {
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
  };
}

export function CardGripControls({ grip, inspectedIndex, inspectDepth, inspectScale }: Props) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);
  const inspecting = inspectedIndex !== undefined;

  useEffect(() => resetCardGrip(grip), [grip, inspectedIndex]);

  useEffect(() => {
    if (!inspecting) {
      return;
    }
    const pointers = new Map<number, Point>();
    let pinch: Pinch | undefined;

    function setZoom(zoom: number) {
      grip.zoom = Math.max(MINIMUM_ZOOM, Math.min(MAXIMUM_ZOOM, zoom));
      const reach = Math.max(0, grip.zoom - 1) * inspectScale * 0.5;
      grip.panX = clamp(grip.panX, reach * CARD_DIMENSIONS.width);
      grip.panY = clamp(grip.panY, reach * CARD_DIMENSIONS.height);
    }

    function getWorldUnitsPerPixel(): number {
      const fieldOfView = camera instanceof PerspectiveCamera ? camera.fov : 40;
      const visibleHeight = 2 * Math.tan((fieldOfView / 2) * (Math.PI / 180)) * (camera.position.z - inspectDepth);
      return visibleHeight / Math.max(1, canvas.clientHeight);
    }

    function startPinch() {
      const { distance, center } = measurePinch([...pointers.values()]);
      pinch = { distance, center, zoom: grip.zoom, panX: grip.panX, panY: grip.panY };
      Object.assign(grip, {
        pinching: true,
        pointerId: undefined,
        dragged: true,
        yawVelocity: 0,
        pitchVelocity: 0,
      });
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      setZoom(grip.zoom - event.deltaY * ZOOM_PER_WHEEL_PIXEL);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType !== "touch") {
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        startPinch();
      }
    }

    function handlePointerMove(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) {
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || pointers.size !== 2) {
        return;
      }
      const { distance, center } = measurePinch([...pointers.values()]);
      const unitsPerPixel = getWorldUnitsPerPixel();
      grip.panX = pinch.panX + (center.x - pinch.center.x) * unitsPerPixel;
      grip.panY = pinch.panY - (center.y - pinch.center.y) * unitsPerPixel;
      setZoom((pinch.zoom * distance) / pinch.distance);
    }

    function handlePointerUp(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) {
        pinch = undefined;
      }
      if (pointers.size === 0) {
        grip.pinching = false;
      }
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      grip.pinching = false;
    };
  }, [canvas, camera, grip, inspecting, inspectDepth, inspectScale]);

  return null;
}
