import { describe, expect, it } from "vitest";
import { highestAccountRole } from "@/account/roles/highestAccountRole";

describe("highestAccountRole", () => {
  it("returns nothing for an account without roles", () => {
    expect(highestAccountRole([])).toBeUndefined();
  });

  it("ranks admin above judge above organizer", () => {
    expect(highestAccountRole(["organizer", "admin", "judge"])?.value).toBe("admin");
    expect(highestAccountRole(["organizer", "judge"])?.value).toBe("judge");
    expect(highestAccountRole(["organizer"])?.value).toBe("organizer");
  });
});
