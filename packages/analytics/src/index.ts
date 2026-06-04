import type { ProcessRun, ProcessStep } from "@tools/core";
export { yandexFormIds, yandexFormSources, type YandexFormKind, type YandexFormSource } from "./yandexForms";
export { buildDay1ReportMessages, type Day1ReportPromptInput } from "./day1Report";

export interface AnalyticsBlock {
  id: "day1" | "day2" | "overall" | "nps" | "media" | "publish";
  title: string;
  enabled: boolean;
  description: string;
}

export const analyticsBlocks: AnalyticsBlock[] = [
  {
    id: "day1",
    title: "День 1",
    enabled: true,
    description: "Входные и выходные формы, нормализация, метрики и первая аналитическая записка."
  },
  {
    id: "day2",
    title: "День 2",
    enabled: true,
    description: "Отдельная аналитика второго дня с опциональным сравнением с Днем 1."
  },
  {
    id: "overall",
    title: "Общая аналитика",
    enabled: true,
    description: "Синтез выбранных дней и итоговые рекомендации."
  },
  {
    id: "nps",
    title: "NPS",
    enabled: false,
    description: "Расчет promoters/passives/detractors и интерпретация результата."
  },
  {
    id: "media",
    title: "Фото/медиа",
    enabled: false,
    description: "Файлы, подписи и optional dashboard image."
  },
  {
    id: "publish",
    title: "Публикация",
    enabled: true,
    description: "Создание или обновление документа в Outline."
  }
];

export const analyticsSteps: ProcessStep[] = [
  {
    id: "fetch-forms",
    title: "Загрузка форм",
    description: "Yandex Forms snapshots для выбранной сессии.",
    status: "succeeded"
  },
  {
    id: "normalize",
    title: "Нормализация",
    description: "Mapping ответов, расчет базовых метрик, проверка структуры.",
    status: "succeeded",
    dependsOn: ["fetch-forms"]
  },
  {
    id: "llm",
    title: "LLM аналитика",
    description: "Prompt version, structured output и provider request audit.",
    status: "running",
    dependsOn: ["normalize"]
  },
  {
    id: "media",
    title: "Медиа",
    description: "Optional фото и dashboard image.",
    status: "pending",
    dependsOn: ["llm"]
  },
  {
    id: "publish",
    title: "Outline",
    description: "Публикация итоговой аналитической записки.",
    status: "pending",
    dependsOn: ["llm"]
  }
];

export const latestAnalyticsRun: ProcessRun = {
  id: "analytics-run-001",
  toolType: "analytics",
  title: "Аналитика День 1 + День 2",
  status: "running",
  progress: 64,
  startedAt: "2026-06-04 13:40",
  steps: analyticsSteps
};
