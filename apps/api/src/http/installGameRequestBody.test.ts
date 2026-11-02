import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";
import { installGameRequestBody } from "#api/http/installGameRequestBody";
import { handleGameRequestError } from "#api/http/handleGameRequestError";

describe("game request body limits", () => {
  it.each(["application/json", "text/plain", "application/x-www-form-urlencoded"])(
    "enforces the shared limit and useful errors for %s",
    async (contentType) => {
      const app = express();
      installGameRequestBody({ app });
      app.post(
        "/intent",
        express.text({ type: "text/plain", limit: GAME_MESSAGE_LIMITS.maxMessageBytes }),
        express.urlencoded({ extended: false, limit: GAME_MESSAGE_LIMITS.maxMessageBytes }),
        (req, res) => res.json({ length: typeof req.body === "string" ? req.body.length : req.body.text.length }),
      );
      app.use(handleGameRequestError);
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/intent`;
        let body = "x".repeat(GAME_MESSAGE_LIMITS.maxMessageBytes);
        let valueLength = GAME_MESSAGE_LIMITS.maxMessageBytes;
        if (contentType === "application/json") {
          valueLength -= 11;
          body = JSON.stringify({ text: "x".repeat(valueLength) });
        }
        if (contentType === "application/x-www-form-urlencoded") {
          valueLength -= 5;
          body = `text=${"x".repeat(valueLength)}`;
        }
        expect(Buffer.byteLength(body)).toBe(GAME_MESSAGE_LIMITS.maxMessageBytes);
        const accepted = await fetch(address, { method: "POST", headers: { "Content-Type": contentType }, body });
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toEqual({ length: valueLength });
        const rejected = await fetch(address, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: `${body} `,
        });
        expect(rejected.status).toBe(413);
        expect(await rejected.json()).toEqual({
          code: "AEGIS_MESSAGE_TOO_LARGE",
          error: "The message is too large. Try sending a smaller selection.",
          maxMessageBytes: GAME_MESSAGE_LIMITS.maxMessageBytes,
        });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
  );
});
