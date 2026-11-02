import { describe, expect, it, vi } from "vitest";
import type { AvatarClassifier, AvatarVerdict } from "#api/accounts/avatarClassifier";
import type { AvatarImage } from "#api/accounts/avatarImage";
import { createAvatarModerator } from "#api/accounts/createAvatarModerator";

const image: AvatarImage = { bytes: Buffer.from("x"), contentType: "image/png", width: 1, height: 1 };

function answering(name: string, verdict: AvatarVerdict): AvatarClassifier {
  return { name, classify: vi.fn<AvatarClassifier["classify"]>(async () => verdict) };
}

function failing(name: string): AvatarClassifier {
  return {
    name,
    classify: vi.fn<AvatarClassifier["classify"]>(async () => {
      throw new Error(`${name}_down`);
    }),
  };
}

describe("avatar moderator", () => {
  it("uses the first classifier's verdict without consulting the fallback", async () => {
    const fallback = answering("local", "safe");
    const moderate = createAvatarModerator({
      classifiers: [answering("openai", "nsfw"), fallback],
      allowUnscreened: false,
    });
    await expect(moderate(image)).resolves.toBe("nsfw");
    expect(fallback.classify).not.toHaveBeenCalled();
  });

  it("falls back when the first classifier fails, and reports the failure", async () => {
    const report = vi.fn<(name: string, error: Error) => void>();
    const moderate = createAvatarModerator({
      classifiers: [failing("openai"), answering("local", "nsfw")],
      allowUnscreened: false,
      report,
    });
    await expect(moderate(image)).resolves.toBe("nsfw");
    expect(report).toHaveBeenCalledWith("openai", expect.objectContaining({ message: "openai_down" }));
  });

  it("is unavailable when every classifier fails", async () => {
    const report = vi.fn<(name: string, error: Error) => void>();
    const moderate = createAvatarModerator({
      classifiers: [failing("openai"), failing("local")],
      allowUnscreened: true,
      report,
    });
    await expect(moderate(image)).resolves.toBe("unavailable");
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("passes pictures unscreened only where that is allowed and nothing is configured", async () => {
    await expect(createAvatarModerator({ classifiers: [], allowUnscreened: true })(image)).resolves.toBe("unscreened");
    await expect(createAvatarModerator({ classifiers: [], allowUnscreened: false })(image)).resolves.toBe(
      "unavailable",
    );
  });
});
