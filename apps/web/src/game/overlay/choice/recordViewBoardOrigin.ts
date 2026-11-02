import { viewBoardOrigin } from "@/game/overlay/choice/viewBoardOrigin";

type Params = { element: Element };

export function recordViewBoardOrigin({ element }: Params) {
  const rect = element.getBoundingClientRect();
  viewBoardOrigin.current = { y: rect.top + rect.height / 2 };
}
