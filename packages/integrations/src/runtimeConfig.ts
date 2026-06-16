import { existsSync } from "node:fs";
import { join } from "node:path";

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
  geminiBaseUrl?: string;
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
  return {
    yandexFormsApiUrl: env.YANDEX_FORMS_API_URL ?? "https://api.forms.yandex.net/v1",
    yandexFormsOrgId: env.YANDEX_FORMS_ORG_ID ?? "bpf04hd74akq183mc4f5",
    yandexFormsAuthHeaderName: env.YANDEX_FORMS_AUTH_HEADER_NAME ?? "Authorization",
    yandexFormsAuthHeaderValue: env.YANDEX_FORMS_AUTH_HEADER_VALUE,
    llmBaseUrl: env.LLM_BASE_URL ?? "https://qwen.aikit.club/v1",
    llmChatCompletionsPath: env.LLM_CHAT_COMPLETIONS_PATH ?? "/chat/completions",
    llmApiKey: env.LLM_API_KEY,
    llmModel: env.LLM_MODEL ?? "qwen3.7-max",
    geminiApiKey: env.GEMINI_API_KEY,
    geminiBaseUrl: env.GEMINI_BASE_URL,
    deepgramApiKey: env.DEEPGRAM_API_KEY,
    deepgramModel: env.DEEPGRAM_MODEL ?? "nova-2",
    deepgramBaseUrl: env.DEEPGRAM_BASE_URL,
    outlineApiUrl: env.OUTLINE_API_URL ?? "https://ai.147.45.155.90.sslip.io",
    outlineApiKey: env.OUTLINE_API_KEY,
    imageServiceUrl: env.IMAGE_SERVICE_URL ?? "http://automation-codex-service:3007/codex-internal",
    imageServiceApiKey: env.IMAGE_SERVICE_API_KEY,
    storagePath: env.STORAGE_PATH ?? ".data/storage",
    openNotebookApiUrl: env.OPEN_NOTEBOOK_API_URL ?? "http://127.0.0.1:5055",
    openNotebookPassword: env.OPEN_NOTEBOOK_PASSWORD
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
