## 故事模式英译简中

专名的后续核对、别名适用范围与保留原文边界见 [故事模式专名核对](story-names.zh.md)。

故事模式本轮源语言为英语，目标语言为简体中文（`en` → `zh-CN`）。整句译文维护于 `apps/web/src/i18n/storyText.zh.json`，包含故事目录、分类、角色、对手、对战标题与章节。只翻译已有文本，不补写原作情节；原数据里的章节代号与名称含义不明时保留原文。标题中的描述性中文不代表原作官方章节名。

数码宝贝与人物名称遵循现有 `cardNames.zh.json` 术语表。明确的英文别名也复用同一词条，例如 `Z'dGarurumon` → `ZeedGarurumon`（终弩级加鲁鲁兽）、`Beelzemon Blast Mode` → `Beelzemon: Blast Mode`（别西卜兽：疾风形态）、`Nokia` → `Nokia Shiramine`（白峰乃树爱）。`getTranslatedStoryText.test.ts` 检查全部现有故事文本的键覆盖、字典一致性与这些别名，不以含有中文字符作为翻译完成的依据。未核实的旧游戏名称（如 Akira、Junior）保留原文；已核对的民间名称（如 Grimmon → 残酷兽）及其出处单独列于专名核对表，不能标为官方译名。未知新文本直接回退原文。

核对资料（2026-11-05）：

- [万代官方简体中文数码宝贝画册](https://digimon.net/reference_zh-CHS/)，例如 [ELDORADIMON／黄金乡兽](https://digimon.net/reference_zh-CHS/detail.php?directory_name=eldoradimon)。官网声明非日文页面可能使用机器翻译，因此名称须与维护词典及对应个体交叉核对，不直接覆盖词典。
- [东映官方作品资料](https://lineup.toei-anim.co.jp/ja/series/digimon/)、[BEATBREAK 官方英文资料](https://www.toei-anim.co.jp/tv/digimon_beatbreak/en/)、[Seekers 官方原作](https://digimon.net/digimonseekers/novel/1-1.php)，用于核对作品与角色身份；各对战原数据中的 `sourceUrl` 继续保留。
- [任天堂香港官方《數碼寶貝物語 網路偵探 駭客追憶》页面](https://ec.nintendo.com/HK/zh/titles/70010000018679)，作品名按简体字显示。
- [剑桥英汉词典 intervention](https://dictionary.cambridge.org/dictionary/english-chinese-simplified/intervention)，用于核对普通词义；结合对战语境译为“介入”，不额外断言胜负或先后结果。

上线前运行故事映射与 `StoryScreen` 定向测试、Web 类型检查、改动文件 lint/format；发布构建复用严格卡库翻译检查。目录搜索同时匹配英文原名与简体中文译名，语言设置不改变故事 ID、对战配置和进度记录。
