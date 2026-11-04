import { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import { clientErrorReporter } from "@/clientErrors/clientErrorReporter";
import type { Arena3dFallbackReason } from "@/game/arena3d/fallback/Arena3dFallbackReason";

export function reportArena3dFallback(reason: Arena3dFallbackReason): void {
  clientErrorReporter.capture({
    kind: ClientErrorKind.ARENA_3D_FALLBACK.value,
    error: new Error(`Arena 3D fallback: ${reason}`),
  });
}
