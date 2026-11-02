import { expect, it } from "vitest";
import { permanentClassName } from "@/game/piece/permanentClassName";

it("marks a picked target apart from the remaining candidates", () => {
  const candidate = permanentClassName({ candidate: true }).split(" ");
  const picked = permanentClassName({ candidate: true, picked: true }).split(" ");

  expect(candidate).not.toContain("game-permanent--picked");
  expect(picked).toEqual(expect.arrayContaining(["game-permanent--candidate", "game-permanent--picked"]));
});
