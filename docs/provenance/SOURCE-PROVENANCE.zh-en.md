# 数据出处与版权方关联核验（历史记录）

# Data Provenance and Historical Rights-Holder Source Checks

> **审阅说明 / Review note:** 本文是 `SOURCE-PROVENANCE.md` 的中英对照译本。中文为原文，英文供上游作者审阅；本次翻译未独立重新核验原文中的事实、链接或抽查结果。公司及产品名称的英文解释仅用于理解，不代表官方英文名称。
>
> This is a bilingual translation of `SOURCE-PROVENANCE.md`. The Chinese text is the original; the English translation is provided for upstream review. The facts, links, and spot-check results in the source document have not been independently reverified for this translation. English descriptions of company and product names are explanatory and should not be taken as official English names.

**历史记录中的结论（本次未复核）：原调查认为，digimoncard.cn 是《数码宝贝卡牌对战》简体中文版的官方运营站点，其公开卡牌数据与中国大陆代理发行体系相关。该证据支持将其作为官方来源进行人工核验，但不能单凭公开页面证明相关数据可以被第三方项目再分发。**

**Historical conclusion (not reverified here): The earlier investigation considered that digimoncard.cn is the official operating website for the Simplified Chinese edition of the Digimon Card Game and that its public card data is connected to the mainland China distribution system. This supports treating it as an official source for manual verification, but the public pages alone do not establish that a third-party project may redistribute the data.**

> **本 PR 的核验边界 / Scope for this PR:** 下文保留此前调查记录，尚未附上独立复核的原始页面快照。运营主体关联、具体译文来源和再分发授权是三个不同的问题；本文未逐条追溯本 PR 的五份 JSON，也不构成授权证明。原记录中的主体关联链属于待核实推断，不能仅凭其他卡牌产品的发行介绍确认本产品的授权关系。
>
> The historical record below does not include independently reverified page snapshots. Operator affiliation, the origin of each translated entry, and redistribution authorization are separate questions. This note does not trace every entry in the five JSON files or establish permission. Its affiliation chain is an inference requiring verification; a distributor's description of another card game does not establish authorization for this product.

---

## 1. 目标站 / Target Website

| 项 / Item                         | 值 / Value                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 前端页面 / Frontend page          | `https://www.digimoncard.cn/cardlist`                                                                                                                                                                                    |
| 页面标题 / Page title             | 数码宝贝卡牌对战官网 / Digimon Card Game Official Website                                                                                                                                                                |
| 技术形态 / Technical architecture | Vue SPA（webpack 分包），网关 `APISIX/3.8.0` / Vue single-page application with webpack code splitting; gateway: `APISIX/3.8.0`                                                                                          |
| 数据接口 / Data API               | `https://dtcgweb-api.digimoncard.cn`（与站点同组织的子域，硬编码在 `chunk-21f5df50.js` 的 axios `baseURL`） / A subdomain under the same organization's domain, hardcoded as the axios `baseURL` in `chunk-21f5df50.js`. |
| 卡图 CDN / Card image CDN         | `https://source.windoent.com/DTCG/...`                                                                                                                                                                                   |

## 2. 运营主体证据链 / Evidence Identifying the Website Operator

| #   | 证据 / Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 来源 / Source                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | 页脚署名 **©Akiyoshi Hongo, Toei Animation** / Footer attribution: **©Akiyoshi Hongo, Toei Animation**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 站点全站页脚（`chunk-4a5b9c84.js`） / Site-wide footer (`chunk-4a5b9c84.js`).                                            |
| 2   | 页脚 **备案号：沪ICP备16038212号-4**、**公安备案号：沪公网安备31010702009523号** / Footer registration details: **ICP filing: 沪ICP备16038212号-4**; **public security filing: 沪公网安备31010702009523号**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 同上，链接指向 beian.miit.gov.cn / beian.mps.gov.cn / Same footer, with links to beian.miit.gov.cn and beian.mps.gov.cn. |
| 3   | 卡图托管域名 **windoent.com** / Card images are hosted under **windoent.com**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 接口返回的 `imageCover` 字段 / The `imageCover` field returned by the API.                                               |
| 4   | `windoent.com` = **上海映蝶影视文化有限公司**，官网自述：「桌游卡牌《时间互搏》…**由日本株式会社万代**基于知名IP制作，**由上海映蝶影视文化有限公司代理发行简体中文版**」；公司介绍「成立于2016年，中国领先的动漫衍生品发行公司…专业从事集换式卡牌产品发行、赛事举办」 / `windoent.com` identifies its company as **上海映蝶影视文化有限公司** (Shanghai Yingdie Film and Television Culture Co., Ltd.; explanatory translation). Its website states that the tabletop card game 《时间互搏》 “…is produced **by Bandai Co., Ltd. of Japan** based on a well-known IP, with **the Simplified Chinese edition distributed by 上海映蝶影视文化有限公司**.” The company profile describes it as “founded in 2016, a leading distributor of anime merchandise in China…specializing in the distribution of trading card game products and the organization of tournaments.” | windoent.com 首页 / windoent.com homepage.                                                                               |
| 5   | 微博账号 **「数码宝贝卡牌对战」**（weibo.com/7712420770）简介列明「官方网站:www.digimoncard.cn」，并称「数码宝贝卡牌对战简体中文版…收到了来自**万代官方**的纪念视频」 / The Weibo account **「数码宝贝卡牌对战」** (weibo.com/7712420770) lists “Official website: www.digimoncard.cn” in its profile and states that “the Simplified Chinese edition of the Digimon Card Game…received a commemorative video from **Bandai's official team**.”                                                                                                                                                                                                                                                                                                                                                                                                                        | 微博官方账号 / Official Weibo account.                                                                                   |
| 6   | 站点公告含只有发行方才会发布的行政类内容：**《数码宝贝卡牌对战》部分卡片回收更换通知 2026.6.5**、**2026年"替代卡"下载内容公布①②③**、世界锦标赛中国内地预选/驯兽师对战会等赛事报名 / The website carries administrative announcements of the kind issued by a publisher: **Notice of Recall and Replacement of Certain Digimon Card Game Cards, June 5, 2026**; **2026 “Replacement Card” Download Releases ①②③**; and registration for events such as the World Championship mainland China qualifiers and Tamer Battles.                                                                                                                                                                                                                                                                                                                                              | `more/moreinfomanage/list` 接口 / The `more/moreinfomanage/list` API endpoint.                                           |

**原记录推断的关联链（不构成授权证明）**：万代（授权关系待核实）→ 上海映蝶影视文化有限公司（大陆代理发行商）→ 运营 digimoncard.cn → 提供官方简体中文卡牌数据。

**Inferred affiliation chain from the historical record (not proof of permission):** Bandai (authorization requires verification) → 上海映蝶影视文化有限公司 (mainland China distributor) → operation of digimoncard.cn → provision of official Simplified Chinese card data.

## 3. 措辞精确性（重要，不夸大） / Precise Wording (Important: Avoid Overstatement)

- 站点译文可视为**大陆代理发行体系使用的正式简体中文译文**；现有证据不足以证明其逐字来源于日本万代原厂，也不足以单独证明第三方再分发许可。

  The website's translations appear to be **formal Simplified Chinese translations used by the mainland China distribution system**. The available evidence does not establish that they were translated word for word by Bandai in Japan or that third parties may redistribute them.

- 对「是否来自版权方」的准确表述应是：**数据来自与官方发行体系相关的公开站点；是否获得版权方授权以及是否允许再分发，仍需权利人或发行方明确确认**。

  The precise way to address the request to “confirm that the translation comes from the rights holder” is: **The data comes from a public site connected to the official distribution system; explicit confirmation from the rights holder or distributor is still required before claiming authorization or redistribution permission.**

- 佐证：接口返回的 `keyEffect`、效果文本与简体中文版实体卡印文存在逐项一致的抽查结果；这些抽查结果应作为来源核验记录保存，不能替代许可证明。

  Supporting evidence: spot checks found that the API's `keyEffect` and effect text match text printed on Simplified Chinese cards. Such checks document source consistency; they do not replace evidence of authorization or redistribution rights.

## 4. 与现有语料源的对比 / Comparison with the Existing Text Source

| 维度 / Aspect      | 现有语料源 / Existing source                                                                                                                                           | 本数据源 / Proposed source                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 站点 / Website     | `app.digicamoe.cn` / `api.digicamoe.com`（第三方卡牌工具站） / Third-party card utility website.                                                                       | `www.digimoncard.cn`（官方站） / Official website.                                                                                                                   |
| 性质 / Source type | 社区/第三方整理 / Community-curated or third-party compilation.                                                                                                        | 万代授权大陆代理发行商官方发布 / Officially published by Bandai's authorized mainland China distributor.                                                             |
| 许可 / Licensing   | 当前工作区的来源记录自述「未独立核实其再分配条款」 / The existing local provenance record states that its “redistribution terms have not been independently verified.” | 官方公开发布接口，页脚含完整权利声明与备案号 / An API publicly exposed by the official website, whose footer includes a full rights notice and registration numbers. |

> ⚠️ **许可建议（非本报告结论，需自行判断）**：官方站公开可读不等于可自由再分发。若字典要进入对外发布的构建产物，建议保留本文件的出处链并自行评估使用边界；上游 `aegis` README 的 Legal 部分明确卡图、卡文和相关商标归其权利人，不在源码的 MIT 许可范围内。
>
> ⚠️ **Licensing recommendation (not a conclusion of this report; requires your own assessment):** Public readability on an official website does not imply permission to redistribute freely. If the dictionary is to be included in publicly distributed build artifacts, retain the provenance chain documented here and assess the permitted scope of use. The upstream `aegis` README Legal section states that artwork, card text and related trademarks belong to their owners and fall outside the source code’s MIT license.

## 5. 历史采集命令（脚本未随本 PR 提供） / Historical Collection Commands (Scripts Not Included)

这些命令仅保留旧调查的操作记录。本 PR 不提供所引用的脚本，不能仅凭本节独立复现当前五份字典。

These commands preserve the earlier investigation record. The referenced scripts
are not included in this PR, so this section alone cannot reproduce the five
current dictionaries.

以下命令保留原文的本地路径；在其他环境执行时需调整项目路径及 Python 可执行文件路径。

The commands below retain the original local paths. Adjust the project path and Python executable path when running them in another environment.

```bash
cd F:/WorkBuddy/DTCG/scrape_official
PY="C:/Users/39696/.workbuddy/binaries/python/versions/3.13.12/python.exe"

# 1) 全量卡表（1 次请求，约 1.2 秒）
# 1) Fetch the full card list (one request; approximately 1.2 seconds).
"$PY" fetch_all.py

# 2) 详情补齐（仅详情接口才有「获得方式 getWayStr」）约 2 分钟
# 2) Fetch additional card details (approximately 2 minutes).
#    The acquisition-method field, getWayStr, is available only from the details endpoint.
"$PY" fetch_details.py

# 3) 生成与本地字典同 schema 的词典 + 比对报告
# 3) Generate a dictionary using the same schema as the local dictionary, plus a comparison report.
"$PY" build_official_dict.py
```

`fetch_all.py` 中接口为 `GET /gamecard/gamecardmanager/weblist?page=1&limit=10000`，无需任何鉴权（无 token / cookie）。

`fetch_all.py` uses `GET /gamecard/gamecardmanager/weblist?page=1&limit=10000`. No authentication is required (no token or cookie).
