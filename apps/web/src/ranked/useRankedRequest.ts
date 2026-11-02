import { useEffect, useState } from "react";
import { request } from "@/account/client";

export function useRankedRequest<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ path: string | null; data?: T; error: boolean }>({ path, error: false });
  useEffect(() => {
    let active = true;
    async function load() {
      if (!path) {
        return;
      }
      try {
        const data = await request<T>(path);
        if (active) {
          setState({ path, data, error: false });
        }
      } catch {
        if (active) {
          setState({ path, error: true });
        }
      }
    }
    void load();
    const timer = path ? setInterval(() => void load(), 30_000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, version]);
  const current = state.path === path ? state : { error: false, data: undefined };
  return { ...current, refresh: () => setVersion((value) => value + 1) };
}
