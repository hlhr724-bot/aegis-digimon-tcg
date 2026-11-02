import type { TrainingObservation } from "#api/bot/training/observation";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";

export function evaluateSearchPosition(observation: TrainingObservation, profile = DEFAULT_BOT_PROFILE): number {
  function getMaterial(player: TrainingObservation["players"][number], weights: BotProfile["weights"]): number {
    const permanents = player.breeding === undefined ? player.board : [...player.board, player.breeding];
    const baseline = DEFAULT_BOT_PROFILE.weights;
    return (
      player.securityCount * (0.65 * (weights.securityDefend / baseline.securityDefend)) +
      player.handCount * (0.08 * (weights.digivolveDraw / baseline.digivolveDraw)) +
      permanents.reduce(
        (value, permanent) =>
          value +
          0.12 * (weights.levelGain / baseline.levelGain) * (permanent.top.level ?? 0) +
          (0.1 * (weights.playBody / baseline.playBody) * Math.max(0, permanent.dp)) / 10000 +
          (permanent.canAttackPlayer ? 0.15 * (weights.securityAttack / baseline.securityAttack) : 0),
        0,
      )
    );
  }
  const own = observation.players.find((player) => player.seat === observation.seat);
  const opponent = observation.players.find((player) => player.seat !== observation.seat);
  if (own === undefined || opponent === undefined) {
    throw new Error("Search evaluation requires both seats");
  }
  const advantage =
    getMaterial(own, profile.weights) -
    getMaterial(opponent, DEFAULT_BOT_PROFILE.weights) +
    observation.memory * (observation.turnSeat === observation.seat ? 0.04 * profile.weights.memoryHandover : -0.04);
  return 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, advantage))));
}
