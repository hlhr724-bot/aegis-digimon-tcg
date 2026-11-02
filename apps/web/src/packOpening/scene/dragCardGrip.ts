import type { CardGrip } from "@/packOpening/scene/createCardGrip";

type Params = {
  grip: CardGrip;
  x: number;
  y: number;
  time: number;
};

const RADIANS_PER_PIXEL = 0.011;
const TAP_TOLERANCE_PIXELS = 6;
const PITCH_LIMIT = 1.2;

export function dragCardGrip({ grip, x, y, time }: Params) {
  const deltaX = x - grip.lastX;
  const deltaY = y - grip.lastY;
  const seconds = Math.max(1, time - grip.lastTime) / 1000;
  const yawStep = deltaX * RADIANS_PER_PIXEL;
  const pitchStep = deltaY * RADIANS_PER_PIXEL;
  grip.yaw += yawStep;
  grip.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, grip.pitch + pitchStep));
  grip.yawVelocity = grip.yawVelocity * 0.5 + (yawStep / seconds) * 0.5;
  grip.pitchVelocity = grip.pitchVelocity * 0.5 + (pitchStep / seconds) * 0.5;
  grip.travel += Math.abs(deltaX) + Math.abs(deltaY);
  grip.dragged = grip.travel > TAP_TOLERANCE_PIXELS;
  grip.lastX = x;
  grip.lastY = y;
  grip.lastTime = time;
}
