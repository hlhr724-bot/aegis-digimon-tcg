import { learnCombatDrillsPtBR } from "@/i18n/learn/combatDrills.pt-BR";
import { learnProtectionDrillsPtBR } from "@/i18n/learn/protectionDrills.pt-BR";
import { learnEvolutionDrillsPtBR } from "@/i18n/learn/evolutionDrills.pt-BR";
import { rulePracticePtBR } from "@/i18n/learn/rulePractice.pt-BR";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const newDrillsPtBR = {
  ...learnCombatDrillsPtBR,
  ...learnProtectionDrillsPtBR,
  ...learnEvolutionDrillsPtBR,
  ...rulePracticePtBR,
} satisfies Record<keyof typeof newDrillsEn, string>;
