import { RuntimeGraphDecoder } from "#api/engine/snapshot/RuntimeGraphDecoder";
import type { RuntimeGraphDecodeParams } from "#api/engine/snapshot/RuntimeGraphDecodeParams";

export function decodeRuntimeGraph(params: RuntimeGraphDecodeParams): unknown {
  return new RuntimeGraphDecoder(params).decodeRoot();
}
