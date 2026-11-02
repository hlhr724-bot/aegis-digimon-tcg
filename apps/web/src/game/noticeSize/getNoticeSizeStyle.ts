import type { CSSProperties } from "react";
import type { NoticeSizeEntry } from "@/game/noticeSize/NoticeSize";

export function getNoticeSizeStyle(size: NoticeSizeEntry): CSSProperties {
  return { "--notice-scale": size.scale, "--notice-text-scale": size.textScale } as CSSProperties;
}
