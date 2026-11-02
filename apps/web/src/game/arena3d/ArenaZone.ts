export const ArenaZone = {
  DECK: { name: "DECK", value: "deck", selectorSuffix: "deck" },
  TRASH: { name: "TRASH", value: "trash", selectorSuffix: "trash" },
  EGGS: { name: "EGGS", value: "eggs", selectorSuffix: "eggs" },
  RAISING: { name: "RAISING", value: "raising", selectorSuffix: "raising" },
  SECURITY: { name: "SECURITY", value: "security", selectorSuffix: "security" },
} as const;

export type ArenaZone = (typeof ArenaZone)[keyof typeof ArenaZone]["value"];
