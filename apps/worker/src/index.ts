import { getNextJob, updateJob, getProtocols, saveProtocol, saveProcessRun, reapStaleJobs } from "@tools/db";
import { GeminiClient, DeepgramClient, formatYandexDate, LlmClient, normalizeYandexValue, YandexFormsClient, getRuntimeConfig, OpenNotebookClient, type RuntimeConfig } from "@tools/integrations";
import { yandexFormIds } from "@tools/analytics";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import type { ProtocolRecord } from "@tools/protocols";
import type { ProcessRun } from "@tools/core";
import JSZip from "jszip";

// Path to the ffmpeg binary. Defaults to "ffmpeg" (resolved via PATH, as in the
// Docker image); override with FFMPEG_PATH for local runs where ffmpeg is not on PATH.
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FFMPEG_NOT_FOUND = `FFmpeg не найден. Установите FFmpeg и добавьте его в PATH, либо укажите путь к бинарю в переменной окружения FFMPEG_PATH (текущее значение: "${FFMPEG_BIN}").`;

// Helper to run ffmpeg command
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (err: any) => {
      if (err.code === "ENOENT") {
        reject(new Error(FFMPEG_NOT_FOUND));
      } else {
        reject(new Error(`Ошибка запуска FFmpeg: ${err.message}`));
      }
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });
  });
}

// Helper to get audio/video duration using ffmpeg
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ["-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (err: any) => {
      if (err.code === "ENOENT") {
        reject(new Error(FFMPEG_NOT_FOUND));
      } else {
        reject(new Error(`Ошибка запуска FFmpeg при определении длительности: ${err.message}`));
      }
    });
    proc.on("close", () => {
      // Find duration in format: Duration: 00:01:23.45
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        resolve(hours * 3600 + minutes * 60 + seconds);
      } else {
        console.warn("Could not determine audio duration via ffmpeg, returning 0");
        resolve(0);
      }
    });
  });
}

// Deduplicate overlapping transcripts
function mergeTranscripts(textA: string, textB: string): string {
  if (!textA) return textB;
  if (!textB) return textA;

  const wordsA = textA.split(/\s+/);
  const wordsB = textB.split(/\s+/);

  // Check overlap of up to 30 words
  const maxOverlapWords = Math.min(wordsA.length, wordsB.length, 30);
  let bestOverlapLength = 0;

  for (let len = 1; len <= maxOverlapWords; len++) {
    const suffix = wordsA.slice(-len).join(" ").toLowerCase().replace(/[^a-z0-9а-яё]/g, "");
    const prefix = wordsB.slice(0, len).join(" ").toLowerCase().replace(/[^a-z0-9а-яё]/g, "");
    if (suffix === prefix && suffix.length > 0) {
      bestOverlapLength = len;
    }
  }

  if (bestOverlapLength > 0) {
    const uniqueA = wordsA.slice(0, wordsA.length - bestOverlapLength).join(" ");
    const joinedB = wordsB.join(" ");
    return `${uniqueA} ${joinedB}`.trim();
  }

  return `${textA} ${textB}`.trim();
}

const sectionSynonyms: Record<string, string[]> = {
  agenda: ["повестка", "agenda"],
  keyPoints: ["тезисы", "основные тезисы", "ключевые моменты", "ключевые тезисы", "обсуждение", "ход встречи"],
  decisionsText: ["решения", "принятые решения", "решения встречи", "список решений"],
  tasksText: ["задачи", "поручения", "задачи и поручения", "план действий", "список задач", "что сделать"],
  responsible: ["ответственные", "ответственные лица", "исполнители"],
  deadlines: ["сроки", "сроки выполнения", "дедлайны"],
  risks: ["риски", "риски и угрозы", "риски и проблемы"],
  attachments: ["приложения", "приложения и материалы", "материалы"]
};

function extractSectionBySynonyms(markdown: string, synonyms: string[]): string {
  const lines = markdown.split("\n");
  const content: string[] = [];
  let found = false;
  
  const synsClean = synonyms.map(s => s.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ""));
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#")) {
      const lineClean = line.toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
      // Check if this header matches any of our synonyms
      const isMatch = synsClean.some(syn => lineClean.includes(syn) || syn.includes(lineClean));
      if (isMatch) {
        found = true;
        continue;
      } else if (found) {
        // If we were already in the section and encountered a new header, stop
        break;
      }
    }
    if (found) {
      content.push(lines[i]);
    }
  }
  
  return content.join("\n").trim();
}

// Transcribe via Deepgram: single-shot ASR + speaker diarization (no chunking,
// so speaker labels stay consistent across the whole recording).
async function transcribeWithDeepgram(
  jobId: number,
  inputPath: string,
  tempDir: string,
  transcriptPrompt: string,
  config: RuntimeConfig
): Promise<string> {
  updateJob(jobId, { progress: 20, message: "Оптимизация аудиодорожки..." });

  // 16 kHz mono mp3 — small upload, more than enough for diarization.
  const convertedPath = join(tempDir, "deepgram_input.mp3");
  await runFFmpeg([
    "-i", inputPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    convertedPath,
    "-y"
  ]);

  updateJob(jobId, { progress: 40, message: "Распознавание речи и разделение по спикерам (Deepgram)..." });

  const audioBuffer = await readFile(convertedPath);
  const deepgram = new DeepgramClient(config);
  const result = await deepgram.transcribeWithDiarization(audioBuffer, "audio/mp3", { language: "ru" });

  try {
    await rm(convertedPath, { force: true });
  } catch (cleanupErr) {
    console.warn("Failed to delete converted audio:", convertedPath, cleanupErr);
  }

  updateJob(jobId, {
    progress: 75,
    message: `Распознано. Обнаружено спикеров: ${result.speakerCount}. Сопоставление участников...`,
    result: JSON.stringify({ currentTranscript: result.diarizedText })
  });

  // Best-effort mapping of "Спикер N" → real participant names via the LLM provider.
  const named = await mapSpeakersToNames(result.diarizedText, transcriptPrompt, config);

  updateJob(jobId, {
    progress: 85,
    message: "Стенограмма готова. Формирование протокола...",
    result: JSON.stringify({ currentTranscript: named })
  });

  return named;
}

// Asks the LLM to map anonymous "Спикер N" labels to real participant names.
// Returns a tiny JSON map (no full-transcript echo), then replaces labels in code
// to avoid output-token truncation on long transcripts. Best-effort: on any
// failure the original generic labels are kept.
async function mapSpeakersToNames(
  diarizedText: string,
  participantContext: string,
  config: RuntimeConfig
): Promise<string> {
  const ctx = (participantContext || "").trim();
  if (!ctx || !config.llmApiKey) {
    return diarizedText;
  }

  const speakerNums = Array.from(new Set([...diarizedText.matchAll(/Спикер (\d+):/g)].map((m) => m[1])));
  if (speakerNums.length === 0) {
    return diarizedText;
  }

  try {
    const llm = new GeminiClient(config, "protocols");
    const systemPrompt =
      "Ты сопоставляешь анонимных спикеров стенограммы с реальными участниками встречи. " +
      "Верни СТРОГО JSON-объект без каких-либо пояснений: ключ — номер спикера (строкой), " +
      "значение — имя участника из предоставленного списка, если оно уверенно определяется по содержанию " +
      "реплик (обращения по имени, представления, роли). Если имя определить нельзя — поставь пустую строку. " +
      'Пример ответа: {"0":"Андрей Л.","1":""}';
    const userPrompt = `Контекст с участниками:\n${ctx}\n\nНомера спикеров для сопоставления: ${speakerNums.join(", ")}\n\nСтенограмма:\n${diarizedText}`;

    const raw = await llm.createChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      maxTokens: 1024
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return diarizedText;
    }

    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>;
    let result = diarizedText;
    for (const [num, name] of Object.entries(mapping)) {
      const trimmed = (name || "").trim();
      if (trimmed && /^\d+$/.test(num)) {
        const re = new RegExp(`(^|\\n)Спикер ${num}:`, "g");
        result = result.replace(re, `$1${trimmed}:`);
      }
    }
    return result;
  } catch (err) {
    console.warn("Speaker name mapping failed, keeping generic labels:", err);
    return diarizedText;
  }
}

async function processProtocolJob(jobId: number, payload: any) {
  const { protocolId, prompt, transcriptPrompt, tempInputPath, originalMime, textTranscript } = payload;
  let tempDir = "";
  const cloudFilesToCleanup: string[] = [];

  try {
    const gemini = new GeminiClient(getRuntimeConfig(), "protocols");
    let finalTranscript = "";

    if (tempInputPath) {
      const config = getRuntimeConfig();
      updateJob(jobId, { status: "running", progress: 10, message: "Файл получен. Анализ метаданных..." });

      tempDir = join(process.cwd(), ".data", "temp", `worker-${protocolId}-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      // Determine duration
      const totalDuration = await getAudioDuration(tempInputPath);
      console.log(`Input audio/video duration: ${totalDuration} seconds`);

      if (config.deepgramApiKey) {
      // --- Deepgram: настоящая диаризация по голосам, весь файл одним запросом ---
      finalTranscript = await transcribeWithDeepgram(jobId, tempInputPath, tempDir, transcriptPrompt, config);
      } else {
      // --- Fallback: Gemini, нарезка на сегменты с перехлёстом ---
      // Determine segments
      const segmentDuration = 900; // 15 minutes
      const overlap = 10; // 10 seconds
      const segments: Array<{ start: number; duration: number }> = [];

      if (totalDuration > 2700) { // More than 45 minutes
        let start = 0;
        while (start < totalDuration) {
          let end = start + segmentDuration;
          if (end > totalDuration) {
            end = totalDuration;
          }
          segments.push({ start, duration: end - start });
          if (end >= totalDuration) {
            break;
          }
          start = end - overlap;
        }
      } else {
        segments.push({ start: 0, duration: totalDuration || -1 });
      }

      console.log(`Processing audio in ${segments.length} segment(s)...`);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        updateJob(jobId, {
          progress: Math.min(15 + Math.round((i / segments.length) * 35), 50),
          message: segments.length > 1 
            ? `Обработка сегмента ${i + 1} из ${segments.length}...`
            : "Оптимизация аудиодорожки..."
        });

        const chunkPath = join(tempDir, `chunk_${i}.mp3`);
        
        // Extract segment
        const convertArgs = [
          ...(segment.duration > 0 ? ["-ss", String(segment.start), "-t", String(segment.duration)] : []),
          "-i", tempInputPath,
          "-vn",
          "-acodec", "libmp3lame",
          "-b:a", "128k",
          "-ar", "44100",
          chunkPath,
          "-y"
        ];
        await runFFmpeg(convertArgs);

        updateJob(jobId, {
          progress: Math.min(50 + Math.round((i / segments.length) * 20), 70),
          message: segments.length > 1
            ? `Загрузка сегмента ${i + 1} в Google Cloud...`
            : "Загрузка аудиофайла в Google Cloud..."
        });

        const chunkBuffer = await readFile(chunkPath);
        const cloudDisplayName = `worker_proto_${protocolId}_chunk_${i}_${Date.now()}`;
        const uploadResult = await gemini.uploadFile(chunkBuffer, "audio/mp3", cloudDisplayName);
        cloudFilesToCleanup.push(uploadResult.name);

        // Wait for processing
        let state = "PROCESSING";
        let attempts = 0;
        while (state === "PROCESSING" && attempts < 60) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const fileInfo = await gemini.getFileState(uploadResult.name);
          state = fileInfo.state;
          attempts++;
        }

        if (state !== "ACTIVE") {
          throw new Error(`Не удалось обработать аудиофайл в Google Cloud. Статус: ${state}`);
        }

        // Transcribe
        updateJob(jobId, {
          progress: Math.min(70 + Math.round((i / segments.length) * 10), 80),
          message: segments.length > 1
            ? `Распознавание речи: сегмент ${i + 1} из ${segments.length}...`
            : "Распознавание речи..."
        });

        const chunkTranscript = await gemini.transcribeAudioFromFileUri(uploadResult.uri, "audio/mp3", transcriptPrompt);
        
        // Merge transcript
        finalTranscript = mergeTranscripts(finalTranscript, chunkTranscript);

        // Update current progress preview
        updateJob(jobId, {
          progress: Math.min(80 + Math.round(((i + 1) / segments.length) * 5), 85),
          message: segments.length > 1
            ? `Распознан сегмент ${i + 1} из ${segments.length}`
            : "Стенограмма готова. Формирование протокола...",
          result: JSON.stringify({ currentTranscript: finalTranscript })
        });

        // Clean up temporary chunk file
        try {
          await rm(chunkPath, { force: true });
        } catch (cleanupErr) {
          console.warn("Failed to delete chunk path:", chunkPath, cleanupErr);
        }
      }
      } // end Gemini fallback path
    } else {
      // Manual text transcript
      finalTranscript = textTranscript;
      updateJob(jobId, { status: "running", progress: 85, message: "Стенограмма получена. Анализ и формирование протокола..." });
    }

    // Generate Protocol
    const protocolText = await gemini.generateProtocol(finalTranscript, prompt);

    // Parse decisions and tasks
    let decisionsCount = 0;
    let tasksCount = 0;
    let currentSection = "";
    const lines = protocolText.split("\n").map((l) => l.trim());
    const bulletLines = lines.filter((l) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l)));

    for (const line of lines) {
      if (line.startsWith("#")) {
        currentSection = line.toLowerCase();
      } else if (line.length > 0 && (line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line))) {
        if (currentSection.includes("решен")) {
          decisionsCount++;
        } else if (currentSection.includes("задач") || currentSection.includes("поруч") || currentSection.includes("ответь")) {
          tasksCount++;
        }
      }
    }

    if (decisionsCount === 0 && tasksCount === 0) {
      tasksCount = bulletLines.length;
    }

    const theme = protocolText;
    const agenda = extractSectionBySynonyms(protocolText, sectionSynonyms.agenda);
    const keyPoints = extractSectionBySynonyms(protocolText, sectionSynonyms.keyPoints);
    const decisionsText = extractSectionBySynonyms(protocolText, sectionSynonyms.decisionsText);
    const tasksText = extractSectionBySynonyms(protocolText, sectionSynonyms.tasksText);
    const responsible = extractSectionBySynonyms(protocolText, sectionSynonyms.responsible);
    const deadlines = extractSectionBySynonyms(protocolText, sectionSynonyms.deadlines);
    const risks = extractSectionBySynonyms(protocolText, sectionSynonyms.risks);
    const attachments = extractSectionBySynonyms(protocolText, sectionSynonyms.attachments);

    // Save Protocol in Database
    const list = getProtocols();
    const protocol = list.find((p) => p.id === protocolId);
    if (protocol) {
      const updatedProtocol: ProtocolRecord = {
        ...protocol,
        transcript: finalTranscript,
        theme,
        agenda,
        keyPoints,
        decisionsText,
        tasksText,
        responsible,
        deadlines,
        risks,
        attachments,
        decisions: decisionsCount,
        actionItems: tasksCount,
        status: "review"
      };
      saveProtocol(updatedProtocol);
    }

    // Save Process Run
    const run: ProcessRun = {
      id: `protocol-run-${protocolId}-${Date.now()}`,
      toolType: "protocol",
      title: "Генерация протокола",
      status: "succeeded",
      progress: 100,
      startedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
      steps: [
        { id: "source", title: "Источник", description: "Медиафайл загружен", status: "succeeded" },
        { id: "transcribe", title: "Распознавание", description: "Речь успешно переведена в текст", status: "succeeded" },
        { id: "extract", title: "Создание протокола", description: "ИИ выделил структуру протокола", status: "succeeded" },
        { id: "review", title: "Согласование", description: "Протокол готов к согласованию", status: "pending" },
        { id: "publish", title: "Публикация", description: "Ожидает публикации", status: "blocked" }
      ]
    };
    saveProcessRun(run);

    // Mark job as succeeded
    updateJob(jobId, {
      status: "succeeded",
      progress: 100,
      message: "Протокол успешно сгенерирован.",
      result: JSON.stringify({
        extractedData: {
          theme,
          agenda,
          keyPoints,
          decisionsText,
          tasksText,
          responsible,
          deadlines,
          risks,
          attachments
        },
        finalTranscript,
        run
      })
    });
  } catch (error: any) {
    console.error(`Error processing protocol job ${jobId}:`, error);
    updateJob(jobId, {
      status: "failed",
      progress: 100,
      message: `Ошибка: ${error.message || error}`,
      error: error.message || String(error)
    });
  } finally {
    // Cleanup files
    if (tempInputPath) {
      try {
        await rm(tempInputPath, { force: true });
      } catch (err) {
        console.error("Failed to delete temp input path:", tempInputPath, err);
      }
    }
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error("Failed to delete temp dir:", tempDir, err);
      }
    }
    // Cleanup cloud files
    const gemini = new GeminiClient(getRuntimeConfig(), "protocols");
    for (const cloudFile of cloudFilesToCleanup) {
      try {
        await gemini.deleteFile(cloudFile);
      } catch (err) {
        console.error("Failed to delete cloud file:", cloudFile, err);
      }
    }
  }
}

// Helper functions for Analytics
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

function normalizeForm(response: any, selectedDate: string) {
  const columns = response.columns ?? [];
  const questionList = columns.map((column: any, index: number) => column.text || column.slug || `question_${index + 1}`);
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

const blockTitles: Record<string, string> = {
  day1: "День 1",
  day2: "День 2",
  overall: "Общая аналитика",
  products: "Продукты",
  "infographic-prompt": "Подготовка промта для инфографики",
  "infographic-image": "Инфографика",
  infographic: "Инфографика",
  logo: "Логотип",
  generalPhoto: "Общая фото",
  publish: "Публикация"
};

function buildStageReports(payload: any, stageReports: Record<string, string>) {
  return Object.fromEntries(
    (payload.selectedBlocks ?? []).map((blockId: string) => {
      const sectionContent = stageReports[blockId] || "";
      return [
        blockId,
        sectionContent.trim()
      ];
    })
  );
}

function findMonorepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return process.cwd();
    }
    dir = parent;
  }
}

function getAccountsPath() {
  if (existsSync("/app/image-service-data")) {
    return "/app/image-service-data/accounts.json";
  }
  const root = findMonorepoRoot();
  return join(root, "image-service-data/accounts.json");
}

async function handleImageLimitError(errorMsg: string) {
  const isLimitError = errorMsg.includes("достигли своего лимита") ||
                       errorMsg.includes("limit of image generation") ||
                       errorMsg.includes("limit") ||
                       errorMsg.includes("quota") ||
                       errorMsg.includes("429");
  if (!isLimitError) return;

  try {
    const accountsPath = getAccountsPath();
    if (!existsSync(accountsPath)) return;
    const raw = readFileSync(accountsPath, "utf8");
    const accounts = JSON.parse(raw);
    if (!Array.isArray(accounts) || accounts.length === 0) return;

    let lastUsedAccountIndex = -1;
    let maxTime = 0;

    accounts.forEach((acc: any, index: number) => {
      if (acc.last_used_at) {
        const time = new Date(acc.last_used_at).getTime();
        if (!isNaN(time) && time > maxTime) {
          maxTime = time;
          lastUsedAccountIndex = index;
        }
      }
    });

    if (lastUsedAccountIndex !== -1) {
      const acc = accounts[lastUsedAccountIndex];
      if (!acc.limits_progress) acc.limits_progress = [];
      
      let imgGenLimit = acc.limits_progress.find((l: any) => l.feature_name === "image_gen");
      if (imgGenLimit) {
        imgGenLimit.remaining = 0;
      } else {
        acc.limits_progress.push({
          feature_name: "image_gen",
          remaining: 0,
          reset_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
      }
      
      writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), "utf8");
      console.log(`[Worker] Reset remaining limits to 0 for account: ${acc.email} due to error: ${errorMsg}`);
    }
  } catch (err) {
    console.error("Failed to reset limit for last used account:", err);
  }
}

async function processAnalyticsJob(jobId: number, payload: any) {
  const { day1Date, day2Date, selectedBlocks, stagePrompts, assetFiles, stageReports, customAnswers } = payload;

  try {
    updateJob(jobId, { status: "running", progress: 5, message: "Инициализация аналитического пайплайна..." });

    const client = new YandexFormsClient();
    let inputContext;
    let outputContext;
    let day2Context = null;

    updateJob(jobId, { progress: 10, message: "Загрузка ответов Яндекс.Форм..." });

    if (customAnswers) {
      if (customAnswers.day1Input) {
        const table = customAnswers.day1Input;
        const enabledAnswers = table.answers.filter((a: any) => !a.disabled);
        inputContext = {
          count: enabledAnswers.length,
          questionList: table.questionList,
          answers: enabledAnswers,
          markdownTable: convertToMarkdownTable(table.questionList, enabledAnswers)
        };
      } else {
        const input = await client.getAnswers(yandexFormIds.day1Input);
        inputContext = normalizeForm(input, day1Date);
      }

      if (customAnswers.day1Output) {
        const table = customAnswers.day1Output;
        const enabledAnswers = table.answers.filter((a: any) => !a.disabled);
        outputContext = {
          count: enabledAnswers.length,
          questionList: table.questionList,
          answers: enabledAnswers,
          markdownTable: convertToMarkdownTable(table.questionList, enabledAnswers)
        };
      } else {
        const output = await client.getAnswers(yandexFormIds.day1Output);
        outputContext = normalizeForm(output, day1Date);
      }

      if (customAnswers.day2) {
        const table = customAnswers.day2;
        const enabledAnswers = table.answers.filter((a: any) => !a.disabled);
        day2Context = {
          count: enabledAnswers.length,
          questionList: table.questionList,
          answers: enabledAnswers,
          markdownTable: convertToMarkdownTable(table.questionList, enabledAnswers)
        };
      } else if (day2Date) {
        const day2 = await client.getAnswers(yandexFormIds.day2);
        day2Context = normalizeForm(day2, day2Date);
      }
    } else {
      const [input, output, day2] = await Promise.all([
        client.getAnswers(yandexFormIds.day1Input),
        client.getAnswers(yandexFormIds.day1Output),
        day2Date ? client.getAnswers(yandexFormIds.day2) : Promise.resolve(null)
      ]);
      inputContext = normalizeForm(input, day1Date);
      outputContext = normalizeForm(output, day1Date);
      day2Context = day2 && day2Date ? normalizeForm(day2, day2Date) : null;
    }

    const totalAnswers = inputContext.count + outputContext.count + (day2Context?.count ?? 0);
    const jobStageReports: Record<string, string> = {};
    let infographicImageUrl = "";
    let llmStatus: "succeeded" | "skipped" = "skipped";
    const blocks = selectedBlocks ?? [];

    updateJob(jobId, { progress: 20, message: "Формы загружены. Запуск ИИ-моделей..." });

    if (totalAnswers > 0 || blocks.includes("infographic") || blocks.includes("infographic-prompt") || blocks.includes("infographic-image") || blocks.includes("publish")) {
      const llm = new GeminiClient(getRuntimeConfig(), "analytics");

      const generateImageViaTextLlm = async (systemPrompt: string, visualPrompt: string, logos: string[], photos: string[]): Promise<string> => {
        const userContent: Array<Record<string, any>> = [
          { type: "text", text: `${systemPrompt}\n\nСгенерированная разметка:\n${visualPrompt}` }
        ];

        logos.forEach(logoBase64 => {
          userContent.push({
            type: "image_url",
            image_url: { url: logoBase64.startsWith("data:") ? logoBase64 : `data:image/png;base64,${logoBase64}` }
          });
        });
        photos.forEach(photoBase64 => {
          userContent.push({
            type: "image_url",
            image_url: { url: photoBase64.startsWith("data:") ? photoBase64 : `data:image/png;base64,${photoBase64}` }
          });
        });

        const config = getRuntimeConfig();
        const localLlm = new LlmClient({
          ...config,
          llmBaseUrl: config.imageServiceUrl || "http://127.0.0.1:8000/v1",
          llmApiKey: config.imageServiceApiKey || "chatgpt2api"
        });

        const responseText = await localLlm.createChatCompletion({
          model: "gpt-image-2",
          messages: [
            { role: "user", content: userContent }
          ],
          temperature: 0.2
        });

        const urlRegex = /(https?:\/\/[^\s\)\"\'\>]+)/gi;
        const base64Regex = /(data:image\/[a-zA-Z0-9+-\/]+;base64,[a-zA-Z0-9+\/=]+)/gi;

        const base64Matches = responseText.match(base64Regex);
        if (base64Matches) {
          return base64Matches[0];
        }

        const urlMatches = responseText.match(urlRegex);
        if (urlMatches) {
          return urlMatches[0];
        }

        throw new Error(`Модель не вернула ссылку на изображение. Ответ: ${responseText}`);
      };

      // --- STEP 1: DAY 1 ANALYTICS ---
      if (blocks.includes("day1")) {
        updateJob(jobId, { progress: 30, message: "Анализ анкет День 1..." });
        const systemPromptDay1 = stagePrompts?.day1 || "Проанализируй анкеты обратной связи участников за День 1. Сделай структурированный отчет на русском языке.";
        const userPromptDay1 = [
          "### Входные анкеты первого дня (Day 1 Input):",
          `Всего ответов: ${inputContext.count}`,
          inputContext.markdownTable,
          "",
          "### Выходные анкеты первого дня (Day 1 Output):",
          `Всего ответов: ${outputContext.count}`,
          outputContext.markdownTable
        ].join("\n");

        jobStageReports.day1 = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptDay1 },
            { role: "user", content: userPromptDay1 }
          ],
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 2: DAY 2 ANALYTICS ---
      if (blocks.includes("day2") && day2Context) {
        updateJob(jobId, { progress: 45, message: "Анализ анкет День 2..." });
        const systemPromptDay2 = stagePrompts?.day2 || "Проанализируй анкеты обратной связи участников за День 2. Сделай структурированный отчет на русском языке.";
        const userPromptDay2 = [
          "### Анкеты обратной связи второго дня (Day 2):",
          `Всего ответов: ${day2Context.count}`,
          day2Context.markdownTable
        ].join("\n");

        jobStageReports.day2 = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptDay2 },
            { role: "user", content: userPromptDay2 }
          ],
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 3: OVERALL SYNTHESIS ---
      if (blocks.includes("overall")) {
        updateJob(jobId, { progress: 60, message: "Синтез результатов стратегической сессии..." });
        const systemPromptOverall = stagePrompts?.overall || "Синтезируй результаты первого и второго дня стратегической сессии в единую аналитическую справку на русском языке.";
        const userPromptOverall = [
          "### Результаты аналитики День 1:",
          stageReports?.day1 || jobStageReports.day1 || "Данные первого дня отсутствуют.",
          "",
          "### Результаты аналитики День 2:",
          stageReports?.day2 || jobStageReports.day2 || "Данные второго дня отсутствуют."
        ].join("\n");

        jobStageReports.overall = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptOverall },
            { role: "user", content: userPromptOverall }
          ],
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 4: PRODUCTS ANALYSIS ---
      if (blocks.includes("products")) {
        updateJob(jobId, { progress: 75, message: "Анализ концепций цифровых продуктов..." });
        const docxFiles = assetFiles?.products ?? [];
        const docxTexts: string[] = [];
        
        for (const f of docxFiles) {
          if (f.base64) {
            const txt = await getDocxText(f.base64);
            if (txt) {
              docxTexts.push(`--- Документ: ${f.name} ---\n${txt}`);
            }
          }
        }

        const systemPromptProducts = stagePrompts?.products || "Проанализируй предложенные на сессии концепции цифровых продуктов.";
        const userPromptProducts = [
          "### Текст загруженных материалов по продуктам:",
          docxTexts.length ? docxTexts.join("\n\n") : "Файлы по продуктам не были загружены или пусты.",
          "",
          "### Результаты общей аналитики сессии (для контекста):",
          stageReports?.overall || jobStageReports.overall || stageReports?.day1 || jobStageReports.day1 || "Контекст сессии отсутствует."
        ].join("\n");

        jobStageReports.products = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPromptProducts },
            { role: "user", content: userPromptProducts }
          ],
          temperature: 0.4,
          maxTokens: 4096
        });
      }

      // --- STEP 5: INFOGRAPHIC PROMPT GENERATION ---
      if (blocks.includes("infographic-prompt")) {
        updateJob(jobId, { progress: 85, message: "Создание структуры инфографики..." });
        const rawSystemPrompt = stagePrompts?.["infographic-prompt"] || stagePrompts?.infographic || "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.";
        const reportContext = stageReports?.overall || stageReports?.day1 || stageReports?.day2 || jobStageReports.overall || jobStageReports.day1 || jobStageReports.day2 || "Данные сессии отсутствуют.";
        
        const visualPrompt = await llm.createChatCompletion({
          messages: [
            { role: "system", content: rawSystemPrompt },
            { role: "user", content: `Данные аналитического отчета сессии для заполнения шаблона:\n\n${reportContext}` }
          ],
          temperature: 0.4,
          maxTokens: 4096
        });

        jobStageReports["infographic-prompt"] = visualPrompt;
      }

      // --- STEP 6: INFOGRAPHIC IMAGE GENERATION ---
      if (blocks.includes("infographic-image")) {
        updateJob(jobId, { progress: 90, message: "Генерация финальной инфографики (ИИ-визуализация)..." });
        const visualPrompt = stageReports?.["infographic-prompt"] || jobStageReports["infographic-prompt"] || stageReports?.infographic || jobStageReports.infographic || "";
        if (!visualPrompt) {
          throw new Error("Отсутствует промпт для генерации инфографики.");
        }

        try {
          const basePrompt = stagePrompts?.infographicImage || stagePrompts?.["infographic-image"] || "Создай красивую бизнес-инфографику на основе предоставленной разметки. Стиль: современный, чистый, корпоративный. Цвета должны гармонировать с логотипом. Размести логотип и фотографии участников в подходящих местах.";

          const logos = assetFiles?.logo?.slice(0, 2).map((f: any) => f.base64) || [];
          const photos = assetFiles?.generalPhoto?.slice(0, 2).map((f: any) => f.base64) || [];

          infographicImageUrl = await generateImageViaTextLlm(basePrompt, visualPrompt, logos, photos);
          jobStageReports["infographic-image"] = `Изображение инфографики успешно сгенерировано.`;
        } catch (imgError: any) {
          console.error("Failed to generate image with model gpt-5.5:", imgError);
          jobStageReports["infographic-image"] = `Ошибка генерации изображения.`;
          await handleImageLimitError(imgError.message || String(imgError));
          throw imgError;
        }
      }

      // Backward compatibility for standard infographic block
      if (blocks.includes("infographic")) {
        updateJob(jobId, { progress: 90, message: "Генерация инфографики..." });
        const rawSystemPrompt = stagePrompts?.infographic || "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.";
        const reportContext = stageReports?.overall || stageReports?.day1 || stageReports?.day2 || jobStageReports.overall || jobStageReports.day1 || jobStageReports.day2 || "Данные сессии отсутствуют.";
        
        try {
          const visualPrompt = await llm.createChatCompletion({
            messages: [
              { role: "system", content: rawSystemPrompt },
              { role: "user", content: `Данные аналитического отчета сессии для заполнения шаблона:\n\n${reportContext}` }
            ],
            temperature: 0.4,
            maxTokens: 4096
          });

          const basePrompt = stagePrompts?.infographicImage || "Создай красивую бизнес-инфографику на основе предоставленной разметки. Стиль: современный, чистый, корпоративный. Цвета должны гармонировать с логотипом. Размести логотип и фотографии участников в подходящих местах.";

          const logos = assetFiles?.logo?.slice(0, 2).map((f: any) => f.base64) || [];
          const photos = assetFiles?.generalPhoto?.slice(0, 2).map((f: any) => f.base64) || [];

          infographicImageUrl = await generateImageViaTextLlm(basePrompt, visualPrompt, logos, photos);
          
          jobStageReports.infographic = `# Инфографика\n\nМакет инфографики:\n${visualPrompt}`;
        } catch (imgError: any) {
          console.error("Failed to generate image:", imgError);
          jobStageReports.infographic = `# Инфографика\n\nОшибка генерации изображения.`;
          await handleImageLimitError(imgError.message || String(imgError));
          throw imgError;
        }
      }

      // --- STEP 7: PUBLISH TO OPEN NOTEBOOK ---
      if (blocks.includes("publish")) {
        updateJob(jobId, { progress: 92, message: "Публикация отчетов в Open Notebook..." });
        try {
          const notebookClient = new OpenNotebookClient();
          const namePrefix = payload.customReportName?.trim() || "Аналитика сессии";
          let formattedDate = day1Date;
          if (day1Date && /^\d{4}-\d{2}-\d{2}$/.test(day1Date)) {
            const [year, month, day] = day1Date.split("-");
            formattedDate = `${day}.${month}.${year}`;
          }
          const notebookName = `${namePrefix} - ${formattedDate}`;
          const notebookDesc = `Аналитические отчеты стратегической сессии от ${formattedDate}`;
          
          console.log(`Open Notebook: Getting or creating notebook "${notebookName}"...`);
          const notebookId = await notebookClient.getOrCreateNotebook(notebookName, notebookDesc);
          console.log(`Open Notebook: Notebook resolved with ID: ${notebookId}`);

          const reportsToPublish = [
            { key: "day1", title: `${namePrefix} ${formattedDate} день 1` },
            { key: "day2", title: `${namePrefix} ${formattedDate} день 2` },
            { key: "overall", title: `${namePrefix} ${formattedDate} итоговая` }
          ];

          let uploadCount = 0;
          for (const report of reportsToPublish) {
            const content = stageReports?.[report.key] || jobStageReports[report.key];
            if (content && content.trim() && !content.includes("Ошибка генерации")) {
              console.log(`Open Notebook: Uploading document "${report.title}"...`);
              await notebookClient.createSource([notebookId], report.title, content, true, true);
              uploadCount++;
            }
          }

          jobStageReports.publish = `Успешно опубликовано ${uploadCount} отчетов в Open Notebook (Блокнот ID: ${notebookId})`;
          console.log(`Open Notebook: Successfully published ${uploadCount} reports.`);
        } catch (publishError: any) {
          console.error("Failed to publish to Open Notebook:", publishError);
          jobStageReports.publish = `Ошибка публикации в Open Notebook: ${publishError.message || publishError}`;
          throw publishError;
        }
      }

      llmStatus = "succeeded";
    }

    const mergedStageReports = {
      ...stageReports,
      ...jobStageReports
    };

    const reportMarkdown = [
      mergedStageReports.day1,
      mergedStageReports.day2,
      mergedStageReports.overall,
      mergedStageReports.products,
      mergedStageReports["infographic-prompt"] ? `# Подготовка промта для инфографики\n\n${mergedStageReports["infographic-prompt"]}` : null,
      mergedStageReports["infographic-image"] ? `# Инфографика\n\n${mergedStageReports["infographic-image"]}` : null,
      mergedStageReports.infographic
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const run: ProcessRun = {
      id: `analytics-day1-${day1Date}`,
      toolType: "analytics",
      title: `Аналитика День 1 - ${day1Date}`,
      status: (totalAnswers > 0 || blocks.includes("infographic-prompt") || blocks.includes("infographic-image") || blocks.includes("publish")) ? "succeeded" : "failed",
      progress: 100,
      startedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
      steps: [
        { id: "fetch-forms", title: "Загрузка форм", description: "Снимки Яндекс Форм для выбранной сессии.", status: "succeeded" as const },
        { id: "normalize", title: "Нормализация", description: "Сопоставление ответов, расчет метрик, проверка структуры.", status: "succeeded" as const },
        { id: "llm", title: "ИИ-аналитика", description: "Генерация отчетов и ИИ-анализ ответов.", status: llmStatus === "succeeded" ? "succeeded" as const : "skipped" as const },
        { id: "publish", title: "Публикация", description: "Сохранение и публикация результатов сессии.", status: blocks.includes("publish") ? "succeeded" as const : "pending" as const }
      ]
    };
    saveProcessRun(run);

    updateJob(jobId, {
      status: "succeeded",
      progress: 100,
      message: "Анализ успешно завершен.",
      result: JSON.stringify({
        status: (totalAnswers > 0 || blocks.includes("infographic-prompt") || blocks.includes("infographic-image")) ? "ready" : "no_data",
        run,
        stats: {
          inputCount: inputContext?.count ?? 0,
          outputCount: outputContext?.count ?? 0,
          day2Count: day2Context?.count ?? 0
        },
        day1Context: inputContext || outputContext ? {
          input: inputContext,
          output: outputContext
        } : undefined,
        day2Context,
        reportMarkdown,
        infographicImageUrl,
        stageReports: buildStageReports(payload, jobStageReports),
        message:
          (totalAnswers > 0 || blocks.includes("infographic-prompt") || blocks.includes("infographic-image"))
            ? "Данные обработаны успешно."
            : "За выбранную дату в формах нет ответов."
      })
    });
  } catch (error: any) {
    console.error("Analytics pipeline error:", error);
    updateJob(jobId, {
      status: "failed",
      progress: 100,
      message: `Ошибка аналитики: ${error.message || error}`,
      error: error.message || String(error)
    });
  }
}

async function workerLoop() {
  console.log("=== Background Worker Started ===");
  
  // Run stale job reaper on startup
  reapStaleJobs(true);
  
  let iterations = 0;
  while (true) {
    try {
      // Periodic stale job reaping (every 30 seconds)
      iterations++;
      if (iterations % 30 === 0) {
        reapStaleJobs(false);
      }

      const job = getNextJob();
      if (job) {
        console.log(`Processing job ${job.id} of type ${job.type}...`);
        const payload = JSON.parse(job.payload);
        
        if (job.type === "protocol") {
          await processProtocolJob(job.id, payload);
        } else if (job.type === "analytics") {
          await processAnalyticsJob(job.id, payload);
        } else {
          console.warn(`Unknown job type: ${job.type}`);
          updateJob(job.id, { status: "failed", message: `Неизвестный тип задачи: ${job.type}` });
        }
      }
    } catch (err) {
      console.error("Error in worker loop iteration:", err);
    }
    
    // Sleep for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

workerLoop();
