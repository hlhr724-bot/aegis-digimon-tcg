import type { Arena3dDeviceSignals } from "@/game/arena3d/quality/Arena3dDeviceSignals";
import { Arena3dQuality } from "@/game/arena3d/quality/Arena3dQuality";
import { getArena3dDeviceClass } from "@/game/arena3d/quality/getArena3dDeviceClass";

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;
const INTEGRATED_RENDERER = /intel|mali|adreno|powervr|apple gpu|videocore/i;
const APPLE_RENDERER = /apple/i;
const ENTRY_MOBILE_RENDERER = /powervr|videocore|mali-(4|t|g[0-5]\d\b)|adreno \(tm\) [2-5]\d\d\b/i;
const MOBILE_MEDIUM_MIN_MEMORY_GIGABYTES = 6;
const MOBILE_MEDIUM_MIN_CORES = 6;

function probeTouchQuality(signals: Arena3dDeviceSignals): Arena3dQuality {
  if (ENTRY_MOBILE_RENDERER.test(signals.rendererName)) {
    return Arena3dQuality.LOW.value;
  }
  if (APPLE_RENDERER.test(signals.rendererName)) {
    return Arena3dQuality.MEDIUM.value;
  }
  const memory = signals.deviceMemoryGigabytes;
  const lowMemory = memory !== undefined && memory < MOBILE_MEDIUM_MIN_MEMORY_GIGABYTES;
  if (lowMemory || signals.hardwareConcurrency < MOBILE_MEDIUM_MIN_CORES) {
    return Arena3dQuality.LOW.value;
  }
  return Arena3dQuality.MEDIUM.value;
}

function probeDesktopQuality(signals: Arena3dDeviceSignals): Arena3dQuality {
  const lowMemory = signals.deviceMemoryGigabytes !== undefined && signals.deviceMemoryGigabytes <= 4;
  if (lowMemory || signals.hardwareConcurrency <= 4) {
    return Arena3dQuality.LOW.value;
  }
  if (signals.coarsePointer || INTEGRATED_RENDERER.test(signals.rendererName)) {
    return Arena3dQuality.MEDIUM.value;
  }
  return Arena3dQuality.HIGH.value;
}

export function probeArena3dQuality(signals: Arena3dDeviceSignals): Arena3dQuality {
  if (SOFTWARE_RENDERER.test(signals.rendererName) || signals.maxTextureSize < 4096) {
    return Arena3dQuality.LOW.value;
  }
  if (getArena3dDeviceClass(signals).touchFirst) {
    return probeTouchQuality(signals);
  }
  return probeDesktopQuality(signals);
}
