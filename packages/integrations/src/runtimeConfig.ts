import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPrompt } from "@tools/db";

// Programmatically load .env files if LLM_API_KEY is not already configured
if (!process.env.LLM_API_KEY && typeof process.loadEnvFile === "function") {
  try {
    if (existsSync(".env")) {
      process.loadEnvFile(".env");
    } else if (existsSync(join(process.cwd(), "apps/worker/.env"))) {
      process.loadEnvFile(join(process.cwd(), "apps/worker/.env"));
    } else if (existsSync(join(process.cwd(), "../../.env"))) {
      process.loadEnvFile(join(process.cwd(), "../../.env"));
    }
  } catch (err) {
    console.warn("Failed to programmatically load .env file:", err);
  }
}

export interface RuntimeConfig {
  yandexFormsApiUrl: string;
  yandexFormsOrgId: string;
  yandexFormsAuthHeaderName: string;
  yandexFormsAuthHeaderValue?: string;
  llmBaseUrl: string;
  llmChatCompletionsPath: string;
  llmApiKey?: string;
  llmModel?: string;
  geminiApiKey?: string;
  geminiApiKeyAnalytics?: string;
  geminiApiKeyProtocols?: string;
  geminiBaseUrl?: string;
  geminiBaseUrlAnalytics?: string;
  geminiBaseUrlProtocols?: string;
  deepgramApiKey?: string;
  deepgramModel?: string;
  deepgramBaseUrl?: string;
  outlineApiUrl: string;
  outlineApiKey?: string;
  imageServiceUrl: string;
  imageServiceApiKey?: string;
  storagePath: string;
  openNotebookApiUrl: string;
  openNotebookPassword?: string;
  imageModel?: string;
  geminiModelAnalytics?: string;
  geminiModelProtocols?: string;
}

export interface RuntimeConfigStatus {
  yandexForms: boolean;
  llm: boolean;
  gemini: boolean;
  deepgram: boolean;
  outline: boolean;
  imageService: boolean;
  storage: boolean;
  openNotebook: boolean;
}

export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const extraLlm = getPrompt("config.extra_llm_keys", "");
  const baseLlm = env.LLM_API_KEY ?? "";
  const llmApiKey = [baseLlm, extraLlm].map(k => k.trim()).filter(Boolean).join(",");

  const extraGemini = getPrompt("config.extra_gemini_keys", "");
  const extraGeminiAnalytics = getPrompt("config.extra_gemini_keys_analytics", "");
  const extraGeminiProtocols = getPrompt("config.extra_gemini_keys_protocols", "");
  const baseGemini = env.GEMINI_API_KEY ?? "";
  const geminiApiKey = [baseGemini, extraGemini].map(k => k.trim()).filter(Boolean).join(",");
  const geminiApiKeyAnalytics = [baseGemini, extraGeminiAnalytics || extraGemini].map(k => k.trim()).filter(Boolean).join(",");
  const geminiApiKeyProtocols = [baseGemini, extraGeminiProtocols || extraGemini].map(k => k.trim()).filter(Boolean).join(",");

  const geminiBaseUrlAnalytics = getPrompt("config.gemini_base_url_analytics", env.GEMINI_BASE_URL ?? "") || undefined;
  const geminiBaseUrlProtocols = getPrompt("config.gemini_base_url_protocols", env.GEMINI_BASE_URL ?? "") || undefined;

  const extraDeepgram = getPrompt("config.extra_deepgram_keys", "");
  const baseDeepgram = env.DEEPGRAM_API_KEY ?? "";
  const deepgramApiKey = [baseDeepgram, extraDeepgram].map(k => k.trim()).filter(Boolean).join(",");

  const llmModel = getPrompt("config.llm_model", env.LLM_MODEL ?? "qwen3.7-max");
  const deepgramModel = getPrompt("config.deepgram_model", env.DEEPGRAM_MODEL ?? "nova-2");

  const geminiModelAnalytics = getPrompt("config.gemini_model_analytics", "gemini-2.5-flash");
  const geminiModelProtocols = getPrompt("config.gemini_model_protocols", "gemini-2.5-flash");

  const imageServiceApiKey = getPrompt("config.extra_image_service_key", env.IMAGE_SERVICE_API_KEY ?? "") || undefined;
  const imageServiceUrl = getPrompt("config.image_service_url", env.IMAGE_SERVICE_URL ?? "http://automation-codex-service:3007/codex-internal");
  const imageModel = getPrompt("config.image_model", "") || undefined;

  return {
    yandexFormsApiUrl: env.YANDEX_FORMS_API_URL ?? "https://api.forms.yandex.net/v1",
    yandexFormsOrgId: env.YANDEX_FORMS_ORG_ID ?? "bpf04hd74akq183mc4f5",
    yandexFormsAuthHeaderName: env.YANDEX_FORMS_AUTH_HEADER_NAME ?? "Authorization",
    yandexFormsAuthHeaderValue: env.YANDEX_FORMS_AUTH_HEADER_VALUE,
    llmBaseUrl: env.LLM_BASE_URL ?? "https://qwen.aikit.club/v1",
    llmChatCompletionsPath: env.LLM_CHAT_COMPLETIONS_PATH ?? "/chat/completions",
    llmApiKey,
    llmModel,
    geminiApiKey,
    geminiApiKeyAnalytics,
    geminiApiKeyProtocols,
    geminiBaseUrl: env.GEMINI_BASE_URL,
    geminiBaseUrlAnalytics,
    geminiBaseUrlProtocols,
    deepgramApiKey,
    deepgramModel,
    deepgramBaseUrl: env.DEEPGRAM_BASE_URL,
    outlineApiUrl: env.OUTLINE_API_URL ?? "https://ai.147.45.155.90.sslip.io",
    outlineApiKey: env.OUTLINE_API_KEY,
    imageServiceUrl,
    imageServiceApiKey,
    storagePath: env.STORAGE_PATH ?? ".data/storage",
    openNotebookApiUrl: env.OPEN_NOTEBOOK_API_URL ?? "http://127.0.0.1:5055",
    openNotebookPassword: env.OPEN_NOTEBOOK_PASSWORD,
    imageModel,
    geminiModelAnalytics,
    geminiModelProtocols
  };
}

export function getRuntimeConfigStatus(config: RuntimeConfig = getRuntimeConfig()): RuntimeConfigStatus {
  return {
    yandexForms: Boolean(config.yandexFormsAuthHeaderValue),
    llm: Boolean(config.llmApiKey),
    gemini: Boolean(config.geminiApiKey),
    deepgram: Boolean(config.deepgramApiKey),
    outline: Boolean(config.outlineApiKey),
    imageService: Boolean(config.imageServiceUrl),
    storage: Boolean(config.storagePath),
    openNotebook: Boolean(config.openNotebookApiUrl)
  };
}
