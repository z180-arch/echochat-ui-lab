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
        "进入 Keys 页面创建 API Key",
        "复制 Key 并粘贴到下方",
      ],
      note: "聚合多模型，有免费档。",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      tag: "高质量·需 Key",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "",
      keyUrl: "https://platform.deepseek.com/api_keys",
      keySteps: [
        "打开 platform.deepseek.com 注册",
        "创建 API Key 并复制",
      ],
      note: "中文与代码能力强。",
    },
    {
      id: "moonshot",
      name: "Moonshot 月之暗面",
      tag: "长上下文",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-8k",
      apiKey: "",
      keyUrl: "https://platform.moonshot.cn/console/api-keys",
      keySteps: ["注册并创建 API Key"],
      note: "支持长上下文。",
    },
    {
      id: "zhipu",
      name: "智谱 AI",
      tag: "国内直连",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4-flash",
      apiKey: "",
      keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
      keySteps: ["注册并创建 API Key"],
      note: "国内可用。",
    },
  ],

  // 内置角色模板（首次启动可选用）
  personaTemplates: [
    {
      id: "default",
      name: "默认助手",
      avatar: "assets/avatars/default.svg",
      system: "你是一个友好、有帮助的 AI 助手。",
    },
  ],
};
