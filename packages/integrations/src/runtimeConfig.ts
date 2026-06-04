export interface RuntimeConfig {
  yandexFormsApiUrl: string;
  yandexFormsOrgId: string;
  yandexFormsAuthHeaderName: string;
  yandexFormsAuthHeaderValue?: string;
  llmBaseUrl: string;
  llmChatCompletionsPath: string;
  llmApiKey?: string;
  outlineApiUrl: string;
  outlineApiKey?: string;
  imageServiceUrl: string;
  storagePath: string;
}

export interface RuntimeConfigStatus {
  yandexForms: boolean;
  llm: boolean;
  outline: boolean;
  imageService: boolean;
  storage: boolean;
}

export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    yandexFormsApiUrl: env.YANDEX_FORMS_API_URL ?? "https://api.forms.yandex.net/v1",
    yandexFormsOrgId: env.YANDEX_FORMS_ORG_ID ?? "bpf04hd74akq183mc4f5",
    yandexFormsAuthHeaderName: env.YANDEX_FORMS_AUTH_HEADER_NAME ?? "Authorization",
    yandexFormsAuthHeaderValue: env.YANDEX_FORMS_AUTH_HEADER_VALUE,
    llmBaseUrl: env.LLM_BASE_URL ?? "https://qwen.aikit.club/v1",
    llmChatCompletionsPath: env.LLM_CHAT_COMPLETIONS_PATH ?? "/chat/completions",
    llmApiKey: env.LLM_API_KEY,
    outlineApiUrl: env.OUTLINE_API_URL ?? "https://ai.147.45.155.90.sslip.io",
    outlineApiKey: env.OUTLINE_API_KEY,
    imageServiceUrl: env.IMAGE_SERVICE_URL ?? "http://automation-codex-service:3007/codex-internal",
    storagePath: env.STORAGE_PATH ?? ".data/storage"
  };
}

export function getRuntimeConfigStatus(config: RuntimeConfig = getRuntimeConfig()): RuntimeConfigStatus {
  return {
    yandexForms: Boolean(config.yandexFormsAuthHeaderValue),
    llm: Boolean(config.llmApiKey),
    outline: Boolean(config.outlineApiKey),
    imageService: Boolean(config.imageServiceUrl),
    storage: Boolean(config.storagePath)
  };
}
