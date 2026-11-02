import type { Arena3dDeviceSignals } from "@/game/arena3d/quality/Arena3dDeviceSignals";

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

type ProbeContext = WebGLRenderingContext | WebGL2RenderingContext;

let cachedSignals: Arena3dDeviceSignals | null | undefined;

function readRendererName(context: ProbeContext): string {
  const debug = context.getExtension("WEBGL_debug_renderer_info");
  if (!debug) {
    return String(context.getParameter(context.RENDERER) ?? "");
  }
  return String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "");
}

function matchesMedia(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

function readScreenShortSide(): number {
  const width = window.screen?.width ?? window.innerWidth;
  const height = window.screen?.height ?? window.innerHeight;
  return Math.min(width, height);
}

function createProbeContext(): ProbeContext | null {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  } catch {
    return null;
  }
}

function probeSignals(): Arena3dDeviceSignals | null {
  const context = createProbeContext();
  if (!context) {
    return null;
  }
  const browser = navigator as NavigatorWithMemory;
  const signals: Arena3dDeviceSignals = {
    maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE) ?? 0),
    rendererName: readRendererName(context),
    hardwareConcurrency: browser.hardwareConcurrency ?? 4,
    deviceMemoryGigabytes: browser.deviceMemory,
    coarsePointer: matchesMedia("(pointer: coarse)"),
    finePointerAvailable: matchesMedia("(any-pointer: fine)"),
    screenShortSide: readScreenShortSide(),
  };
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return signals;
}

export function readArena3dDeviceSignals(): Arena3dDeviceSignals | undefined {
  if (cachedSignals === undefined) {
    cachedSignals = probeSignals();
  }
  return cachedSignals ?? undefined;
}
