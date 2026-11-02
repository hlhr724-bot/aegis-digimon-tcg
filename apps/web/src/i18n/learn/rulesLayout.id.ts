import type { rulesLayoutEn } from "@/i18n/learn/rulesLayout.en";

export const rulesLayoutId = {
  "learn.guide.chapterProgress": "Bab {current} dari {total}",
  "learn.guide.topicCount": "{count} topik",
  "learn.guide.chapterSearch": "Cari bab, topik, atau aturan",
  "learn.guide.searchEmpty": "Tidak ada bab yang sesuai dengan pencarian ini.",
  "learn.guide.groupBasics": "Dasar permainan",
  "learn.guide.groupFlow": "Giliran dan tindakan kartu",
  "learn.guide.groupCombat": "Serangan dan battle",
  "learn.guide.groupEffects": "Efek dan aturan lanjutan",
  "learn.guide.onThisChapter": "Dalam bab ini",
  "learn.guide.playBattleLabel": "Mulai battle: {title}",
  "learn.guide.advancedScenarios": "Interaksi efek lanjutan",
  "learn.guide.advancedScenariosBody":
    "Pilih urutan efek, ikuti kelompok efek yang baru terpicu, dan gabungkan efek warisan dengan pencegahan delete serta serangan akhir giliran dalam pertandingan nyata melawan bot.",
} satisfies Record<keyof typeof rulesLayoutEn, string>;
