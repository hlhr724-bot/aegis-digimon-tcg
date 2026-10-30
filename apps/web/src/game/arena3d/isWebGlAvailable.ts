export function isWebGlAvailable(): boolean {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
