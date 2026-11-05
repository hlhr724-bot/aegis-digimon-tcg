# 故事模式专名核对

2026-11-06。源语言英语，目标语言简体中文。仅用于故事整句字典的编写与复核，运行时仍按完整原文键查找，不做模糊匹配或片段替换。

名称优先使用维护中的 `apps/web/src/i18n/cardNames.zh.json`；组织名称使用 `cardMeta.zh.json` 的特征术语。卡名字典原样保留英文的项目不构成已经核准的中文名称。官方图鉴非日文页注明可能使用机器翻译，须核对同一对象，不能据相似拼写覆盖已有词典。

## 官方图鉴补充

| 故事英文                   | 采用名称                   | 官方图鉴                                                                                                                  |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Minotarumon                | 牛人兽                     | [minotaurmon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=minotaurmon)                                 |
| Arkadimon                  | 阿卡迪兽                   | [arkadimon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=arkadimon)                                     |
| Gargoylemon                | 石像鬼兽                   | [gargomon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=gargomon)                                       |
| Kuramon                    | 水母兽                     | [kuramon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=kuramon)                                         |
| Pabumon                    | 泡泡兽                     | [bubbmon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=bubbmon)                                         |
| Poyomon                    | 浮游兽                     | [poyomon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=poyomon)                                         |
| Phelesmon                  | 费勒斯兽                   | [phelesmon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=phelesmon)                                     |
| Splashmon                  | 激流兽                     | [splashmon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=splashmon)                                     |
| Olegmon                    | 奥列格兽                   | [olegmon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=olegmon)                                         |
| Gravimon                   | 重力兽                     | [gravimon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=gravimon)                                       |
| HeliosVoamon               | 光辉巨蟒兽                 | [heliosboamon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=heliosboamon)                               |
| Apollomon Whispered        | 阿波罗兽：低吟             | [apollomon_whispered](https://digimon.net/reference_zh-CHS/detail.php?directory_name=apollomon_whispered)                 |
| Yggdrasil 7D6              | 世界树_7D6                 | [yggdrasill7d6](https://digimon.net/reference_zh-CHS/detail.php?directory_name=yggdrasill7d6)                             |
| NeoMyotismon Darkness Mode | 新种吸血魔兽 Darkness Mode | [neovamdemon](https://digimon.net/reference_zh-CHS/detail.php?directory_name=neovamdemon)；仅基础名称已核实，后缀保留英文 |

Arkadimon 的图鉴名称只作为基础名称依据，不把成长期条目的资料套用为其它形态的图鉴资料。Apollomon Whispered 与 Yggdrasil 7D6 按完整对象处理，避免重复拼接名称或编号。

## 维护字典中的别名与组织

| 故事原文            | 对应词条                     | 采用名称                                          |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| Anomalocarimon      | Scorpiomon                   | 奇虾兽                                            |
| Nanomon             | Datamon                      | 分子兽                                            |
| Persiamon           | Bastemon                     | 芭丝特兽                                          |
| Ragnamon            | Galacticmon                  | 诸神黄昏兽                                        |
| Chronomon Holy Mode | Chronomon: Holy Mode         | 时空兽：神圣形态                                  |
| DoneDevimon         | DanDevimon                   | 但丁恶魔兽                                        |
| Crossmon            | Eaglemon                     | 十字兽                                            |
| Gokuwmon            | Gokuumon                     | 悟空兽                                            |
| Seitengokuwmon      | SeitenGokuumon               | 齐天悟空兽                                        |
| Hikari              | Kari Kamiya                  | 八神光                                            |
| Airu                | Airu Suzaki                  | 洲崎爱瑠                                          |
| Ren                 | Ren Tobari                   | 户张莲                                            |
| Demon               | Creepymon                    | 究极魔兽；仅限原文 Creepymon / Demon 的两个故事键 |
| Blue Flare          | cardMeta.traits.Blue Flare   | 蓝色闪耀                                          |
| Glowing Dawn        | cardMeta.traits.Glowing Dawn | 光辉黎明                                          |

Gargoylemon（石像鬼兽）与 Gargomon（加鲁哥兽）是不同对象。Regulumon 不得套用 Regulusmon 的“轩辕十四兽”。Panda family 不能仅凭存在 Pandamon 的卡名就判定为“熊猫兽一家”。Megadeath 同时出现在招式卡名和故事人物名中，不能互套。

## 保留原文与修正边界

官方核对阶段将未核实的 World 2 Domain、部分 World 3 地点、Xros Wars Zone，以及 Operation Juggernaut、Operation Infinity 恢复完整英文专名；随后仅对下表已定位民间中文用例的项补充译名。Operation Juggernaut 属于 Tamers 语境，不采用将其解释成 World 3 战舰的说明。已有通名译文或惯用作品标题不自动视为官方命名。

Server 删除原文没有的“大陆”；after 描述删除原文没有的“取得”“击败”“遇到”“解开”等推断。原作链接、故事 ID、对战配置与进度标识保持不变。

未查到图鉴条目、某个 slug 跳转、暂时不可访问或名称模糊匹配失败，均不能证明没有官方译名。百科、攻略和由前后缀拼成的名称不能直接标为官方译文。未核实项目保留原文，后续有原作官方中文版、字幕截图或官方出版资料时再补。

## 经核对采用的民间与二手译法

这些译法均不标为官方译文。World 3 来源是玩家攻略，作者明确说明部分自行翻译、部分参考攻略书，不能整体称为台版官方攻略本。该页检索缓存可定位，直连可能返回 403。简繁转换只转换字形。

| 故事原文                                         | 采用名称     | 出处                                                                           |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------ |
| Chaos Lord                                       | 混沌领主     | [出处](https://bkso.baidu.com/item/数码暴龙世界2/17414118)                     |
| NeoCrimson                                       | 新深红       | [出处](https://bkso.baidu.com/item/数码暴龙世界2/17414118)                     |
| ChaosGreymon                                     | 混沌暴龙兽   | [出处](https://bkso.baidu.com/item/数码暴龙世界2/17414118)                     |
| ChaosMetalSeadramon                              | 混沌海龙兽   | [出处](https://bkso.baidu.com/item/数码暴龙世界2/17414118)                     |
| ChaosPiedmon                                     | 混沌小丑皇   | [出处](https://bkso.baidu.com/item/数码暴龙世界2/17414118)                     |
| Yanmamon                                         | 蜻蜓兽       | [出处](https://www.sohu.com/a/207746515_99995222)                              |
| Tyranno Valley                                   | 恐龙石区     | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Jungle Grave                                     | 密林墓地     | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Duel Island                                      | 冰咭岛       | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Dum Dum Factory                                  | 弹弹工厂     | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Bulk Swamp                                       | 毒虫沼泽     | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Bulk Bridge                                      | 毒虫桥       | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Ether Jungle                                     | 伊撒森林     | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Asuka（World 3）                                 | 明日香       | [出处](https://forum.gamer.com.tw/G2.php?bsn=7255&lorder=16&parent=118&sn=674) |
| Amaterasu                                        | 天照         | [出处](https://forum.gamer.com.tw/Co.php?bsn=7255&sn=35947)                    |
| Magasta                                          | 海底基地     | [出处](https://forum.gamer.com.tw/Co.php?bsn=07255&sn=32274)                   |
| Armormon                                         | 战斗人马兽   | [出处](https://forum.gamer.com.tw/Co.php?bsn=07255&sn=31968)                   |
| Login Mountain                                   | 登录山脉     | [出处](https://www.70wn.com/literary/2151.html)                                |
| Limit Valley                                     | 极限谷       | [出处](https://www.70wn.com/literary/2151.html)                                |
| Thriller Ruins                                   | 恐怖遗迹     | [出处](https://www.70wn.com/literary/2151.html)                                |
| ChaosGrimmon                                     | 混沌残酷兽   | [出处](https://www.70wn.com/literary/2151.html)                                |
| Julia                                            | 朱莉娅       | [出处](https://www.70wn.com/literary/2151.html)                                |
| Loop Swamp                                       | 环形沼泽     | [出处](https://bkso.baidu.com/item/数码宝贝物语：日光/65741069)                |
| Palette Amazon                                   | 帕雷特亚马逊 | [出处](https://bkso.baidu.com/item/数码宝贝物语：日光/65741069)                |
| Gaia Origin                                      | 大地起源     | [出处](https://bkso.baidu.com/item/数码宝贝物语：日光/65741069)                |
| Grimmon                                          | 残酷兽       | [出处](https://bkso.baidu.com/item/残酷兽/4399785)                             |
| Green Zone                                       | 绿原地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Island Zone                                      | 岛屿地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Magma Zone                                       | 熔岩地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Sand Zone                                        | 沙滩地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Heaven Zone                                      | 天堂地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Dust Zone                                        | 灰尘地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Sweets Zone                                      | 甜点地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Sword Zone                                       | 刀剑地区     | [出处](https://zh.wikipedia.org/wiki/数码宝贝合体战争)                         |
| Shangri-La Egg                                   | 香格里拉蛋   | [出处](https://zh.wikipedia.org/wiki/數碼寶貝覺醒節拍角色列表)                 |
| Nirinso                                          | 二轮草       | [出处](https://zh.wikipedia.org/wiki/數碼寶貝覺醒節拍角色列表)                 |
| Clay（BEATBREAK; Clay/Klay 同一搭档 Proganomon） | 克莱         | [出处](https://zh.wikipedia.org/wiki/數碼寶貝覺醒節拍角色列表)                 |
| Asuka（BEATBREAK）                               | 飞鸟         | [出处](https://zh.wikipedia.org/wiki/數碼寶貝覺醒節拍角色列表)                 |

Asuka 在 World 3 只替换为基础名称“明日香”，不向原文添加市或服务器；在 BEATBREAK 中指天马飞鸟，使用“飞鸟”。Amaterasu 同样不额外添加市或服务器。Bulk Swamp 与 Bulk Bridge 分别为毒虫沼泽、毒虫桥；Magasta 保留原文楼层编号。Clay 与二手资料 Klay 根据同一搭档 Proganomon 核对，只采用名字“克莱”。

未采用的候选包括：将 Byakko Dome／Bai Hu Dome 套用 City 的“白虎都市”、将 Mirage Hall 套用 Tower 的“蜃景塔”、未定位完整名称的 Protocol Ruins／Kulon、已知误读 Resistor 为 Register 的“注册雨林”。不以 Avalon Gate 卡名证明另一作品 Avalon 地点的译名。Kaito 存在“海斗／快斗”二手资料冲突，保留英文。Akira、Bertran、Joy Joy／Lin Lin Shao、Keith 的所称具体中文词条未定位；Panda family 与 GrandGeneramon 的候选也未获得足够的同对象依据，保留现状。Grimmon 的依据不自动扩展到 ExoGrimmon。
