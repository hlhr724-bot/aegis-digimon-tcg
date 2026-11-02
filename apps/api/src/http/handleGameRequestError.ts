import type { NextFunction, Request, Response } from "express";
import { ConnectionErrorCode } from "@aegis/shared/protocol/ConnectionErrorCode";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";

export function handleGameRequestError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({
      code: ConnectionErrorCode.MESSAGE_TOO_LARGE.value,
      error: "The message is too large. Try sending a smaller selection.",
      maxMessageBytes: GAME_MESSAGE_LIMITS.maxMessageBytes,
    });
    return;
  }
  next(error);
}
