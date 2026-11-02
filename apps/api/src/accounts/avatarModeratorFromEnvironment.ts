import type { AvatarClassifier } from "#api/accounts/avatarClassifier";
import { type AvatarModerator, createAvatarModerator } from "#api/accounts/createAvatarModerator";
import { localAvatarClassifier } from "#api/accounts/localAvatarClassifier";
import { openAiAvatarClassifier } from "#api/accounts/openAiAvatarClassifier";

const DEFAULT_LOCAL_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT_MS = 8_000;
const LOCAL_IDLE_MS = 60_000;

function boundedNumber(value: string | undefined, fallback: number, accepts: (candidate: number) => boolean) {
  const candidate = Number(value);
  return value !== undefined && Number.isFinite(candidate) && accepts(candidate) ? candidate : fallback;
}

export function avatarModeratorFromEnvironment(env: NodeJS.ProcessEnv = process.env): AvatarModerator {
  const timeoutMs = boundedNumber(env.AVATAR_MODERATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, (value) => value > 0);
  const classifiers: AvatarClassifier[] = [];
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (apiKey) classifiers.push(openAiAvatarClassifier({ apiKey, timeoutMs }));
  const modelPath = env.AVATAR_NSFW_MODEL?.trim();
  if (modelPath)
    classifiers.push(
      localAvatarClassifier({
        modelPath,
        threshold: boundedNumber(env.AVATAR_NSFW_THRESHOLD, DEFAULT_LOCAL_THRESHOLD, (value) => value > 0 && value < 1),
        timeoutMs,
        idleMs: LOCAL_IDLE_MS,
      }),
    );
  return createAvatarModerator({ classifiers, allowUnscreened: env.NODE_ENV !== "production" });
}
