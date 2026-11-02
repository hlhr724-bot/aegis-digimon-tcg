import { describe, expect, it } from "vitest";
import type { AvatarImage } from "#api/accounts/avatarImage";
import { avatarModeratorFromEnvironment } from "#api/accounts/avatarModeratorFromEnvironment";

const image: AvatarImage = { bytes: Buffer.from("x"), contentType: "image/png", width: 1, height: 1 };

describe("avatar moderator from the environment", () => {
  it("refuses unscreened pictures in production when no classifier is configured", async () => {
    await expect(avatarModeratorFromEnvironment({ NODE_ENV: "production" })(image)).resolves.toBe("unavailable");
  });

  it("lets development run without a key or a model", async () => {
    await expect(avatarModeratorFromEnvironment({ NODE_ENV: "development", OPENAI_API_KEY: " " })(image)).resolves.toBe(
      "unscreened",
    );
  });
});
