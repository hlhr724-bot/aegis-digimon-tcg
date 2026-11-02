import { RematchMode } from "#shared/protocol/RematchMode";

type Params = {
  afterSeries: boolean;
};

export function getOfferedRematchModes({ afterSeries }: Params): RematchMode[] {
  return Object.values(RematchMode)
    .filter((entry) => !afterSeries || entry.offeredAfterSeries)
    .map((entry) => entry.value);
}
