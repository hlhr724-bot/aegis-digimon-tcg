import { NoticeSize, type NoticeSizeEntry } from "@/game/noticeSize/NoticeSize";

export function getNoticeSizeEntry(value: NoticeSize): NoticeSizeEntry {
  return Object.values(NoticeSize).find((entry) => entry.value === value) ?? NoticeSize.NORMAL;
}
