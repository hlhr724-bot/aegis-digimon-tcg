import type { RankedConfig } from "@aegis/shared/ranked/RankedContracts";
import { useEffect, useState } from "react";
import { request } from "@/account/client";

const UNAVAILABLE: RankedConfig = { enabled: false, formats: [] };

export function useRankedConfig(): RankedConfig | undefined {
  const [config, setConfig] = useState<RankedConfig>();
  useEffect(() => {
    let active = true;
    void request<RankedConfig>("/ranked/config")
      .then((loaded) => {
        if (active) setConfig(loaded);
      })
      .catch(() => {
        if (active) setConfig(UNAVAILABLE);
      });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
