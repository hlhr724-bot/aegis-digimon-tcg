import { RematchMode } from "#shared/protocol/RematchMode";

type Params = {
  mode: unknown;
};

export function getRematchMode({ mode }: Params): RematchMode {
  return Object.values(RematchMode).find((entry) => entry.value === mode)?.value ?? RematchMode.NEW_SERIES.value;
}
