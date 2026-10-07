
【语言服务行业翻译规则 — 本平台 100% 是语言服务/翻译技术行业内容，严格遵守】

1. 歧义默认值：以下词在中文有歧义，**一律按语言服务行业含义翻译**：
   - MT = 机器翻译（绝不译"蒙特梭利"/其他）
   - Translation / MTPE 中的 Translation = 翻译（语言转换，不是代码转写；代码语境另行判断）
   - Interpretation = 口译（不是"解释"；interpreter 译"口译员"）
   - Simultaneous interpretation = 同声传译（不是"同步解读"）
   - CAT = 计算机辅助翻译（Computer-Assisted Translation，绝不译"猫"）
   - TM = 翻译记忆（Translation Memory，不是"商标"）
   - Localization = 本地化（不是"定位"；l10n 同）
   - Internationalization (i18n) = 国际化
   - Post-editing / MTPE = 译后编辑 / 机器翻译译后编辑
   - Transcription = 转写（语音转文字，不是"抄写/转录"）
   - Dubbing = 配音; audio description = 口述影像（视听翻译与无障碍传播术语，不译“音频描述”）；Subtitling = 字幕制作（不是"副标题"）
   - Terminology = 术语（不是"名称学"）
   - Corpus / Corpora = 语料库（不是"尸体"复数）
   - Language pair = 语言对（不是"语言伴侣"）
   - LSP = 语言服务商（Language Service Provider，不是"标签服务协议"）
   - BLEU / COMET / TER = 自动评测指标（保留英文缩写）
   - Source / Target text = 原文 / 译文
   - Translation = 翻译；与 Interpreting 对举或并列出现时译“笔译”（与“口译”对应）
   - Translation and interpreting = 口笔译（固定译法，不拆成“翻译和口译”）
   - Translation Studies / translation theory（学科与理论名）= 翻译学 / 翻译理论（不套用“笔译”规则）
   - Translator = 译者（一般语境）；与 interpreter 对举时可译“笔译员”
   - Interpreter = 口译员或译员（不译“翻译员”“口译者”）

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - 引擎与厂商：DeepL / Google Translate / Microsoft Translator / Amazon Translate / Yandex Translate / Papago / ModernMT / Smart Translator
   - 翻译技术公司：RWS / TransPerfect / Lionbridge / Welocalize / LanguageLine / Phrase (Memsource) / Smartcat / Crowdin / Lilt / XTM / memoQ / Trados / Wordfast / Matecat / Wordly / KUDO
   - 中国厂商**优先用官方中文品牌名**（首次出现可双标"时空壶（Timekettle）"，后续选一种保持一致）：
     科大讯飞 / 有道（网易有道）/ 火山翻译（字节跳动）/ 腾讯翻译君（TranSmart）/ 百度翻译 / 阿里翻译 / 中译语通（GTCOM）/ 传神语联（Transn）/ 时空壶（Timekettle）
   - 评测与会议：WMT / IWSLT / BLEU / COMET / TER / chrF / MQM / TAUS / LocWorld / GALA / ATA / FIT
   - 技术缩写：MT / NMT / LLM / ASR / TTS / STT / SLT / CAT / TMS / TM / MTPE / API / SDK / QA / LQA / LSP / i18n / l10n / g11n / TMS
   - 标准：ISO 17100 / ISO 18587 / DIN 2345 等编号一字不改
   - 通用技术：API / SDK / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 版本号与模型名**一字不改**保留：
   - 引擎/模型版本号（举例 + 通用规则）：GPT-5 / Claude 4.7 / Gemini 3 / SeamlessM4T / NLLB-200 / DeepL LLM / Qwen-MT 任何版本号保留原文，绝不"翻译性扩写"（不要把 "NLLB-200" 译成 "200 种语言的开源模型"，不要把 "V4" 译成 "第 4 代"）
   - 语言代码与语言对：en-US / zh-CN / ja-JP / en→zh 原样保留

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令如 pip install、npm run、curl 不译
   - URL 原样
   - 数字+单位：1M words / 500k segments / $25 per 1M characters / 99.9% / 3x speedup / 200 languages
   - 金额、字符量、语言数、比例、区间必须保留原文的阿拉伯数字和单位；不要把 "$25-$100 per 1M characters" 改写成"每百万字符数十至百美元"等中文数量词
