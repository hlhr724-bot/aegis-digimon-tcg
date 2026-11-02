import { describe, expect, it, vi } from "vitest";
import type { AvatarImage } from "#api/accounts/avatarImage";
import { openAiAvatarClassifier } from "#api/accounts/openAiAvatarClassifier";

const image: AvatarImage = { bytes: Buffer.from([1, 2, 3]), contentType: "image/jpeg", width: 1, height: 1 };

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

function moderation({ sexual = false, graphic = false }: { sexual?: unknown; graphic?: unknown } = {}) {
  return { results: [{ categories: { sexual, violence: graphic, "violence/graphic": graphic } }] };
}

describe("OpenAI avatar classifier", () => {
  it("sends the picture inline as a data URL to the omni moderation model", async () => {
    const request = respond(moderation());
    await openAiAvatarClassifier({ apiKey: "test-key", timeoutMs: 1_000, request }).classify(image);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } }],
    });
  });

  it("refuses pictures OpenAI flags as sexual or graphically violent", async () => {
    const sexual = openAiAvatarClassifier({
      apiKey: "k",
      timeoutMs: 1_000,
      request: respond(moderation({ sexual: true })),
    });
    await expect(sexual.classify(image)).resolves.toBe("nsfw");
    const graphic = openAiAvatarClassifier({
      apiKey: "k",
      timeoutMs: 1_000,
      request: respond(moderation({ graphic: true })),
    });
    await expect(graphic.classify(image)).resolves.toBe("nsfw");
    const clean = openAiAvatarClassifier({ apiKey: "k", timeoutMs: 1_000, request: respond(moderation()) });
    await expect(clean.classify(image)).resolves.toBe("safe");
  });

  it("allows non-graphic violence", async () => {
    const request = respond({
      results: [{ categories: { sexual: false, violence: true, "violence/graphic": false } }],
    });
    const classifier = openAiAvatarClassifier({ apiKey: "k", timeoutMs: 1_000, request });
    await expect(classifier.classify(image)).resolves.toBe("safe");
  });

  it("throws on an error status or a malformed answer so the fallback runs", async () => {
    const limited = openAiAvatarClassifier({ apiKey: "k", timeoutMs: 1_000, request: respond({}, 429) });
    await expect(limited.classify(image)).rejects.toThrow("openai_moderation_http_429");
    const malformed = openAiAvatarClassifier({
      apiKey: "k",
      timeoutMs: 1_000,
      request: respond({ results: [{ categories: { sexual: false } }] }),
    });
    await expect(malformed.classify(image)).rejects.toThrow("openai_moderation_malformed");
  });
});
