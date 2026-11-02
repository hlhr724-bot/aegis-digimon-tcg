import { Component, type ErrorInfo, type ReactNode } from "react";
import { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import { ClientErrorFallback } from "@/clientErrors/ClientErrorFallback";
import { clientErrorReporter } from "@/clientErrors/clientErrorReporter";
import { isChunkLoadError } from "@/clientErrors/isChunkLoadError";

type ClientErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ClientErrorBoundaryState = {
  failed: boolean;
  loadFailed: boolean;
};

export class ClientErrorBoundary extends Component<ClientErrorBoundaryProps, ClientErrorBoundaryState> {
  override state: ClientErrorBoundaryState = { failed: false, loadFailed: false };

  static getDerivedStateFromError(error: unknown): ClientErrorBoundaryState {
    return { failed: true, loadFailed: isChunkLoadError(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    clientErrorReporter.capture({
      kind: ClientErrorKind.RENDER.value,
      error,
      componentStack: info.componentStack ?? undefined,
    });
  }

  override render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }
    return <ClientErrorFallback loadFailed={this.state.loadFailed} />;
  }
}
