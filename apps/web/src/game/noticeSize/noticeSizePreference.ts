import { NoticeSize } from "@/game/noticeSize/NoticeSize";
import { isNoticeSize } from "@/game/noticeSize/isNoticeSize";

const storageKey = "aegis.notice.size";

const listeners = new Set<() => void>();

function read(): NoticeSize {
  try {
    const stored = localStorage.getItem(storageKey);
    return isNoticeSize(stored) ? stored : NoticeSize.NORMAL.value;
  } catch {
    return NoticeSize.NORMAL.value;
  }
}

let current = read();

function persist(next: NoticeSize) {
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    return;
  }
}

export const noticeSizePreference = {
  get(): NoticeSize {
    return current;
  },
  set(next: NoticeSize) {
    current = next;
    persist(next);
    for (const listener of listeners) {
      listener();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
