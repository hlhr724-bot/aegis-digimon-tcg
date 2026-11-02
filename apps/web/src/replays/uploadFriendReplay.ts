import { accountApi, AccountApiError } from "@/account/client";
import type { SavedReplay } from "@aegis/shared/replays";

type UploadFriendReplayParams = { replayId: string; archive: Blob };

export async function uploadFriendReplay({ replayId, archive }: UploadFriendReplayParams): Promise<SavedReplay> {
  const response = await fetch(`${accountApi.base}/account/replays/${encodeURIComponent(replayId)}/friends-file`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/octet-stream" },
    body: archive,
  });
  if (!response.ok) {
    throw new AccountApiError(response.status);
  }
  return response.json() as Promise<SavedReplay>;
}
