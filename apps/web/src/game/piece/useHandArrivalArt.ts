import { useLayoutEffect, useState } from "react";

/** Start a new face's short entry after decoded art (or the text fallback) exists. */
export function useHandArrivalArt(
  row: HTMLElement | null,
  entering: ReadonlySet<string>,
  cardSelector = "[data-hand-instance-id]",
) {
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set());
  const signature = JSON.stringify([...entering]);
  useLayoutEffect(() => {
    if (!row) return;
    const ids = new Set<string>(JSON.parse(signature));
    let active = true;
    const decoding = new WeakMap<HTMLImageElement, string>();
    function markReady(id: string) {
      if (!active) return;
      setReady((current) => (current.has(id) ? current : new Set([...current, id])));
    }
    function inspect() {
      for (const card of row!.querySelectorAll<HTMLElement>(cardSelector)) {
        const id = card.dataset.handInstanceId ?? card.dataset.handHoverInstanceId!;
        if (!ids.has(id)) continue;
        const image = card.querySelector("img");
        if (!image) {
          markReady(id);
          continue;
        }
        if (typeof image.decode !== "function") {
          if (image.complete && image.naturalWidth > 0) markReady(id);
          continue;
        }
        const source = image.src;
        if (decoding.get(image) === source) continue;
        decoding.set(image, source);
        // complete alone also means an error. Failed URLs can switch to another
        // image or the CardFull text fallback, which the observer checks again.
        void image.decode().then(
          () => {
            if (
              active &&
              card.isConnected &&
              card.querySelector("img") === image &&
              image.src === source &&
              image.naturalWidth > 0
            )
              markReady(id);
          },
          () => {
            if (decoding.get(image) === source) decoding.delete(image);
            if (
              active &&
              card.isConnected &&
              card.querySelector("img") === image &&
              image.src === source &&
              image.complete &&
              image.naturalWidth > 0
            ) {
              markReady(id);
            }
          },
        );
      }
    }
    setReady((current) => {
      const kept = new Set([...current].filter((id) => ids.has(id)));
      return kept.size === current.size ? current : kept;
    });
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    row.addEventListener("load", inspect, true);
    return () => {
      active = false;
      observer.disconnect();
      row.removeEventListener("load", inspect, true);
    };
  }, [row, signature, cardSelector]);
  return ready;
}
