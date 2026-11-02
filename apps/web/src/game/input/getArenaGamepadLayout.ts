import { ArenaGamepadLayout } from "@/game/input/ArenaGamepadLayout";

const xbox = /045e|xbox|xinput/i;
const playstation = /054c|playstation|dualsense|dualshock|wireless controller/i;
const nintendo = /057e|nintendo|pro controller|joy-con/i;

export function getArenaGamepadLayout(id: string) {
  if (xbox.test(id)) {
    return ArenaGamepadLayout.XBOX;
  }
  if (playstation.test(id)) {
    return ArenaGamepadLayout.PLAYSTATION;
  }
  if (nintendo.test(id)) {
    return ArenaGamepadLayout.NINTENDO;
  }
  return ArenaGamepadLayout.XBOX;
}
