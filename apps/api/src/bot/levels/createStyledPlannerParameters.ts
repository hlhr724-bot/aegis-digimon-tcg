import type { TurnPlannerParameters } from "#api/bot/evolution/defaultTurnPlannerParameters";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";

type Params = {
  parameters: TurnPlannerParameters;
  profile: BotProfile;
};

export function createStyledPlannerParameters({ parameters, profile }: Params): TurnPlannerParameters {
  const baseline = DEFAULT_BOT_PROFILE.weights;
  return {
    ...parameters,
    weights: {
      ...parameters.weights,
      memoryGiven: (parameters.weights.memoryGiven * profile.weights.memoryHandover) / baseline.memoryHandover,
      opponentSecurity:
        (parameters.weights.opponentSecurity * profile.weights.securityAttack) / baseline.securityAttack,
      opponentBoardDp: (parameters.weights.opponentBoardDp * profile.weights.removal) / baseline.removal,
      ownBoardDp: (parameters.weights.ownBoardDp * profile.weights.playBody) / baseline.playBody,
    },
  };
}
