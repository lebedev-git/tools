export interface IntegrationDescriptor {
  id: "yandex_forms" | "outline" | "llm_provider" | "file_storage" | "image_service";
  title: string;
  usedBy: Array<"analytics" | "protocol">;
  requiredEnv: string[];
}

export const integrationRegistry: IntegrationDescriptor[] = [
  {
    id: "yandex_forms",
    title: "Yandex Forms",
    usedBy: ["analytics", "protocol"],
    requiredEnv: ["YANDEX_FORMS_TOKEN"]
  },
  {
    id: "outline",
    title: "Outline",
    usedBy: ["analytics", "protocol"],
    requiredEnv: ["OUTLINE_API_URL", "OUTLINE_TOKEN"]
  },
  {
    id: "llm_provider",
    title: "OpenAI-compatible LLM provider",
    usedBy: ["analytics", "protocol"],
    requiredEnv: ["LLM_BASE_URL", "LLM_API_KEY"]
  },
  {
    id: "file_storage",
    title: "Local or server file storage",
    usedBy: ["analytics", "protocol"],
    requiredEnv: ["STORAGE_PATH"]
  },
  {
    id: "image_service",
    title: "Dashboard image service",
    usedBy: ["analytics"],
    requiredEnv: ["IMAGE_SERVICE_URL"]
  }
];

export { getRuntimeConfig, getRuntimeConfigStatus, type RuntimeConfig, type RuntimeConfigStatus } from "./runtimeConfig";
export {
  formatYandexDate,
  normalizeYandexValue,
  YandexFormsClient,
  type YandexAnswer,
  type YandexColumn,
  type YandexFormAnswersResponse
} from "./yandexFormsClient";
export { LlmClient, type ChatCompletionOptions, type ChatMessage } from "./llmClient";
