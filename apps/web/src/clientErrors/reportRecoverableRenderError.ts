import type { ErrorInfo } from "react";
import { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import { clientErrorReporter } from "@/clientErrors/clientErrorReporter";

export function reportRecoverableRenderError(error: unknown, info: ErrorInfo): void {
  clientErrorReporter.capture({
    kind: ClientErrorKind.RENDER.value,
    error,
    componentStack: info.componentStack ?? undefined,
  });
}
