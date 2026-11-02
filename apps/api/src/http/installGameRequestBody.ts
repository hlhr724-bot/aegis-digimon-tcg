import express, { type Express } from "express";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";

type Params = {
  app: Express;
};

export function installGameRequestBody({ app }: Params): void {
  app.use(express.json({ limit: GAME_MESSAGE_LIMITS.maxMessageBytes }));
}
