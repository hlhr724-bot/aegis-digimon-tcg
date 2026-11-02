import { useSyncExternalStore } from "react";
import { NoticeSize, type NoticeSizeEntry } from "@/game/noticeSize/NoticeSize";
import { getNoticeSizeEntry } from "@/game/noticeSize/getNoticeSizeEntry";
import { noticeSizePreference } from "@/game/noticeSize/noticeSizePreference";

export function useNoticeSize(): NoticeSizeEntry {
  const value = useSyncExternalStore(
    noticeSizePreference.subscribe,
    noticeSizePreference.get,
    () => NoticeSize.NORMAL.value,
  );
  return getNoticeSizeEntry(value);
}
