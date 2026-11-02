import { NoticeSize } from "@/game/noticeSize/NoticeSize";

export function isNoticeSize(value: unknown): value is NoticeSize {
  return typeof value === "string" && Object.values(NoticeSize).some((entry) => entry.value === value);
}
