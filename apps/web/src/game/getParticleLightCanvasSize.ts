interface Params {
  width: number;
  height: number;
  pixelRatio: number;
}

export function getParticleLightCanvasSize({ width, height, pixelRatio }: Params) {
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const scale = Math.min(density, 2, 256 / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
