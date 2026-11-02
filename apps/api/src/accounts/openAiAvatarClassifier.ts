import type { AvatarClassifier } from "#api/accounts/avatarClassifier";

const MODERATION_URL = "https://api.openai.com/v1/moderations";
const MODERATION_MODEL = "omni-moderation-latest";

const REFUSED_CATEGORIES = ["sexual", "violence/graphic"] as const;

type ModerationResponse = { results?: { categories?: Record<string, unknown> }[] };

export function openAiAvatarClassifier({
  apiKey,
  timeoutMs,
  request = fetch,
}: {
  apiKey: string;
  timeoutMs: number;
  request?: typeof fetch;
}): AvatarClassifier {
  return {
    name: "openai",
    async classify(image) {
      const response = await request(MODERATION_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODERATION_MODEL,
          input: [
            {
              type: "image_url",
              image_url: { url: `data:${image.contentType};base64,${image.bytes.toString("base64")}` },
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`openai_moderation_http_${response.status}`);
      const categories = ((await response.json()) as ModerationResponse).results?.[0]?.categories;
      const flags = REFUSED_CATEGORIES.map((category) => categories?.[category]);
      if (!flags.every((flag) => typeof flag === "boolean")) throw new Error("openai_moderation_malformed");
      return flags.includes(true) ? "nsfw" : "safe";
    },
  };
}
