import { buildDay1ReportMessages, yandexFormIds } from "@tools/analytics";
import { formatYandexDate, LlmClient, normalizeYandexValue, YandexFormsClient, ImageGenerationClient, type YandexFormAnswersResponse } from "@tools/integrations";

const blockTitles: Record<string, string> = {
  day1: "День 1",
  day2: "День 2",
  overall: "Общая аналитика",
  products: "Продукты",
  infographic: "Инфографика",
  logo: "Логотип",
  generalPhoto: "Общая фото",
  publish: "Публикация"
};

interface AnalyticsRunRequest {
  reportType?: "day1";
  day1Date?: string;
  day2Date?: string;
  selectedBlocks?: string[];
  stagePrompts?: Record<string, string>;
  assetFiles?: Record<string, string[]>;
}

function buildStagePromptMessage(payload: AnalyticsRunRequest) {
  const entries = Object.entries(payload.stagePrompts ?? {})
    .filter(([blockId, prompt]) => payload.selectedBlocks?.includes(blockId) && prompt.trim())
    .map(([blockId, prompt]) => `## ${blockId}\n${prompt.trim()}`);

  if (!entries.length) {
    return null;
  }

  return {
    role: "user" as const,
    content: ["Use these operator prompt settings for the selected scenario stages.", ...entries].join("\n\n")
  };
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

function buildExtraContextMessage(payload: AnalyticsRunRequest, day2Context: ReturnType<typeof normalizeForm> | null) {
  const content = JSON.stringify(
    {
      selectedBlocks: payload.selectedBlocks ?? [],
      dates: {
        day1: payload.day1Date,
        day2: payload.day2Date
      },
      uploadedFiles: payload.assetFiles ?? {},
      day2Context
    },
    null,
    2
  );

  return {
    role: "user" as const,
    content: `Use this scenario context. If Day 2, products, infographic, logo, general photo or publication are selected, reflect them as separate sections in the final Russian Markdown.\n\n${content}`
  };
}

function extractSectionText(markdown: string, blockId: string): string {
  const lines = markdown.split("\n");
  let startIdx = -1;
  let headerLevel = 1;

  const patterns: Record<string, RegExp> = {
    day1: /^\s*#+\s*(?:День\s*1)/i,
    day2: /^\s*#+\s*(?:День\s*2)/i,
    overall: /^\s*#+\s*(?:Общая\s*аналитика|Синтез|Синтез\s*результатов|Итоговая\s*аналитика)/i,
    products: /^\s*#+\s*(?:Продукты|Концепции|Концепции\s*продуктов|Цифровые\s*продукты)/i,
    infographic: /^\s*#+\s*(?:Инфографика|Дашборд|Разметка\s*для\s*дашборда|Разметка)/i
  };

  const pattern = patterns[blockId];
  if (!pattern) return markdown;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (pattern.test(line)) {
      startIdx = i;
      const match = line.match(/^\s*(#+)/);
      if (match) {
        headerLevel = match[1].length;
      }
      break;
    }
  }

  if (startIdx === -1) {
    return markdown;
  }

  const sectionLines: string[] = [];
  sectionLines.push(lines[startIdx]);

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^\s*(#+)\s+/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      if (level <= headerLevel) {
        break;
      }
    }
    sectionLines.push(line);
  }

  const sectionText = sectionLines.join("\n").trim();
  let cleanSectionText = sectionText;
  if (cleanSectionText.startsWith("#")) {
    const firstNewline = cleanSectionText.indexOf("\n");
    if (firstNewline !== -1) {
      cleanSectionText = cleanSectionText.slice(firstNewline + 1).trim();
    } else {
      cleanSectionText = "";
    }
  }
  return cleanSectionText || sectionText;
}

function buildStageReports(payload: AnalyticsRunRequest, reportMarkdown: string) {
  if (!reportMarkdown) {
    return {};
  }

  return Object.fromEntries(
    (payload.selectedBlocks ?? []).map((blockId) => {
      const title = blockTitles[blockId] ?? blockId;
      const files = payload.assetFiles?.[blockId]?.length ? `\n\nЗагруженные файлы: ${payload.assetFiles[blockId].join(", ")}` : "";
      const sectionContent = extractSectionText(reportMarkdown, blockId);
      return [
        blockId,
        [`# ${title}`, `Дата День 1: ${payload.day1Date}`, payload.day2Date ? `Дата День 2: ${payload.day2Date}` : null, files, "", sectionContent]
          .filter(Boolean)
          .join("\n")
      ];
    })
  );
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
    const [input, output, day2] = await Promise.all([
      client.getAnswers(yandexFormIds.day1Input),
      client.getAnswers(yandexFormIds.day1Output),
      payload.day2Date ? client.getAnswers(yandexFormIds.day2) : Promise.resolve(null)
    ]);
    const inputContext = normalizeForm(input, payload.day1Date);
    const outputContext = normalizeForm(output, payload.day1Date);
    const day2Context = day2 && payload.day2Date ? normalizeForm(day2, payload.day2Date) : null;
    let reportMarkdown = "";
    let infographicImageUrl = "";
    let llmStatus: "succeeded" | "skipped" = "skipped";
    const totalAnswers = inputContext.count + outputContext.count + (day2Context?.count ?? 0);

    if (totalAnswers > 0) {
      const prompt = buildDay1ReportMessages({
        day1Date: payload.day1Date,
        input: inputContext,
        output: outputContext
      });
      const stagePromptMessage = buildStagePromptMessage(payload);
      const extraContextMessage = buildExtraContextMessage(payload, day2Context);
      reportMarkdown = await new LlmClient().createChatCompletion({
        messages: stagePromptMessage ? [...prompt.messages, extraContextMessage, stagePromptMessage] : [...prompt.messages, extraContextMessage],
        temperature: 0.4,
        maxTokens: 4096
      });
      llmStatus = "succeeded";

      // If infographic block is selected, generate the image!
      if (payload.selectedBlocks?.includes("infographic")) {
        try {
          const visualPrompt = await new LlmClient().createChatCompletion({
            messages: [
              {
                role: "system",
                content: "Ты — эксперт по визуализации данных и дизайнер дашбордов. Твоя задача — составить детальный визуальный промпт для генератора картинок на основе текстовой инфографики. Напиши подробный промпт на английском языке для генерации красивой, плоской современной инфографики (дашборда 16:9) с чистыми шрифтами, метриками и блоками в деловом технологичном стиле. Укажи в промпте конкретные англоязычные надписи для ключевых показателей (например: 'Day 1', 'Day 2', 'NPS', 'Satisfaction', 'Beacon Training'), чтобы нейросеть красиво расположила их на панели."
              },
              {
                role: "user",
                content: `Составь визуальный промпт на основе этого отчета:\n\n${reportMarkdown}`
              }
            ],
            temperature: 0.5,
            maxTokens: 400
          });

          infographicImageUrl = await new ImageGenerationClient().generateImage({
            prompt: visualPrompt,
            model: "gpt-image-2"
          });
        } catch (imgError) {
          console.error("Failed to generate image:", imgError);
        }
      }
    }

    return Response.json({
      status: totalAnswers > 0 ? "ready" : "no_data",
      run: {
        id: `analytics-day1-${payload.day1Date}`,
        toolType: "analytics",
        reportType: "day1",
        day1Date: payload.day1Date,
        progress: 100,
        steps: [
          { id: "fetch-forms", title: "Загрузка форм", status: "succeeded" },
          { id: "normalize", title: "Нормализация", status: "succeeded" },
          { id: "llm", title: "ИИ-аналитика", status: llmStatus },
          { id: "publish", title: "Публикация", status: "pending" }
        ]
      },
      stats: {
        inputCount: inputContext.count,
        outputCount: outputContext.count,
        day2Count: day2Context?.count ?? 0
      },
      day1Context: {
        input: inputContext,
        output: outputContext
      },
      day2Context,
      reportMarkdown,
      infographicImageUrl,
      stageReports: buildStageReports(payload, reportMarkdown),
      message:
        totalAnswers > 0
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
