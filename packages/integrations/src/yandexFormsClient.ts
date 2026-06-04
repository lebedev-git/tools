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

  public async getAnswers(formId: string): Promise<YandexFormAnswersResponse> {
    if (!this.config.yandexFormsAuthHeaderValue) {
      throw new Error("YANDEX_FORMS_AUTH_HEADER_VALUE is not configured.");
    }

    const response = await fetch(`${this.config.yandexFormsApiUrl}/surveys/${formId}/answers?page_size=1000`, {
      headers: {
        Accept: "application/json",
        "X-Cloud-Org-Id": this.config.yandexFormsOrgId,
        [this.config.yandexFormsAuthHeaderName]: this.config.yandexFormsAuthHeaderValue
      }
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
