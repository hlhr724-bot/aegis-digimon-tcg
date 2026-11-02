import type { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import type { ClientErrorReport } from "@aegis/shared/clientErrors/ClientErrorReport";
import {
  MAX_CLIENT_ERROR_ID,
  MAX_CLIENT_ERROR_MESSAGE,
  MAX_CLIENT_ERROR_RELEASE,
  MAX_CLIENT_ERROR_ROUTE,
  MAX_CLIENT_ERROR_STACK,
  MAX_CLIENT_ERROR_USER_AGENT,
} from "@aegis/shared/clientErrors/clientErrorLimits";
import { buildClientErrorSignature } from "@/clientErrors/buildClientErrorSignature";
import { isForeignClientError } from "@/clientErrors/isForeignClientError";

export const MAX_CLIENT_ERROR_REPORTS_PER_SESSION = 20;

export type ClientErrorPage = {
  origin: string;
  route: string;
  userAgent: string;
};

export type ClientErrorMatchContext = {
  roomId?: string;
  matchId?: string;
};

export type ClientErrorCapture = {
  kind: ClientErrorKind;
  error: unknown;
  componentStack?: string;
};

export type ClientErrorReporter = {
  capture: (capture: ClientErrorCapture) => void;
  setMatchContext: (reader: (() => ClientErrorMatchContext) | undefined) => void;
};

type CreateClientErrorReporterParams = {
  enabled: boolean;
  release: string;
  readPage: () => ClientErrorPage;
  send: (report: ClientErrorReport) => void;
  now?: () => Date;
  maxReports?: number;
};

type ErrorDetails = {
  message: string;
  stack: string;
};

function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function readErrorDetails(error: unknown): ErrorDetails {
  if (!(error instanceof Error)) {
    return { message: describeValue(error), stack: "" };
  }
  const chain: Error[] = [];
  const visited = new Set<Error>();
  let thrownValue: ErrorDetails | undefined;
  let current = error;
  while (chain.length < 8 && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    let cause: unknown;
    try {
      cause = current.cause;
    } catch {
      break;
    }
    if (!(cause instanceof Error)) {
      if (cause !== undefined) {
        thrownValue = { message: describeValue(cause), stack: "" };
      }
      break;
    }
    current = cause;
  }
  let original = thrownValue;
  if (!original) {
    const failure = chain.pop()!;
    original = { message: `${failure.name}: ${failure.message}`, stack: failure.stack ?? "" };
  }
  const wrappers = chain.reverse().map((wrapper) => {
    const message = `${wrapper.name}: ${wrapper.message}`.slice(0, MAX_CLIENT_ERROR_MESSAGE);
    const stack = (wrapper.stack ?? "").slice(0, MAX_CLIENT_ERROR_STACK);
    return `Wrapped by: ${message}\n${stack}`;
  });
  return {
    message: original.message,
    stack: [original.stack.slice(0, MAX_CLIENT_ERROR_STACK), ...wrappers].filter(Boolean).join("\n\n"),
  };
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value.slice(0, MAX_CLIENT_ERROR_ID);
}

export function createClientErrorReporter({
  enabled,
  release,
  readPage,
  send,
  now = () => new Date(),
  maxReports = MAX_CLIENT_ERROR_REPORTS_PER_SESSION,
}: CreateClientErrorReporterParams): ClientErrorReporter {
  const reportedSignatures = new Set<string>();
  let readMatchContext: (() => ClientErrorMatchContext) | undefined;

  function readMatchIds(): ClientErrorMatchContext {
    try {
      const context = readMatchContext?.() ?? {};
      const roomId = readOptionalId(context.roomId);
      const matchId = readOptionalId(context.matchId);
      return { ...(roomId ? { roomId } : {}), ...(matchId ? { matchId } : {}) };
    } catch {
      return {};
    }
  }

  function capture({ kind, error, componentStack }: ClientErrorCapture): void {
    if (!enabled || reportedSignatures.size >= maxReports) {
      return;
    }
    try {
      const page = readPage();
      const details = readErrorDetails(error);
      if (isForeignClientError({ message: details.message, stack: details.stack, origin: page.origin })) {
        return;
      }
      const stack = componentStack ? `${details.stack}\n\nComponent stack:${componentStack}` : details.stack;
      const signature = buildClientErrorSignature({ message: details.message, stack, origin: page.origin });
      if (reportedSignatures.has(signature)) {
        return;
      }
      reportedSignatures.add(signature);
      send({
        kind,
        message: details.message.slice(0, MAX_CLIENT_ERROR_MESSAGE),
        stack: stack.slice(0, MAX_CLIENT_ERROR_STACK),
        signature,
        release: release.slice(0, MAX_CLIENT_ERROR_RELEASE),
        route: page.route.slice(0, MAX_CLIENT_ERROR_ROUTE),
        ...readMatchIds(),
        userAgent: page.userAgent.slice(0, MAX_CLIENT_ERROR_USER_AGENT),
        occurredAt: now().toISOString(),
      });
    } catch {
      return;
    }
  }

  return {
    capture,
    setMatchContext: (reader) => {
      readMatchContext = reader;
    },
  };
}
