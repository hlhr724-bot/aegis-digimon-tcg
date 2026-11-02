const ALIGNED_TOLERANCE_PIXELS = 8;

export function scrollToNextEntry(list: HTMLElement, entrySelector: string): void {
  const visibleTop = list.getBoundingClientRect().top;
  const next = [...list.querySelectorAll<HTMLElement>(entrySelector)].find(
    (entry) => entry.getBoundingClientRect().top > visibleTop + ALIGNED_TOLERANCE_PIXELS,
  );
  const top = next ? list.scrollTop + next.getBoundingClientRect().top - visibleTop : list.scrollHeight;
  list.scrollTo({ top, behavior: "smooth" });
}
