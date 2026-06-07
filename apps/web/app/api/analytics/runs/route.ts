import { yandexFormIds } from "@tools/analytics";
import { formatYandexDate, LlmClient, normalizeYandexValue, YandexFormsClient, ImageGenerationClient, type YandexFormAnswersResponse } from "@tools/integrations";
import JSZip from "jszip";

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

interface AssetFile {
  name: string;
  type: string;
  base64: string;
}

interface AnalyticsRunRequest {
  reportType?: "day1";
  day1Date?: string;
  day2Date?: string;
  selectedBlocks?: string[];
  stagePrompts?: Record<string, string>;
  assetFiles?: Record<string, AssetFile[]>;
  stageReports?: Record<string, string>;
}

async function getDocxText(base64Data: string): Promise<string> {
  try {
    const cleanBase64 = base64Data.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) return "";
    
    const matches = docXml.match(/<w:t.*?>(.*?)<\/w:t>/g);
    if (!matches) return "";
    
    return matches
      .map((val) => val.replace(/<w:t.*?>/, "").replace(/<\/w:t>/, ""))
      .join(" ");
  } catch (err) {
    console.error("Failed to parse DOCX text:", err);
    return "";
  }
}

function convertToMarkdownTable(questionList: string[], answers: any[]) {
  if (!answers.length) {
    return "Нет данных.";
  }

  const headers = questionList.filter((q) => {
    const lq = q.toLowerCase();
    return !lq.includes("id") && lq !== "created" && lq !== "дата создания";
  });

  if (!headers.length) {
    return "Нет колонок для отображения.";
  }

  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;

  const rows = answers.map((ans) => {
    const cells = headers.map((header) => {
      const val = ans.answers[header];
      if (val === null || val === undefined) return "";
      return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
    });
    return `| ${cells.join(" | ")} |`;
  });

  return [headerLine, separatorLine, ...rows].join("\n");
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

  const markdownTable = convertToMarkdownTable(questionList, answers);

  return {
    count: answers.length,
    questionList,
    answers,
    markdownTable
  };
}

function buildStageReports(payload: AnalyticsRunRequest, stageReports: Record<string, string>) {
  return Object.fromEntries(
    (payload.selectedBlocks ?? []).map((blockId) => {
      const title = blockTitles[blockId] ?? blockId;
      const blockFiles = payload.assetFiles?.[blockId] ?? [];
      const files = blockFiles.length ? `\n\nЗагруженные файлы: ${blockFiles.map(f => f.name).join(", ")}` : "";
      const sectionContent = stageReports[blockId] || "";
      
      let cleanContent = sectionContent;
      if (cleanContent.startsWith("# ")) {
        const firstNewline = cleanContent.indexOf("\n");
        if (firstNewline !== -1) {
          cleanContent = cleanContent.slice(firstNewline + 1).trim();
        }
      }

      return [
        blockId,
        [`# ${title}`, `Дата День 1: ${payload.day1Date}`, payload.day2Date ? `Дата День 2: ${payload.day2Date}` : null, files, "", cleanContent]
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
        message: "Для первого запуска нужен reportType=day1 and day1Date в формате YYYY-MM-DD."
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
    
    const totalAnswers = inputContext.count + outputContext.count + (day2Context?.count ?? 0);
    
    const stageReports: Record<string, string> = {};
    let infographicImageUrl = "";
    let llmStatus: "succeeded" | "skipped" = "skipped";

    if (totalAnswers > 0) {
      const blocks = payload.selectedBlocks ?? [];
      const llm = new LlmClient();

      // --- STEP 1: DAY 1 ANALYTICS ---
      if (blocks.includes("day1")) {
        const systemPromptDay1 = payload.stagePrompts?.day1 || "Проанализируй анкеты обратной связи участников за День 1. Сделай структурированный отчет на русском языке.";
        const userPromptDay1 = [
          "### Входные анкеты первого дня (Day 1 Input):",
          `Всего ответов: ${inputContext.count}`,
          inputContext.markdownTable,
          "",
          "### Выходные анкеты первого дня (Day 1 Output):",
          `Всего ответов: ${outputContext.count}`,
          outputContext.markdownTable
        ].join("\n");

        stageReports.day1 = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptDay1 },
            { role: "user", content: userPromptDay1 }
          ],
          model: "qwen3.7-max",
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 2: DAY 2 ANALYTICS ---
      if (blocks.includes("day2") && day2Context) {
        const systemPromptDay2 = payload.stagePrompts?.day2 || "Проанализируй анкеты обратной связи участников за День 2. Сделай структурированный отчет на русском языке.";
        const userPromptDay2 = [
          "### Анкеты обратной связи второго дня (Day 2):",
          `Всего ответов: ${day2Context.count}`,
          day2Context.markdownTable
        ].join("\n");

        stageReports.day2 = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptDay2 },
            { role: "user", content: userPromptDay2 }
          ],
          model: "qwen3.7-max",
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 3: OVERALL SYNTHESIS ---
      if (blocks.includes("overall")) {
        const systemPromptOverall = payload.stagePrompts?.overall || "Синтезируй результаты первого и второго дня стратегической сессии в единую аналитическую справку на русском языке.";
        const userPromptOverall = [
          "### Результаты аналитики День 1:",
          stageReports.day1 || "Данные первого дня отсутствуют.",
          "",
          "### Результаты аналитики День 2:",
          stageReports.day2 || "Данные второго дня отсутствуют."
        ].join("\n");

        stageReports.overall = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptOverall },
            { role: "user", content: userPromptOverall }
          ],
          model: "qwen3.7-max",
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 4: PRODUCTS ANALYSIS ---
      if (blocks.includes("products")) {
        const docxFiles = payload.assetFiles?.products ?? [];
        const docxTexts: string[] = [];
        
        for (const f of docxFiles) {
          if (f.base64) {
            const txt = await getDocxText(f.base64);
            if (txt) {
              docxTexts.push(`--- Документ: ${f.name} ---\n${txt}`);
            }
          }
        }

        const systemPromptProducts = payload.stagePrompts?.products || "Проанализируй предложенные на сессии концепции цифровых продуктов.";
        const userPromptProducts = [
          "### Текст загруженных материалов по продуктам:",
          docxTexts.length ? docxTexts.join("\n\n") : "Файлы по продуктам не были загружены или пусты.",
          "",
          "### Результаты общей аналитики сессии (для контекста):",
          stageReports.overall || stageReports.day1 || "Контекст сессии отсутствует."
        ].join("\n");

        stageReports.products = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptProducts },
            { role: "user", content: userPromptProducts }
          ],
          model: "qwen3.7-max",
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 5: INFOGRAPHIC PROMPT & GENERATION ---
      if (blocks.includes("infographic")) {
        const rawSystemPrompt = payload.stagePrompts?.infographic && payload.stagePrompts.infographic.trim()
          ? payload.stagePrompts.infographic.trim()
          : "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.\nРазметка должна строго соответствовать следующей структуре:\n\nЗАГОЛОВОК (ВЕРХНИЙ КОЛОНТИТУЛ):\nТренажёр «МАЯК» | ИИ-грамотность для органов власти [Даты сессии, Город]\n\nЛЕВАЯ КОЛОНКА: ЗАДАЧИ И МЕТРИКИ\nЭффективность программы:\n• NPS День 1: [Значение]\n• NPS День 2: [Значение]\n• Командная согласованность: [Оценка]/10\n• Рост числа инструментов: [На входе] → [На выходе] (+[Разница] за день)\n\nПРАВАЯ КОЛОНКА (ИЛИ НИЖНИЙ БЛОК): КОМПЕТЕНЦИИ И ИНСАЙТЫ\nКОМПЕТЕНЦИИ И НАВЫКИ (Уровень владения ИИ):\n• На входе: [Оценка]/10\n• На выходе: [Оценка]/10 (Рост уверенности в [Коэффициент] раза)\n\nТоп-3 инструментария (Лидеры освоения):\n1. Аналитика и Данные: [Инструмент 1]\n2. Визуал и Презентации: [Инструмент 2]\n3. Креатив и Аудио: [Инструмент 3]\n\nКАЧЕСТВЕННЫЕ ПОКАЗАТЕЛИ (Изменение отношения к ИИ):\n• Кардинально изменилось (Увидели огромный потенциал): [Процент]% ([Доля])\n• Дополнилось (Увидели новые сценарии): [Процент]% ([Доля])\n\nКачественные эффекты:\n• Преодоление страха: [Краткое описание эффекта и количества инструментов].\n• Командная синергия: [Описание формирования единого понятийного поля].\n• Практический результат: [Описание конкретных планов внедрения и автоматизации отчетов].\n\nВизуальное оформление: указать место для логотипа и общего фото участников, цветовой стиль адаптировать под цвета логотипа.";
        
        const reportContext = payload.stageReports?.overall || payload.stageReports?.day1 || payload.stageReports?.day2 || stageReports.overall || stageReports.day1 || stageReports.day2 || "Данные сессии отсутствуют.";
        
        try {
          const visualPrompt = await llm.createChatCompletion({
            messages: [
              { role: "system", content: rawSystemPrompt },
              { role: "user", content: `Данные аналитического отчета сессии для заполнения шаблона:\n\n${reportContext}` }
            ],
            model: "qwen3.7-max",
            temperature: 0.4,
            maxTokens: 4096
          });

          console.log("Generated visualPrompt via Qwen:", JSON.stringify(visualPrompt));

          // Генерация картинки по правильной модели
          infographicImageUrl = await new ImageGenerationClient().generateImage({
            prompt: visualPrompt,
            model: "gpt-image-2"
          });
          
          stageReports.infographic = `# Инфографика\n\nСгенерирован визуальный промпт:\n${visualPrompt}`;
        } catch (imgError) {
          console.error("Failed to generate image with model gpt-image-2:", imgError);
          stageReports.infographic = `# Инфографика\n\nОшибка генерации изображения.`;
        }
      }

      llmStatus = "succeeded";
    }

    const reportMarkdown = [
      stageReports.day1,
      stageReports.day2,
      stageReports.overall,
      stageReports.products,
      stageReports.infographic
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

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
      stageReports: buildStageReports(payload, stageReports),
      message:
        totalAnswers > 0
          ? "Данные из Yandex Forms загружены, LLM отчет сформирован. Следующий шаг: публикация в Outline."
          : "За выбранную дату в формах нет ответов."
    });
  } catch (error) {
    console.error("Analytics pipeline error:", error);
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to run Day 1 analytics."
      },
      { status: 500 }
    );
  }
}
