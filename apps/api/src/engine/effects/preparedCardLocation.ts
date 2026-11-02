import type { GameState } from "@aegis/shared/schema/GameState";
import type { Permanent } from "@aegis/shared/schema/Permanent";

type CardLocation = {
  permanent: Permanent;
  inBattleArea: boolean;
  inBreedingArea: boolean;
};

type PreparedCardLocation = {
  state: GameState | undefined;
  instanceId: string | undefined;
  location: CardLocation | undefined;
};

export const preparedCardLocation: PreparedCardLocation = {
  state: undefined,
  instanceId: undefined,
  location: undefined,
};
