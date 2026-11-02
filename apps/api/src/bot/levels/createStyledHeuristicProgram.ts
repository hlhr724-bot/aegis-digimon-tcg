import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";

type Params = {
  program: HeuristicProgram;
  profile: BotProfile;
};

export function createStyledHeuristicProgram({ program, profile }: Params): HeuristicProgram {
  const baseline = DEFAULT_BOT_PROFILE.weights;
  const weights = profile.weights;
  const ratios: Readonly<Record<string, number>> = {
    attackPlayer: weights.securityAttack / baseline.securityAttack,
    attackWinningBattle: weights.removal / baseline.removal,
    attackLosingBattle: weights.loss / baseline.loss,
    handover: weights.memoryHandover / baseline.memoryHandover,
    playBody: weights.playBody / baseline.playBody,
    playTamer: weights.tamer / baseline.tamer,
    playOption: weights.option / baseline.option,
    dpGain: weights.dpGain / baseline.dpGain,
    levelGain: weights.levelGain / baseline.levelGain,
  };
  return {
    ...program,
    rules: program.rules.map((rule) => ({ ...rule, weight: rule.weight * (ratios[rule.feature] ?? 1) })),
  };
}
