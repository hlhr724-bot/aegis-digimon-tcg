import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardRulings } from "@aegis/shared/cards/CardRulings";
import { installCardRulingRoutes } from "#api/rulings/installCardRulingRoutes";

let url: string;
let close: () => Promise<void>;

beforeEach(async () => {
  const app = express();
  installCardRulingRoutes({ app });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => close());

describe("GET /cards/:cardId/rulings", () => {
  it("returns the official questions and answers for a card, cacheable by anyone", async () => {
    const response = await fetch(`${url}/cards/BT20-016/rulings`);
    const rulings = (await response.json()) as CardRulings;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(rulings.cardId).toBe("BT20-016");
    expect(rulings.questions.find((entry) => entry.qno === "Q4298")).toMatchObject({
      answer: expect.stringContaining("A new attack declaration can't be made during an attack."),
      related: ["BT16-077"],
    });
  });

  it("returns the errata with the printed and corrected text", async () => {
    const rulings = (await (await fetch(`${url}/cards/EX4-072/rulings`)).json()) as CardRulings;
    expect(rulings.errata?.changes[0]).toMatchObject({
      before: expect.stringContaining("[Main] Choose 1 of your level 6 Digimon."),
      after: expect.stringContaining("[Gallantmon]"),
    });
  });

  it("returns empty rulings for a card without any", async () => {
    const rulings = (await (await fetch(`${url}/cards/ZZ99-999/rulings`)).json()) as CardRulings;
    expect(rulings).toEqual({ cardId: "ZZ99-999", errata: null, questions: [] });
  });

  it("rejects an identifier that is not a card number", async () => {
    const response = await fetch(`${url}/cards/constructor/rulings`);
    expect(response.status).toBe(400);
  });
});
