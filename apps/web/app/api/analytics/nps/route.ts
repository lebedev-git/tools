import { yandexFormIds } from "@tools/analytics";
import { formatYandexDate, normalizeYandexValue, YandexFormsClient } from "@tools/integrations";

interface CustomNpsAnswer {
  answerId: string;
  created?: string;
  disabled?: boolean;
  answers?: Record<string, unknown>;
}

interface NpsRequest {
  day1Date?: string;
  day2Date?: string;
  customAnswers?: {
    day1Output?: { questionList: string[]; answers: CustomNpsAnswer[] };
    day2?: { questionList: string[]; answers: CustomNpsAnswer[] } | null;
  };
}

interface NpsBucket {
  label: string;
  date: string;
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number;
}

function findScore(value: unknown): number | null {
  const normalized = normalizeYandexValue(value);

  if (typeof normalized === "number" && normalized >= 0 && normalized <= 10) {
    return normalized;
  }

  if (typeof normalized === "string") {
    const match = normalized.match(/\b(10|[0-9])\b/);
    if (match) {
      return Number(match[1]);
    }
  }

  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      const score = findScore(item);
      if (score !== null) {
        return score;
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as NpsRequest;

  if (payload.day1Date && !/^\d{4}-\d{2}-\d{2}$/.test(payload.day1Date)) {
    return Response.json({ status: "error", message: "Дата Дня 1 должна быть в формате YYYY-MM-DD." }, { status: 400 });
  }

  if (payload.day2Date && !/^\d{4}-\d{2}-\d{2}$/.test(payload.day2Date)) {
    return Response.json({ status: "error", message: "Дата Дня 2 должна быть в формате YYYY-MM-DD." }, { status: 400 });
  }

  if (!payload.day1Date && !payload.day2Date) {
    return Response.json({ status: "error", message: "Выберите хотя бы одну дату для расчета NPS." }, { status: 400 });
  }

  try {
    const client = new YandexFormsClient();
    const targets = [
      payload.day1Date ? { label: "День 1", date: payload.day1Date, formId: yandexFormIds.day1Output } : null,
      payload.day2Date ? { label: "День 2", date: payload.day2Date, formId: yandexFormIds.day2 } : null
    ].filter(Boolean) as Array<{ label: string; date: string; formId: string }>;
    const buckets: NpsBucket[] = [];

    for (const target of targets) {
      const scores: number[] = [];

      let customTargetData = null;
      if (payload.customAnswers) {
        if (target.label === "День 1") {
          customTargetData = payload.customAnswers.day1Output;
        } else if (target.label === "День 2") {
          customTargetData = payload.customAnswers.day2;
        }
      }

      if (customTargetData && customTargetData.answers) {
        const npsQuestions = (customTargetData.questionList ?? []).filter((q: string) => {
          const text = q.toLowerCase();
          return (
            text.includes("nps") || 
            text.includes("рекоменд") || 
            text.includes("насколько готовы") ||
            text.includes("насколько вы готовы") ||
            text.includes("score")
          );
        });

        for (const answer of customTargetData.answers) {
          if (answer.disabled) {
            continue;
          }
          if (answer.created && formatYandexDate(answer.created) !== target.date) {
            continue;
          }

          for (const q of npsQuestions) {
            const val = answer.answers?.[q];
            const score = findScore(val);
            if (score !== null) {
              scores.push(score);
              break;
            }
          }
        }
      } else {
        const response = await client.getAnswers(target.formId);
        const columns = response.columns ?? [];

        // Find columns related to NPS/score specifically
        const npsColIndexes: number[] = [];
        columns.forEach((col, idx) => {
          const text = (col.text || "").toLowerCase();
          const slug = (col.slug || "").toLowerCase();
          if (
            text.includes("nps") || 
            text.includes("рекоменд") || 
            text.includes("насколько готовы") ||
            text.includes("насколько вы готовы") ||
            slug.includes("nps") || 
            slug.includes("score")
          ) {
            npsColIndexes.push(idx);
          }
        });

        for (const answer of response.answers ?? []) {
          if (formatYandexDate(answer.created) !== target.date) {
            continue;
          }

          // Only check matched NPS columns
          for (const idx of npsColIndexes) {
            const val = answer.data?.[idx]?.value;
            const score = findScore(val);
            if (score !== null) {
              scores.push(score);
              break;
            }
          }
        }
      }

      if (!scores.length) {
        buckets.push({ label: target.label, date: target.date, total: 0, promoters: 0, passives: 0, detractors: 0, nps: 0 });
        continue;
      }

      const promoters = scores.filter((score) => score >= 9).length;
      const passives = scores.filter((score) => score >= 7 && score <= 8).length;
      const detractors = scores.filter((score) => score <= 6).length;
      const nps = Math.round(((promoters - detractors) / scores.length) * 100);

      buckets.push({ label: target.label, date: target.date, total: scores.length, promoters, passives, detractors, nps });
    }

    const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
    if (!total) {
      return Response.json({ status: "no_data", message: "Для выбранных дат не найдено числовых оценок NPS.", results: buckets });
    }

    const promoters = buckets.reduce((sum, bucket) => sum + bucket.promoters, 0);
    const passives = buckets.reduce((sum, bucket) => sum + bucket.passives, 0);
    const detractors = buckets.reduce((sum, bucket) => sum + bucket.detractors, 0);
    const nps = Math.round(((promoters - detractors) / total) * 100);

    return Response.json({
      status: "ready",
      results: buckets,
      total,
      promoters,
      passives,
      detractors,
      nps
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось посчитать NPS."
      },
      { status: 500 }
    );
  }
}
