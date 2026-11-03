import type { Express } from "express";
import { readCardRulings } from "#api/rulings/readCardRulings";

const CARD_ID_PATTERN = /^[A-Z0-9]{1,8}-[0-9]{1,4}$/;
const ONE_DAY_SECONDS = 86_400;

export function installCardRulingRoutes({ app }: { app: Express }): void {
  app.get("/cards/:cardId/rulings", (req, res) => {
    const cardId = req.params.cardId;
    if (!CARD_ID_PATTERN.test(cardId)) {
      res.status(400).json({ error: "invalid_card_id" });
      return;
    }
    res.set("Cache-Control", `public, max-age=${ONE_DAY_SECONDS}`).json(readCardRulings(cardId));
  });
}
