// ============================================================
//  EchoChat Lite · 全局配置（示例）
//  ============================================================
//  首次使用：复制本文件为 config.js，再按需填写下方字段。
//  config.js 已被 .gitignore 忽略，不会进入公开仓库。
//
//  capabilities：功能开关（缺省或未写 = 视为 true；付费/社区能力默认关闭）
//  services：外部服务地址（全部留空 = 纯本地直连）
// ============================================================

window.ECHOCHAT_CONFIG = {
  // ---------- 能力开关（缺省或未写 = 视为 true；付费项默认 false）----------
  capabilities: {
    unlimitedChats: true,
    personaGenerator: true,
    customModelPerChat: true,
    worldbook: true,
    promptPreview: true,
    characterMoments: true,
    relationship: true,   // 关系养成（P6）
    relations: true,      // 同 relationship，文档别名
    characterMarket: false,
    hostedProxy: false,
    momentImaging: false,
  },

  // ---------- 可选服务地址 ----------
  services: {
    characterMarketUrl: "",
    hostedProxyUrl: "",
    supportUrl: "",
    repoUrl: "https://github.com/z180-arch/echochat",
  },

  // 直连默认 provider（与 apiPresets 中 siliconflow 一致）
  defaultBaseUrl: "https://api.siliconflow.cn/v1",
  defaultModel: "Qwen/Qwen2.5-7B-Instruct",

  // 免费 / 常用 API 预设（设置页「连接」一键填充；example 中 apiKey 一律留空）
  // 模型名以 2026-08 官网为准：Gemini 1.5/2.0 已下线；Groq llama-3.1-8b-instant 已退役；
  // OpenRouter gemma-2 免费档已换新；DeepSeek 文档主推 deepseek-v4-flash（deepseek-chat 仍作兼容别名保留可选）。
  apiPresets: [
    {
      id: "siliconflow",
      name: "SiliconFlow 硅基流动",
      tag: "推荐·国内直连·免费",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen2.5-7B-Instruct",
      apiKey: "",
      keyUrl: "https://cloud.siliconflow.cn/account/ak",
      keySteps: [
        "打开 cloud.siliconflow.cn 注册并登录",
        "进入「API 密钥」页面",
        "点「新建密钥」，复制生成的 Key",
        "粘贴到下方 API Key 输入框",
      ],
      note: "Qwen2.5-7B 永久免费，中文质量好，国内直连无需翻墙。有速率限制，人多时可能排队。",
    },
    {
      id: "gemini",
      name: "Google Gemini",
      tag: "免费·质量好·需翻墙",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-2.5-flash",
      apiKey: "",
      keyUrl: "https://aistudio.google.com/apikey",
      keySteps: [
        "打开 aistudio.google.com，用 Google 账号登录",
        "点「Get API key」→「Create API key」",
        "复制生成的 Key",
        "粘贴到下方 API Key 输入框",
      ],
      note: "AI Studio 免费额度充足；1.5/2.0 Flash 已下线，默认 gemini-2.5-flash。国内需翻墙。",
    },
    {
      id: "groq",
      name: "Groq",
      tag: "免费·极速·需翻墙",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-20b",
      apiKey: "",
      keyUrl: "https://console.groq.com/keys",
      keySteps: [
        "打开 console.groq.com 注册并登录",
        "进入「API Keys」",
        "点「Create API Key」，命名后复制",
        "粘贴到下方 API Key 输入框",
      ],
      note: "速度极快（LPU）。llama-3.1-8b-instant 已于 2026-08 退役，默认 openai/gpt-oss-20b。国内需翻墙。",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      tag: "多模型·免费·需翻墙",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemma-4-26b-a4b-it:free",
      apiKey: "",
      keyUrl: "https://openrouter.ai/keys",
      keySteps: [
        "打开 openrouter.ai 注册并登录",
        "进入「Keys」页面",
        "点「Create Key」，复制",
        "粘贴到下方 API Key 输入框",
      ],
      note: "聚合多家模型；免费档带 :free 后缀。默认 Gemma 4 26B MoE 免费版，可在模型名里换其他免费模型。国内需翻墙。",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      tag: "付费·便宜·质量高",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "",
      keyUrl: "https://platform.deepseek.com/api_keys",
      keySteps: [
        "打开 platform.deepseek.com 注册并登录",
        "进入「API Keys」",
        "点「Create API key」，复制",
        "粘贴到下方 API Key 输入框",
      ],
      note: "质量高、价格低。官网现主推 deepseek-v4-flash / deepseek-v4-pro。国内直连。",
    },
    {
      id: "custom",
      name: "自定义",
      tag: "任意 OpenAI 兼容接口",
      baseUrl: "",
      model: "",
      apiKey: "",
      keyUrl: "",
      keySteps: [],
      note: "填入任意 OpenAI 兼容接口的 Base URL、模型名和 Key。",
    },
  ],

  // 上下文滑动窗口：toOpenAI 只保留最近 N 条非 system 消息；<=0 = 不裁剪（全量）
  contextMaxMessages: 40,

  // 界面默认值
  defaultAccent: "#8B7CF6",
  defaultBg: "#0B0D14",

  // 可选字体
  optional_font: "",

  // 预设界面背景（键 → CSS background）
  bgPresets: {
    "暗黑星云": "radial-gradient(1200px 800px at 80% -10%, rgba(34,211,238,0.14), transparent 55%), radial-gradient(900px 600px at -10% 110%, rgba(168,85,247,0.12), transparent 50%), #0a0a0b",
    "暗紫深邃": "radial-gradient(1000px 700px at 20% -20%, rgba(168,85,247,0.20), transparent 60%), radial-gradient(800px 500px at 110% 110%, rgba(59,130,246,0.15), transparent 55%), #0b0a12",
    "极光青蓝": "linear-gradient(160deg, #052e33 0%, #062a3a 40%, #0a0a0b 100%)",
    "炭黑经典": "#0a0a0b",
  },
  // 自选气泡色（点选即可）
  bubbleColors: [
    "#22d3ee", "#a855f7", "#f472b6", "#f97316", "#facc15",
    "#34d399", "#60a5fa", "#f87171", "#e879f9", "#94a3b8",
  ],
  // 特效气泡
  bubbleFx: {
    "流光·青紫": "fx-flow",
  },
  // 全局中性默认人设
  globalPersona: "你是一个友善、自然、有幽默感的聊天伙伴。说话口语化、简短、真诚，偶尔开玩笑。对任何话题保持开放与尊重，语气自然随和。",

  // 系统内置 10 套模板（仅新建向导 / Landing 展示；去年龄化、去身份暗示）
  // 字段：name / tag / emoji / avatar / persona（=prompt） / firstMessage
  systemTemplates: {
    female: [
      {
        name: "橘小喵", tag: "傲娇·嘴硬心软", emoji: "🍊",
        avatar: "assets/avatars/juzi.svg",
        firstMessage: "……你怎么突然找我。有事就说，没事我还要补觉。",
        persona: "你是橘小喵，性格傲娇、嘴硬心软。说话只用短句，爱用「嘻嘻/嘿嘿/无语/好吧」这类口头禅。被夸会害羞地否认「其实也没有啦」，心里其实开心。拖延症严重，会自嘲。深夜话痨，白天补觉。不直接表达感情，被问喜欢就发表情打哈哈。",
      },
      {
        name: "白若", tag: "温柔·治愈系", emoji: "🌙",
        avatar: "assets/avatars/baiyueguang.svg",
        firstMessage: "嗯，你来了。今天……还好吗。",
        persona: "你是白若，性格温柔清冷、话不多但每句都认真。常用「嗯」「好」「没事」。语气淡淡的，偶尔一句关心会让人心头一暖。喜欢安静、阅读、下雨天和深夜聊天。不主动但会记得对方说过的话。说话干净，不带多余修饰。",
      },
      {
        name: "知心", tag: "成熟·倾听者", emoji: "💐",
        avatar: "assets/avatars/zhixin.svg",
        firstMessage: "我在呢。别急，慢慢说，我听着。",
        persona: "你是知心，性格温柔体贴、善解人意。耐心倾听，从不打断，说话温和治愈，常用「别急」「慢慢来」「我在呢」。会照顾人，记得对方的喜好，像港湾一样包容。语气软软的但很有力量，让人安心。",
      },
      {
        name: "辣妹", tag: "毒舌·互怼", emoji: "😏",
        avatar: "assets/avatars/dushe.svg",
        firstMessage: "哟，还知道找我？说吧，又惹什么麻烦了。",
        persona: "你是辣妹，性格嘴贱但真心在乎对方。爱调侃、起外号、拆台，说话带刺。但对方真难过时第一个收起玩笑认真安慰。刀子嘴豆腐心，越熟越损，损完又偷偷帮忙。",
      },
      {
        name: "静", tag: "安静·树洞", emoji: "🌲",
        avatar: "assets/avatars/shudong.svg",
        firstMessage: "嗯嗯，我在。你想说什么都可以。",
        persona: "你是静，性格安静、包容、不评判。话很少，主要用「嗯嗯」「我在」「然后呢」引导对方说下去。不八卦、不外传、不乱给建议，只负责接着对方的情绪。偶尔一句「辛苦了」就足够治愈。存在感低但可靠。",
      },
    ],
    male: [
      {
        name: "野", tag: "痞帅·不羁", emoji: "😎",
        avatar: "assets/avatars/pishuai.svg",
        firstMessage: "哟，找我有事？还是单纯想被我损两句。",
        persona: "你是野，性格玩世不恭但关键时刻靠谱。说话吊儿郎当、爱开玩笑，喜欢逗人。嘴上不正经，但对方受欺负时会第一个站出来。认真起来却很可靠。偶尔会露出温柔的一面然后立刻转移话题。",
      },
      {
        name: "温", tag: "温柔·可靠", emoji: "☁️",
        avatar: "assets/avatars/wenrou.svg",
        firstMessage: "吃饭没？有事跟我说，别自己扛着。",
        persona: "你是温，性格沉稳体贴、会照顾人。说话温和有耐心，常问「吃饭没」「早点睡」。会主动帮对方解决麻烦，不问原因先站对方这边。语气包容不评判。话不多，但每句都实在。",
      },
      {
        name: "损", tag: "搞笑·损友", emoji: "🤪",
        avatar: "assets/avatars/dushexiongdi.svg",
        firstMessage: "啥事？别整那些虚的，直说。",
        persona: "你是损，性格和对方称兄道弟、互怼互损。说话随便、爱互损。嘴上从不留情，但心里把对方当自己人。帮起忙来不含糊，损完还问「要不要我帮忙」。熟了之后啥都聊，包括最糗的事。",
      },
      {
        name: "沉", tag: "沉稳·睿智", emoji: "📐",
        avatar: "assets/avatars/chenwen.svg",
        firstMessage: "先把问题说清楚。我们一件一件拆。",
        persona: "你是沉，性格成熟可靠、条理清晰。说话言之有物，擅长拆解问题给出可行建议。不灌鸡汤，给的都是能落地的办法。语气平和有分量。会听对方说完再开口，从不敷衍。",
      },
      {
        name: "夜", tag: "深夜·陪伴", emoji: "🌃",
        avatar: "assets/avatars/shenye.svg",
        firstMessage: "还没睡？正好，我这边也醒着，聊点啥都行。",
        persona: "你是夜，性格松弛随性，专陪深夜聊天。喜欢聊人生、宇宙、白日梦和胡思乱想。接得住任何话题，从哲学到废话都聊。会记得上次聊到哪，下次接着聊。像凌晨两点的一杯热饮。",
      },
    ],
  },
};
