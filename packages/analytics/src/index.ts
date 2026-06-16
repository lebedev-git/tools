import type { ProcessRun, ProcessStep } from "@tools/core";
export { yandexFormIds, yandexFormSources, type YandexFormKind, type YandexFormSource } from "./yandexForms";
export { buildDay1ReportMessages, type Day1ReportPromptInput } from "./day1Report";

export interface AnalyticsBlock {
  id: "day1" | "day2" | "overall" | "products" | "infographic" | "logo" | "generalPhoto" | "publish";
  title: string;
  enabled: boolean;
  description: string;
}

export const analyticsBlocks: AnalyticsBlock[] = [
  {
    id: "day1",
    title: "День 1",
    enabled: true,
    description: "Анализ входных и выходных форм первого дня."
  },
  {
    id: "day2",
    title: "День 2",
    enabled: false,
    description: "Анализ результатов и прогресса второго дня."
  },
  {
    id: "overall",
    title: "Общая аналитика",
    enabled: false,
    description: "Синтез результатов сессии за все дни."
  },
  {
    id: "products",
    title: "Продукты",
    enabled: false,
    description: "Результаты стратегической сессии."
  },
  {
    id: "infographic",
    title: "Инфографика",
    enabled: false,
    description: "Создание инфографики."
  },
  {
    id: "logo",
    title: "Логотип",
    enabled: false,
    description: "Загрузка логотипа сессии."
  },
  {
    id: "generalPhoto",
    title: "Общее фото",
    enabled: false,
    description: "Загрузка общей фотографии участников."
  },
  {
    id: "publish",
    title: "Публикация",
    enabled: false,
    description: "Публикация отчетов и результатов в Open Notebook."
  }
];

export const analyticsSteps: ProcessStep[] = [
  {
    id: "fetch-forms",
    title: "Загрузка форм",
    description: "Снимки Яндекс Форм для выбранной сессии.",
    status: "succeeded"
  },
  {
    id: "normalize",
    title: "Нормализация",
    description: "Сопоставление ответов, расчет метрик, проверка структуры.",
    status: "succeeded",
    dependsOn: ["fetch-forms"]
  },
  {
    id: "llm",
    title: "ИИ-аналитика",
    description: "Генерация отчетов и ИИ-анализ ответов.",
    status: "running",
    dependsOn: ["normalize"]
  },
  {
    id: "media",
    title: "Медиа",
    description: "Загрузка изображений и создание инфографики.",
    status: "pending",
    dependsOn: ["llm"]
  },
  {
    id: "publish",
    title: "Публикация",
    description: "Сохранение и публикация результатов сессии.",
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
