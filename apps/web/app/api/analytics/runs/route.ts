import { buildDay1ReportMessages, yandexFormIds } from "@tools/analytics";
import { formatYandexDate, LlmClient, normalizeYandexValue, YandexFormsClient, type YandexFormAnswersResponse } from "@tools/integrations";

interface AnalyticsRunRequest {
  reportType?: "day1";
  day1Date?: string;
}

function normalizeForm(response: YandexFormAnswersResponse, selectedDate: string) {
  const columns = response.columns ?? [];
  const questionList = columns.map((column, index) => column.text || column.slug || `question_${index + 1}`);
  const answers = [];

  for (const answer of response.answers ?? []) {
    if (formatYandexDate(answer.created) !== selectedDate) {
      continue;
    }

    const normalizedAnswers: Record<string, unknown> = {};

    for (let index = 0; index < columns.length; index += 1) {
      const question = columns[index]?.text || columns[index]?.slug || `question_${index + 1}`;
      const normalizedValue = normalizeYandexValue(answer.data?.[index]?.value);

      if (normalizedValue === null || normalizedValue === "") {
        continue;
      }

      normalizedAnswers[question] = normalizedValue;
    }

    answers.push({
      answerId: answer.id,
      created: answer.created,
      answers: normalizedAnswers
    });
  }

  return {
    count: answers.length,
    questionList,
    answersSample: answers.slice(0, 3)
  };
}

export async function POST(request: Request) {
  const payload = (await request.json()) as AnalyticsRunRequest;

  if (payload.reportType !== "day1" || !payload.day1Date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.day1Date)) {
    return Response.json(
      {
        status: "error",
        message: "Для первого запуска нужен reportType=day1 и day1Date в формате YYYY-MM-DD."
      },
      { status: 400 }
    );
  }

  const client = new YandexFormsClient();

  try {
    const [input, output] = await Promise.all([
      client.getAnswers(yandexFormIds.day1Input),
      client.getAnswers(yandexFormIds.day1Output)
    ]);
    const inputContext = normalizeForm(input, payload.day1Date);
    const outputContext = normalizeForm(output, payload.day1Date);
    let reportMarkdown = "";
    let llmStatus: "succeeded" | "skipped" = "skipped";

    if (inputContext.count + outputContext.count > 0) {
      const prompt = buildDay1ReportMessages({
        day1Date: payload.day1Date,
        input: inputContext,
        output: outputContext
      });
      reportMarkdown = await new LlmClient().createChatCompletion({
        messages: prompt.messages,
        temperature: 0.4,
        maxTokens: 4096
      });
      llmStatus = "succeeded";
    }

    return Response.json({
      status: inputContext.count + outputContext.count > 0 ? "ready" : "no_data",
      run: {
        id: `analytics-day1-${payload.day1Date}`,
        toolType: "analytics",
        reportType: "day1",
        day1Date: payload.day1Date,
        progress: 100,
        steps: [
          { id: "fetch-forms", title: "Загрузка форм", status: "succeeded" },
          { id: "normalize", title: "Нормализация", status: "succeeded" },
          { id: "llm", title: "LLM аналитика", status: llmStatus },
          { id: "publish", title: "Outline", status: "pending" }
        ]
      },
      stats: {
        inputCount: inputContext.count,
        outputCount: outputContext.count
      },
      day1Context: {
        input: inputContext,
        output: outputContext
      },
      reportMarkdown,
      message:
        inputContext.count + outputContext.count > 0
          ? "Данные из Yandex Forms загружены, LLM отчет сформирован. Следующий шаг: публикация в Outline."
          : "За выбранную дату в формах нет ответов."
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to run Day 1 analytics."
      },
      { status: 500 }
    );
  }
}
