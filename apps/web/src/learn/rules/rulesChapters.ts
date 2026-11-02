import type { IconComponent } from "@/design/icons";
import { Icons } from "@/design/icons";

export type RulesChapterId =
  | "goal"
  | "deck"
  | "setup"
  | "turn"
  | "breeding"
  | "memory"
  | "digivolve"
  | "attack"
  | "blocking"
  | "cardTypes"
  | "keywords"
  | "areas"
  | "terminology"
  | "playing"
  | "using"
  | "link"
  | "security"
  | "battles"
  | "effects"
  | "checks"
  | "other";

export type RulesChapter = { id: RulesChapterId; icon: IconComponent };

export const rulesChapters: readonly RulesChapter[] = [
  { id: "goal", icon: Icons.Trophy },
  { id: "deck", icon: Icons.LayoutGrid },
  { id: "cardTypes", icon: Icons.BookOpen },
  { id: "areas", icon: Icons.LayoutGrid },
  { id: "terminology", icon: Icons.BookOpen },
  { id: "setup", icon: Icons.Dices },
  { id: "turn", icon: Icons.RotateCcw },
  { id: "breeding", icon: Icons.Sparkles },
  { id: "memory", icon: Icons.Hexagon },
  { id: "playing", icon: Icons.Play },
  { id: "digivolve", icon: Icons.ArrowRight },
  { id: "using", icon: Icons.BookOpen },
  { id: "link", icon: Icons.ArrowRight },
  { id: "attack", icon: Icons.Swords },
  { id: "blocking", icon: Icons.Shield },
  { id: "security", icon: Icons.Shield },
  { id: "battles", icon: Icons.Swords },
  { id: "effects", icon: Icons.Sparkles },
  { id: "keywords", icon: Icons.Search },
  { id: "checks", icon: Icons.Search },
  { id: "other", icon: Icons.BookOpen },
];
