import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getTranslatedKeyword } from "@/i18n/getTranslatedKeyword";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { getDictionaryValue } from "@/i18n/getDictionaryValue";

type Params = { text: string; translations: CardTranslationData; cardId?: string };

export function getTranslatedRulePrompt({ text, translations, cardId }: Params): string | undefined {
  const keyword = (label: string) => getTranslatedKeyword({ keyword: label, translations });
  const fragment = text.match(
    /^＜Fragment \(([1-9]\d?)\)＞: (trash|choose) \1 of this Digimon's digivolution cards (to prevent its deletion\?|to trash\.)$/,
  );
  if (
    fragment &&
    ((fragment[2] === "trash" && fragment[3] === "to prevent its deletion?") ||
      (fragment[2] === "choose" && fragment[3] === "to trash."))
  ) {
    const label = keyword(`＜Fragment (${fragment[1]})＞`);
    if (fragment[2] === "choose") {
      return `${label}：选择此数码宝贝的${fragment[1]}张进化源丢弃。`;
    }
    return `${label}：要丢弃此数码宝贝的${fragment[1]}张进化源，使其不会被消灭吗？`;
  }
  const digisorption = text.match(
    /^＜Digisorption -([1-9]\d?)＞: suspend 1 Digimon to reduce the digivolution cost by \1\?$/,
  );
  if (digisorption) {
    return `${keyword(`＜Digisorption -${digisorption[1]}＞`)}：要将1只数码宝贝转换为休息状态，使进化费用减少${digisorption[1]}吗？`;
  }
  const saveDescription = text.match(
    /^＜Material Save ([1-9]\d?)＞: When this Digimon would be deleted, you may place up to \1 of its specified digivolution cards under one of your Tamers\.$/,
  );
  if (saveDescription) {
    return `${keyword(`＜Material Save ${saveDescription[1]}＞`)}：此数码宝贝将要被消灭时，可以将此数码宝贝指定的最多${saveDescription[1]}张进化源，置于我方1只驯兽师下方。`;
  }
  const save = text.match(
    /^＜Material Save ([1-9]\d?)＞: place up to \1 of this Digimon's specified digivolution cards under 1 of your Tamers\?$/,
  );
  if (save) {
    return `${keyword(`＜Material Save ${save[1]}＞`)}：要将此数码宝贝指定的最多${save[1]}张进化源，置于我方1只驯兽师下方吗？`;
  }
  const ordered = text.match(
    /^＜Material Save ([1-9]\d?)＞: choose ([1-9]\d?) specified digivolution card(s?) to place under the Tamer, in order\.$/,
  );
  if (ordered && Number(ordered[2]) <= Number(ordered[1]) && (Number(ordered[2]) === 1) === (ordered[3] === "")) {
    return `${keyword(`＜Material Save ${ordered[1]}＞`)}：依次选择${ordered[2]}张指定的进化源卡牌，置于该驯兽师下方。`;
  }
  const overclock = text.match(
    /^＜Overclock \[([^\]\r\n]+)\]＞: at the end of this turn, by deleting 1 of your Tokens or other \[\1\] trait Digimon, this Digimon attacks a player without suspending\.$/,
  );
  const trait = overclock
    ? getDictionaryValue({ dictionary: translations.meta.traits, key: overclock[1]! })
    : undefined;
  if (overclock && trait) {
    return `${keyword("＜Overclock＞")}［${trait}］：本回合结束时，可消灭我方1只衍生物或其他拥有“${trait}”特征的数码宝贝，使此数码宝贝不转换为休息状态，对玩家进行攻击。`;
  }
  const arts = text.match(
    /^＜Arts Digivolve＞: digivolve one of your Digimon into \[([^\]\r\n]+)\] \(([A-Z]+\d*-\d+)\) instead of trashing it\?$/,
  );
  const card = cardId ? getCardDefinition(cardId) : undefined;
  if (arts && card && arts[2] === card.cardId && arts[1] === card.nameEn) {
    return `${keyword("＜Arts Digivolve＞")}：要将我方1只数码宝贝进化成“${getTranslatedCardName({ name: card.nameEn, translations })}”（${card.cardId}），代替将此卡牌丢弃吗？`;
  }
  const detach = text.match(
    /^＜Detach(?: \(([^)\r\n]+)\))?＞: trash 1 link card so (.+) doesn't leave the battle area\.$/,
  );
  if (detach && card && detach[2] === card.nameEn) {
    const traits = detach[1]?.split("/").map((part) => part.match(/^\[([^\]]+)\] trait$/)?.[1]) ?? [];
    const labels = traits.map((value) =>
      value ? getDictionaryValue({ dictionary: translations.meta.traits, key: value }) : undefined,
    );
    if (labels.some((label) => !label)) {
      return undefined;
    }
    return `${keyword("＜Detach＞")}${labels.length ? `（${labels.join("/")}）` : ""}：丢弃1张连接卡牌，使“${getTranslatedCardName({ name: card.nameEn, translations })}”不会离开战斗区。`;
  }
  return undefined;
}
