import { useEffect, useState } from "react";

type Params = { visible: boolean };

export function useReplayEnding({ visible }: Params): boolean {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setFinished(false);
    if (!visible) {
      return;
    }
    const timer = setTimeout(() => setFinished(true), 2000);
    return () => clearTimeout(timer);
  }, [visible]);
  return visible && finished;
}
