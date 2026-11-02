import { socialRuntime } from "#api/social/socialRuntime";

export async function publishSocialChange(accountIds: readonly string[]): Promise<void> {
  await socialRuntime.service?.publishChanges(accountIds).catch(() => undefined);
}
