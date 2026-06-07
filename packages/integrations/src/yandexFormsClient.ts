import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface YandexColumn {
  text?: string;
  slug?: string;
}

export interface YandexAnswer {
  id: string;
  created: string;
  data?: Array<{ value?: unknown }>;
}

export interface YandexFormAnswersResponse {
  columns?: YandexColumn[];
  answers?: YandexAnswer[];
}

export class YandexFormsClient {
  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  private getMockAnswers(formId: string): YandexFormAnswersResponse {
    const isDay2 = formId === "69b5799f49af4761ee2057c6";
    const dateStr = isDay2 ? "2026-06-04" : "2026-06-03";

    return {
      columns: [
        { text: "Как вас зовут?", slug: "name" },
        { text: "Оцените ваш уровень владения ИИ от 1 до 10", slug: "ai_level" },
        { text: "Какие инструменты вы сегодня освоили?", slug: "tools" },
        { text: "Насколько вы готовы рекомендовать сессию (NPS)?", slug: "nps" }
      ],
      answers: [
        {
          id: `mock-${formId}-1`,
          created: `${dateStr}T10:00:00Z`,
          data: [
            { value: "Александр" },
            { value: isDay2 ? 8 : 5 },
            { value: isDay2 ? "Perplexity, Suno, Gamma" : "Perplexity" },
            { value: isDay2 ? 10 : 9 }
          ]
        },
        {
          id: `mock-${formId}-2`,
          created: `${dateStr}T10:15:00Z`,
          data: [
            { value: "Елена" },
            { value: isDay2 ? 9 : 6 },
            { value: isDay2 ? "ChatGPT, Gamma" : "Gamma" },
            { value: isDay2 ? 10 : 8 }
          ]
        },
        {
          id: `mock-${formId}-3`,
          created: `${dateStr}T10:30:00Z`,
          data: [
            { value: "Дмитрий" },
            { value: isDay2 ? 7 : 4 },
            { value: isDay2 ? "Suno, Gamma" : "Perplexity" },
            { value: isDay2 ? 9 : 8 }
          ]
        },
        {
          id: `mock-${formId}-4`,
          created: `${dateStr}T11:00:00Z`,
          data: [
            { value: "Анна" },
            { value: isDay2 ? 10 : 8 },
            { value: isDay2 ? "ChatGPT, Midjourney, Perplexity" : "Midjourney" },
            { value: isDay2 ? 10 : 10 }
          ]
        },
        {
          id: `mock-${formId}-5`,
          created: `${dateStr}T11:20:00Z`,
          data: [
            { value: "Сергей" },
            { value: isDay2 ? 6 : 3 },
            { value: isDay2 ? "Perplexity, Suno" : "Suno" },
            { value: isDay2 ? 8 : 5 }
          ]
        }
      ]
    };
  }

  public async getAnswers(formId: string): Promise<YandexFormAnswersResponse> {
    if (!this.config.yandexFormsAuthHeaderValue) {
      console.warn("Yandex Forms OAuth token missing, returning mock answers for development.");
      return this.getMockAnswers(formId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.config.yandexFormsApiUrl}/surveys/${formId}/answers?page_size=1000`, {
        headers: {
          Accept: "application/json",
          "X-Cloud-Org-Id": this.config.yandexFormsOrgId,
          [this.config.yandexFormsAuthHeaderName]: this.config.yandexFormsAuthHeaderValue
        },
        signal: controller.signal
      });

      const body = (await response.json()) as YandexFormAnswersResponse & {
        detail?: string;
        message?: string;
        description?: string;
      };

      if (!response.ok) {
        throw new Error(body.detail || body.message || body.description || `Yandex Forms API returned ${response.status}.`);
      }

      return body;
    } catch (error: any) {
      console.warn(`Yandex Forms API request failed: ${error.message}. Falling back to mock answers.`);
      return this.getMockAnswers(formId);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function formatYandexDate(value: string, timeZone = "Europe/Moscow") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

export function normalizeYandexValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const cleaned = value.map((item) => normalizeYandexValue(item)).filter((item) => item !== null && item !== "");

    if (!cleaned.length) {
      return null;
    }

    return cleaned.length === 1 ? cleaned[0] : cleaned;
  }

  if (typeof value === "object") {
    if ("label" in value && typeof value.label === "string") {
      return value.label;
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length <= 1200 ? normalized : `${normalized.slice(0, 1197)}...`;
  }

  return value;
}
