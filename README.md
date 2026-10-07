<p align="center">
  <h1 align="center">语服热点</h1>
  <p align="center"><b>语言服务行业，也该有自己的热点日报。</b></p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
  <a href="https://news.ylm.life"><img src="https://img.shields.io/badge/%E7%BA%BF%E4%B8%8A%E7%AB%99%E7%82%B9-news.ylm.life-202a30?style=flat-square" alt="线上站点 news.ylm.life"></a>
  <a href="https://github.com/KKKKhazix/AIHOT"><img src="https://img.shields.io/badge/%E5%9F%BA%E4%BA%8E-AIHOT%20%E5%BC%80%E6%BA%90%E6%A1%86%E6%9E%B6-8957e5?style=flat-square" alt="基于 AIHOT 开源框架"></a>
</p>

<p align="center">
  <a href="#这是什么">这是什么</a> ·
  <a href="#为什么做">为什么做</a> ·
  <a href="#它盯什么">它盯什么</a> ·
  <a href="#这个站的定制">这个站的定制</a> ·
  <a href="#跑起来">跑起来</a> ·
  <a href="#与上游-aihot-的关系">与上游的关系</a>
</p>

<br>

## 这是什么

[语服热点](https://news.ylm.life) 是一个盯语言服务行业的 AI 热点站。它每天从 60 多个信源里收资料——行业分析机构、协会、翻译学期刊、X 上的公司账号、Reddit、公众号——用大模型筛一遍、独立打两次分，挑出真正值得看的，写成中文标题和导读；把不同来源说的同一件事聚成一个事件，每天早上 8 点出一份日报。

读者是语言服务行业的从业者、译员与口译员、本地化经理、翻译专业的师生，以及出海企业里和多语言打交道的人。

这个仓库是它的全部：站名文案、分类体系、62 个信源、**所有提示词的原文和入选门槛**，以及支撑它的 [AIHOT](https://github.com/KKKKhazix/AIHOT) 开源框架。

## 为什么做

做翻译的人有个共同的日常：想跟进行业，却不知道去哪跟。

Slator 和 CSA Research 出了新报告，要去翻它们的官网；Target 和 Interpreting 出了新论文，要去翻期刊目录；厂商动态在 X 上，中文讨论在公众号和 Reddit 里——信息散落在十几个地方，全英文，没人替你汇总。

我是个翻译学在读博士，也是口译员。我每天花在「找行业信息」上的时间，不比花在「用行业信息」上的少。

后来我看到 [AIHOT](https://github.com/KKKKhazix/AIHOT)——卡兹克把整套「采集、精选、聚簇、成刊」的引擎开源了出来，还写了文档教你怎么换成自己的行业。我懂语言服务行业，缺的正好是这把火种。

于是有了这个站。信源是我选的，评分标准是按这个行业重写的，术语表是按翻译圈的习惯定的。**行业的 KnowHow 在提示词里，框架的功劳归框架，行业判断的功劳和锅都归我。**

## 它盯什么

62 个信源，六类：

| 类别 | 信源 | 说明 |
|---|---|---|
| **行业分析机构** | CSA Research、Slator、Nimdzi | Top 100 榜单、市场规模、行业报告 |
| **行业协会** | GALA、ATC、EUATC、中国翻译协会 | 年度调查、行业倡议、政策动向 |
| **翻译学期刊** | 24 本期刊的五条主题流 | 经 [rss-translation-studies](https://github.com/xionglingsong/rss-translation-studies) 增强，只收行业相关主题：数字与 AI 翻译、视听翻译、术语、口译、译者教育 |
| **厂商与机构 X 账号** | 33 个 | Top-100 语言服务商的官方账号（DeepL、RWS、TransPerfect、LanguageWire、Smartling 等），用 Agent Reach 方法逐个验证 |
| **社区** | r/MachineTranslation 等 | 海外从业者的真实讨论 |
| **微信公众号** | 火山翻译、科大讯飞、网易有道等 | 国内厂商一手信息（需配置极致了 key 启用） |

## 这个站的定制

在 AIHOT 框架之上，这个站做了这些行业化改造（都在 `site/` 和 `industry/` 里，详见 [docs/customize.md](docs/customize.md) 的方法论）：

| 定制 | 内容 |
|---|---|
| **学术评分体系** | `research_paper` 内容类型按学术价值单独定义评分轴，论文和新闻各按各的尺度竞争版面；期刊流独立门槛 |
| **行业术语规则** | 翻译圈的标准译法写进提示词：Translation 与 Interpreting 对举时译「笔译/口译」、translation and interpreting 译「口笔译」、audio description 译「口述影像」、译者/口译员称谓规范——部分来自读者反馈，持续迭代 |
| **AI 翻译切换** | 入选精选的外文内容自动全文中译，详情页「中文 / 原文」一键切换，标注「正文 · AI 翻译」 |
| **版权纪律** | 全文展示只对明确允许的信源开放（RSS 输出全文的、期刊摘要流），商业媒体一律摘要 + 原文链接 |
| **机构矩阵** | CSA/Slator/Nimdzi/GALA/ATC/EUATC/中译协的实体识别与信源接入 |

## 跑起来

需要 [Docker](https://docs.docker.com/get-started/get-docker/)、[Node.js 24](https://nodejs.org/en/download)，和一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱都可以）。

```bash
git clone https://github.com/xionglingsong/LSHOT.git lshot
cd lshot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。一两分钟后开始有内容。

X 信源需要在 `.env` 配 `SOCIALDATA_API_KEY`（[SocialData](https://socialdata.tools/)，按量付费），公众号需要 `DAJIALA_KEY`（极致了）；不配也不影响其余信源。

站点跑起来后，打开 `/agent` 可以复制 MCP、RSS 或 API 的接入方式；接口说明在 `/openapi-v1.json`。

## 与上游 AIHOT 的关系

本仓库 fork 自 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT)，引擎代码与上游保持同源，定制集中在：

- `site/` — 站名、文案、出刊时间、引流入口
- `industry/` — 分类体系、62 个信源、全部提示词、入选门槛
- `tests/`、`apps/web/tests/` — 测试用例中的行业示例替换

想持续合并上游更新，加个 remote 拉取即可；冲突面主要在上面三个目录。想把它改成**你的行业**的热点站，读上游的 [docs/customize.md](docs/customize.md)，照着这个仓库的 diff 改，是最省事的路径——我就是这么做的。

## 文档

框架的完整文档在 [`docs/`](docs/)：[信源](docs/sources.md)、[精选与校准](docs/selection.md)、[事件归组](docs/grouping.md)、[部署](docs/deploy.md)、[架构](docs/architecture.md)。

技术栈：Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 最后

卡兹克在 AIHOT 的 README 里写：「既然我没办法满足所有人，那就把火种交到大家自己手上。」

这个仓库就是接过来的那把火——烧到了语言服务行业。机器翻译在改变这个行业，行业的每一天都值得被记录、被看见。

如果这个站对你有用，欢迎提 Issue 和反馈（站内就有反馈入口，会直达我的飞书群）。如果你也想给自己的行业做一个，fork 上游，然后把这个仓库当参考答案。

## 许可

代码使用 [MIT 许可证](LICENSE)，继承自上游 AIHOT 框架。AIHOT 的名字和 Logo 不在许可范围内。「语服热点」与本项目的基础设施相互独立，引用本站内容请注明出处并链接原文。
