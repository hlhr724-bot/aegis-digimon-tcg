import { RematchMode } from "#shared/protocol/RematchMode";
import { getRematchMode } from "#shared/protocol/getRematchMode";

type Params = {
  mode: unknown;
};

export function getRematchModeEntry({ mode }: Params): (typeof RematchMode)[keyof typeof RematchMode] {
  const value = getRematchMode({ mode });
  return Object.values(RematchMode).find((entry) => entry.value === value) ?? RematchMode.NEW_SERIES;
}
