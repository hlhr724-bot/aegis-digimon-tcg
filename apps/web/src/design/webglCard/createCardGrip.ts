export interface CardGrip {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
  pinching: boolean;
  yawVelocity: number;
  pitchVelocity: number;
  pointerId: number | undefined;
  lastX: number;
  lastY: number;
  lastTime: number;
  travel: number;
  dragged: boolean;
}

export function createCardGrip(): CardGrip {
  return {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    pinching: false,
    yawVelocity: 0,
    pitchVelocity: 0,
    pointerId: undefined,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    travel: 0,
    dragged: false,
  };
}
