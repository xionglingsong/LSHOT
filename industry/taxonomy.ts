// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "engine", label: "引擎", feedLabel: "翻译与语音引擎", section: "引擎发布/更新", guide: "机器翻译引擎、翻译大模型、自动语音识别、语音合成、语音同传等核心技术本身的发布、版本、能力或价格变化，以及既有评测基准上的成绩。公布一次评测成绩不是发布新基准，也不是教程。" },
  { key: "product", label: "产品", feedLabel: "工具与产品", section: "产品发布/更新", guide: "可使用的翻译工具、CAT/TMS 平台、口译服务平台、翻译 API、桌面客户端与集成组件的发布更新。引擎厂商发布的翻译 API、桌面客户端仍是产品，不能因为厂商名归成引擎。" },
  { key: "industry", label: "行业", feedLabel: "行业动态", section: "行业动态", guide: "已发生的语言服务商与厂商的经营、财报、融资并购、人事、合作、诉讼、政策、客户数据泄露与真实质量事故及调查进展。新闻由当事方发帖、带有态度，也不因此变成观点。" },
  { key: "paper", label: "论文", feedLabel: "论文", section: "论文研究", guide: "以新研究方法、实验设计与发现为核心的论文、技术报告、新评测基准或评测数据集（如 WMT、IWSLT）。系统性翻译质量评估实验属于研究；既有基准上的成绩归引擎，真实事故的新闻调查归行业。" },
  { key: "tip", label: "教程", section: "技巧与观点", guide: "读者可以照着使用的方法、提示词、译后编辑流程、术语管理实践、CAT 工具用法与技术讲解。重点是可复用的做法；单纯发布工具归产品，只有态度和预测而无做法归观点。", commentary: true },
  { key: "opinion", label: "观点", section: "技巧与观点", guide: "重点是作者的解释、判断、主张、预测、评论或访谈观点，比如机器翻译会不会取代译员、AI 时代语言服务市场走向的判断。讨论市场不自动归行业，作者是名人不自动归观点。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（语言服务行业是新翻译/语音引擎与模型）：日报报头的“N 个新引擎”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "engine", tag: "引擎发布", unit: "个新引擎" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "mt", "asr", "tts", "cat", "tms", "lsp", "llm", "wmt", "ceo"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "引擎发布", "产品更新", "论文/研究", "开源/仓库", "教程/实践", "现象/趋势", "大佬观点", "评测/基准", "质量/合规", "行业动态", "政策/监管",
  "通用/非行业", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "机器翻译", "大模型翻译", "语音识别", "语音合成", "同声传译", "字幕配音", "计算机辅助翻译", "本地化", "出海国际化", "译后编辑", "术语管理", "质量评估", "语言数据", "译员生态", "翻译硬件",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["Google", "Microsoft", "DeepL", "Meta", "Amazon", "有道", "科大讯飞", "火山翻译", "腾讯翻译", "百度翻译", "RWS", "TransPerfect", "Lionbridge"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "模型发布": "引擎发布", "引擎上线": "引擎发布", "新引擎": "引擎发布", "引擎": "引擎发布", "发布": "引擎发布", "模型": "引擎发布", "MT引擎": "引擎发布",
  "机翻": "机器翻译", "MT": "机器翻译", "自动翻译": "机器翻译", "神经机器翻译": "机器翻译", "NMT": "机器翻译",
  "LLM翻译": "大模型翻译", "GPT翻译": "大模型翻译", "AI翻译": "大模型翻译", "大模型": "大模型翻译",
  "ASR": "语音识别", "自动语音识别": "语音识别", "语音转文字": "语音识别", "听写": "语音识别",
  "TTS": "语音合成", "文字转语音": "语音合成", "配音合成": "语音合成",
  "同传": "同声传译", "机器同传": "同声传译", "AI同传": "同声传译", "交替传译": "同声传译", "口译": "同声传译",
  "字幕": "字幕配音", "配音": "字幕配音", "视频翻译": "字幕配音", "译制": "字幕配音",
  "CAT": "计算机辅助翻译", "CAT工具": "计算机辅助翻译", "TMS": "计算机辅助翻译", "翻译记忆": "计算机辅助翻译", "Trados": "计算机辅助翻译",
  "localization": "本地化", "游戏本地化": "本地化", "软件本地化": "本地化", "国际化": "本地化",
  "出海": "出海国际化", "中国企业出海": "出海国际化", "跨境电商": "出海国际化",
  "post-editing": "译后编辑", "PE": "译后编辑", "机翻译后编辑": "译后编辑", "人机协作": "译后编辑", "人工校对": "译后编辑",
  "术语": "术语管理", "termbase": "术语管理", "术语库": "术语管理",
  "质量评测": "质量评估", "翻译质量": "质量评估", "MQM": "质量评估", "质检": "质量评估",
  "语料": "语言数据", "语料库": "语言数据", "数据集": "语言数据", "平行语料": "语言数据", "平行文本": "语言数据",
  "译者": "译员生态", "翻译职业": "译员生态", "译员": "译员生态", "翻译人才": "译员生态", "翻译教育": "译员生态",
  "翻译机": "翻译硬件", "翻译耳机": "翻译硬件", "词典笔": "翻译硬件", "同传耳机": "翻译硬件",
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", "合作/生态": "行业动态", "融资/收购": "行业动态", "公司动态": "行业动态",
  合作: "行业动态", 生态: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态", 财报: "行业动态",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 标准: "政策/监管",
  质量: "质量/合规", 合规: "质量/合规", 隐私: "质量/合规", "数据安全": "质量/合规", "保密": "质量/合规", "泄密": "质量/合规",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  教程: "教程/实践", 玩法: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践",
  产品: "产品更新", 更新: "产品更新", 趋势: "现象/趋势", 现象: "现象/趋势", 观点: "大佬观点", 访谈: "大佬观点",
  "非行业": "通用/非行业", "non-industry": "通用/非行业", 通用工具: "通用/非行业", 行业: "行业动态", 动态: "行业动态",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  deepl: { name: "DeepL", displayTag: "DeepL", aliases: ["DeepL", "DeepL Pro", "DeepL Write", "Linguee"], otherNames: ["DeepL SE", "deepL"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "Google 翻译", "Google Translate", "谷歌", "谷歌翻译"], otherNames: ["Google Cloud", "Google AI", "Google Research", "DeepMind"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Microsoft Translator", "Azure"], otherNames: ["Microsoft Azure", "Azure AI", "Azure Cognitive Services"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "NLLB", "SeamlessM4T", "Seamless"], otherNames: ["Meta AI", "Facebook"] },
  amazon: { name: "Amazon", displayTag: "Amazon", aliases: ["Amazon", "AWS", "亚马逊"], otherNames: ["Amazon Web Services", "Amazon Translate", "Amazon Transcribe", "Amazon Polly"] },
  iflytek: { name: "科大讯飞", displayTag: "科大讯飞", aliases: ["科大讯飞", "讯飞", "iFlytek"], otherNames: ["讯飞翻译", "讯飞听见", "讯飞开放平台"] },
  youdao: { name: "网易有道", displayTag: "有道", aliases: ["有道", "网易有道", "Youdao"], otherNames: ["有道翻译", "有道词典", "有道智云"] },
  volcengine: { name: "火山翻译", displayTag: "火山翻译", aliases: ["火山翻译", "字节跳动", "ByteDance"], otherNames: ["火山引擎", "Volcengine", "字节"] },
  tencent: { name: "腾讯翻译", displayTag: "腾讯翻译", aliases: ["腾讯", "腾讯翻译", "腾讯翻译君", "TranSmart"], otherNames: ["腾讯云", "腾讯交互翻译"] },
  alibaba: { name: "阿里翻译", displayTag: null, aliases: ["阿里", "阿里巴巴", "阿里翻译", "Alibaba"], otherNames: ["阿里云", "达摩院", "Alibaba Cloud"] },
  baidu: { name: "百度翻译", displayTag: "百度翻译", aliases: ["百度", "百度翻译", "Baidu"], otherNames: ["百度智能云"] },
  rws: { name: "RWS", displayTag: "RWS", aliases: ["RWS", "RWS Holdings", "SDL"], otherNames: ["RWS 集团"] },
  transperfect: { name: "TransPerfect", displayTag: "TransPerfect", aliases: ["TransPerfect"], otherNames: ["TransPerfect Connect"] },
  lionbridge: { name: "Lionbridge", displayTag: "Lionbridge", aliases: ["Lionbridge", "莱博智"], otherNames: ["Lionbridge Technologies"] },
  phrase: { name: "Phrase", displayTag: null, aliases: ["Phrase", "Memsource"], otherNames: ["PhraseApp"] },
  smartcat: { name: "Smartcat", displayTag: null, aliases: ["Smartcat"] },
  crowdin: { name: "Crowdin", displayTag: null, aliases: ["Crowdin"] },
  lilt: { name: "Lilt", displayTag: null, aliases: ["Lilt"] },
  welocalize: { name: "Welocalize", displayTag: null, aliases: ["Welocalize"] },
  languageline: { name: "LanguageLine", displayTag: null, aliases: ["LanguageLine", "LanguageLine Solutions"] },
  wordly: { name: "Wordly", displayTag: null, aliases: ["Wordly"] },
  kudo: { name: "KUDO", displayTag: null, aliases: ["KUDO"], otherNames: ["KUDO AI"] },
  timekettle: { name: "时空壶", displayTag: null, aliases: ["时空壶", "Timekettle"] },
  gtcom: { name: "中译语通", displayTag: null, aliases: ["中译语通", "GTCOM"] },
  transn: { name: "传神语联", displayTag: null, aliases: ["传神", "传神语联", "Transn"] },
  translated: { name: "Translated", displayTag: null, aliases: ["Translated", "ModernMT"], otherNames: ["Translated.com"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "deepl", name: "DeepL", patterns: [/deepl|linguee/i] },
  { id: "google", name: "Google", patterns: [/google|谷歌/i] },
  { id: "microsoft", name: "Microsoft", patterns: [/microsoft|微软|azure/i] },
  { id: "meta", name: "Meta", patterns: [/\bMeta\b|\bNLLB\b|SeamlessM4T|No Language Left Behind/i, /\bmeta\s?ai\b|\bFAIR\b/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "iflytek", name: "科大讯飞", patterns: [/科大讯飞|讯飞|iflytek/i] },
  { id: "youdao", name: "网易有道", patterns: [/有道|网易有道|youdao/i] },
  { id: "volcengine", name: "火山翻译 / 字节", patterns: [/火山翻译|火山引擎|字节|bytedance|volcengine/i] },
  { id: "tencent", name: "腾讯翻译", patterns: [/腾讯|tencent|transmart|翻译君/i] },
  { id: "alibaba", name: "阿里翻译", patterns: [/阿里|alibaba|aliyun|达摩院/i] },
  { id: "baidu", name: "百度翻译", patterns: [/百度|baidu/i] },
  { id: "rws", name: "RWS", patterns: [/\brws\b|sdl/i] },
  { id: "transperfect", name: "TransPerfect", patterns: [/transperfect/i] },
  { id: "lionbridge", name: "Lionbridge", patterns: [/lionbridge|莱博智/i] },
  { id: "phrase", name: "Phrase", patterns: [/\bphrase\b|memsource|phraseapp/i] },
  { id: "smartcat", name: "Smartcat", patterns: [/smartcat/i] },
  { id: "crowdin", name: "Crowdin", patterns: [/crowdin/i] },
  { id: "lilt", name: "Lilt", patterns: [/\blilt\b/i] },
  { id: "welocalize", name: "Welocalize", patterns: [/welocalize/i] },
  { id: "languageline", name: "LanguageLine", patterns: [/languageline/i] },
  { id: "wordly", name: "Wordly", patterns: [/\bwordly\b/i] },
  { id: "kudo", name: "KUDO", patterns: [/\bkudo\b/i] },
  { id: "timekettle", name: "时空壶", patterns: [/时空壶|timekettle/i] },
  { id: "gtcom", name: "中译语通", patterns: [/中译语通|gtcom/i] },
  { id: "transn", name: "传神语联", patterns: [/传神|transn/i] },
  { id: "translated", name: "Translated", patterns: [/translated\.com|modernmt/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "deepl", domains: ["deepl.com", "news.deepl.com"] },
  { entityId: "google", domains: ["translate.googleblog.com", "cloud.google.com", "research.google", "ai.google"] },
  { entityId: "microsoft", domains: ["microsoft.com", "azure.microsoft.com", "blogs.bing.com"] },
  { entityId: "meta", domains: ["ai.meta.com", "engineering.fb.com"] },
  { entityId: "amazon", domains: ["aws.amazon.com"] },
  { entityId: "iflytek", domains: ["iflytek.com"] },
  { entityId: "youdao", domains: ["youdao.com", "corp.163.com"] },
  { entityId: "volcengine", domains: ["volcengine.com", "bytedance.com"] },
  { entityId: "tencent", domains: ["cloud.tencent.com", "tencent.com"] },
  { entityId: "alibaba", domains: ["alibabacloud.com", "aliyun.com"] },
  { entityId: "baidu", domains: ["baidu.com"] },
  { entityId: "rws", domains: ["rws.com"] },
  { entityId: "transperfect", domains: ["transperfect.com"] },
  { entityId: "lionbridge", domains: ["lionbridge.com"] },
  { entityId: "phrase", domains: ["phrase.com", "memsource.com"] },
  { entityId: "smartcat", domains: ["smartcat.com"] },
  { entityId: "crowdin", domains: ["crowdin.com"] },
  { entityId: "lilt", domains: ["lilt.com"] },
  { entityId: "welocalize", domains: ["welocalize.com"] },
  { entityId: "kudo", domains: ["kudo.ai"] },
  { entityId: "timekettle", domains: ["timekettle.co", "timekettle.cn"] },
  { entityId: "gtcom", domains: ["gtcom.com.cn"] },
  { entityId: "transn", domains: ["transn.com"] },
  { entityId: "translated", domains: ["translated.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "deepl", pattern: /@DeepLcom\b|@deepl\b/i },
  { entityId: "volcengine", pattern: /@VolcengineMT\b|火山翻译团队/i },
];
