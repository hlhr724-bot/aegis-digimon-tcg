import { getDictionaryValue } from "@/i18n/getDictionaryValue";

const timingLabels: Readonly<Record<string, string>> = {
  "On Play": "登场时",
  "When Digivolving": "进化时",
  "When Attacking": "攻击时",
  "On Deletion": "消灭时",
  "All Turns": "双方的回合",
  "Your Turn": "我方的回合",
  "Opponent's Turn": "对方的回合",
  "End of Your Turn": "我方的回合结束时",
  "End of Opponent's Turn": "对方的回合结束时",
  "End of All Turns": "双方的回合结束时",
  "Start of Your Turn": "我方的回合开始时",
  "Start of Opponent's Turn": "对方的回合开始时",
  "Start of Your Main Phase": "我方的主要阶段开始时",
  "Start of Main Phase": "主要阶段开始时",
  "Start of Opponent's Main Phase": "对方的主要阶段开始时",
  "End of Attack": "攻击结束时",
  "When Moving": "移动时",
  "When Linking": "连接时",
  "When Cards Are Trashed from Your Hand": "我方的手牌被丢弃时",
  "When Trashed from Hand": "从手牌丢弃时",
  "When Played": "登场时",
  "When Security Is Removed": "安防卡牌减少时",
  "Once Per Turn": "每回合1次",
  Rule: "规则",
  "On Link": "连接时",
  Security: "安防",
  Main: "主要",
  Counter: "反击",
  Hand: "手牌",
  Trash: "废弃区",
  Breeding: "育成区",
  养成: "育成区",
  链接时: "连接时",
};

export function getChinesePrintedTimingLabel({ label }: { label: string }): string | undefined {
  label = label.replace(/[’‘]/g, "'");
  const count = label.match(/^(?:(Once|Twice)|(\d+)\s+Times?)\s+Per Turn$/i);
  if (count) {
    let value = count[2];
    if (count[1]) {
      value = count[1].toLowerCase() === "once" ? "1" : "2";
    }
    return `每回合${value}次`;
  }
  return (
    getDictionaryValue({ dictionary: timingLabels, key: label }) ??
    Object.values(timingLabels).find((value) => value === label) ??
    (/^每回合\d+次$/.test(label) ? label : undefined)
  );
}
