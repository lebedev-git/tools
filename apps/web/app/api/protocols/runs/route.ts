import { GeminiClient, getRuntimeConfig } from "@tools/integrations";
import type { ProcessRun } from "@tools/core";
import type { ProtocolRecord } from "@tools/protocols";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

// Helper to run ffmpeg command
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
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

function ensureString(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(item => ensureString(item)).join("\n");
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => {
        const valStr = ensureString(v);
        if (/^\d+$/.test(k)) return valStr;
        return `${k}: ${valStr}`;
      })
      .join("\n");
  }
  return String(val);
}

function protocolsPath() {
  return join(process.cwd(), getRuntimeConfig().storagePath, "protocols", "list.json");
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let protocolId = "";
  let prompt = "";
  let file: File | null = null;
  let textTranscript = "";
  let transcriptPrompt = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      file = formData.get("file") as File | null;
      protocolId = formData.get("protocolId") as string;
      prompt = formData.get("prompt") as string;
      transcriptPrompt = formData.get("transcriptPrompt") as string || "";
    } else {
      const payload = await request.json();
      protocolId = payload.protocolId;
      prompt = payload.prompt;
      textTranscript = payload.transcript;
      transcriptPrompt = payload.transcriptPrompt || "";
    }
  } catch (err) {
    return Response.json(
      { status: "error", message: "Не удалось распарсить запрос: " + (err instanceof Error ? err.message : String(err)) },
      { status: 400 }
    );
  }

  if (!protocolId) {
    return Response.json({ status: "error", message: "Не указан protocolId." }, { status: 400 });
  }

  // Create stream response for realtime progress
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      let tempDir = "";
      let uploadResultName = "";
      try {
        const gemini = new GeminiClient();
        let finalTranscript = "";

        if (file) {
          const originalMime = file.type || "application/octet-stream";
          const isAudio = originalMime.startsWith("audio/");

          // --- STAGE 1: Uploading & Pre-processing ---
          sendUpdate({ status: "running", stage: "upload", progress: 5, message: "Сохранение файла на сервере..." });
          
          tempDir = join(process.cwd(), ".data", "temp", `${protocolId}-${Date.now()}`);
          await mkdir(tempDir, { recursive: true });

          const inputExtension = file.name.split(".").pop() || "media";
          const tempInputPath = join(tempDir, `input.${inputExtension}`);
          const fileBuffer = Buffer.from(await file.arrayBuffer());
          await writeFile(tempInputPath, fileBuffer);

          let audioBuffer: Buffer;
          let audioMimeType: string;
          const outputMime = "audio/mp3";

          if (isAudio && originalMime !== "audio/webm" && originalMime !== "audio/ogg") {
            // If it is already a standard audio format, use it directly to bypass ffmpeg
            sendUpdate({ status: "running", stage: "convert", progress: 15, message: "Файл уже является аудиоформатом. Оптимизация не требуется." });
            audioBuffer = fileBuffer;
            audioMimeType = originalMime;
          } else {
            // --- STAGE 2: Conversion ---
            sendUpdate({ status: "running", stage: "convert", progress: 15, message: "Извлечение и оптимизация аудиодорожки через FFmpeg..." });
            const tempOutputPath = join(tempDir, "output.mp3");

            // Extract audio with good quality: stereo, 128 kbps, 44100 Hz
            const convertArgs = [
              "-i", tempInputPath,
              "-vn",
              "-acodec", "libmp3lame",
              "-b:a", "128k",
              "-ar", "44100",
              tempOutputPath,
              "-y"
            ];
            await runFFmpeg(convertArgs);

            audioBuffer = await readFile(tempOutputPath);
            audioMimeType = outputMime;
          }

          // --- STAGE 3: Google File API Upload ---
          sendUpdate({ status: "running", stage: "google_upload", progress: 30, message: "Загрузка аудио в Google Cloud..." });
          const cloudDisplayName = `proto_${protocolId}_${Date.now()}`;
          const uploadResult = await gemini.uploadFile(audioBuffer, audioMimeType, cloudDisplayName);
          uploadResultName = uploadResult.name;

          // --- STAGE 4: Wait for file processing ---
          let state = "PROCESSING";
          let attempts = 0;
          sendUpdate({ status: "running", stage: "google_upload", progress: 45, message: "Ожидание обработки аудиофайла в Google Cloud..." });

          while (state === "PROCESSING" && attempts < 60) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const fileInfo = await gemini.getFileState(uploadResult.name);
            state = fileInfo.state;
            attempts++;
            sendUpdate({
              status: "running",
              stage: "google_upload",
              progress: Math.min(45 + attempts * 2, 75),
              message: `Обработка аудиофайла в Google Cloud... (попытка ${attempts})`
            });
          }

          if (state !== "ACTIVE") {
            throw new Error(`Не удалось обработать аудиофайл в Google Cloud. Статус: ${state}`);
          }

          // --- STAGE 5: Transcription ---
          sendUpdate({ status: "running", stage: "transcribe", progress: 80, message: "Распознавание речи по всей записи..." });
          finalTranscript = await gemini.transcribeAudioFromFileUri(uploadResult.uri, audioMimeType, transcriptPrompt);

          sendUpdate({
            status: "running",
            stage: "transcribe",
            progress: 85,
            message: "Стенограмма встречи успешно подготовлена.",
            currentTranscript: finalTranscript
          });
        } else {
          // No file uploaded, use text transcript
          if (!textTranscript || !textTranscript.trim()) {
            throw new Error("Стенограмма встречи пуста. Пожалуйста, введите текст стенограммы или загрузите файл.");
          }
          finalTranscript = textTranscript;
        }

        // --- STAGE 6: Protocol Generation via Gemini ---
        sendUpdate({ 
          status: "running", 
          stage: "extract", 
          progress: 90, 
          message: "Анализ стенограммы и создание протокола встречи...",
          currentTranscript: finalTranscript
        });
        
        const extractedData = await gemini.generateProtocol(finalTranscript, prompt);

        // Normalize fields to string to prevent any issues with arrays/objects returned by AI
        const theme = ensureString(extractedData?.theme);
        const agenda = ensureString(extractedData?.agenda);
        const keyPoints = ensureString(extractedData?.keyPoints);
        const decisionsText = ensureString(extractedData?.decisionsText);
        const tasksText = ensureString(extractedData?.tasksText);
        const responsible = ensureString(extractedData?.responsible);
        const deadlines = ensureString(extractedData?.deadlines);
        const risks = ensureString(extractedData?.risks);
        const attachments = ensureString(extractedData?.attachments);

        const normalizedData = {
          theme,
          agenda,
          keyPoints,
          decisionsText,
          tasksText,
          responsible,
          deadlines,
          risks,
          attachments
        };

        // Calculate decisions and tasks count strictly by bullet markers
        const decisionsCount = decisionsText
          ? decisionsText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
          : 0;
        const tasksCount = tasksText
          ? tasksText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
          : 0;

        // --- STAGE 7: Saving update on server ---
        sendUpdate({ status: "running", stage: "save", progress: 95, message: "Сохранение протокола..." });

        const listPath = protocolsPath();
        let protocols: ProtocolRecord[] = [];
        try {
          protocols = JSON.parse(await readFile(listPath, "utf-8"));
        } catch {
          // If no stored protocols
        }

        const protocolIndex = protocols.findIndex((p) => p.id === protocolId);
        if (protocolIndex !== -1) {
          protocols[protocolIndex] = {
            ...protocols[protocolIndex],
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
          await writeFile(listPath, JSON.stringify(protocols, null, 2), "utf-8");
        }

        // Final run model metadata
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

        sendUpdate({
          status: "succeeded",
          stage: "done",
          progress: 100,
          extractedData: normalizedData,
          finalTranscript,
          run
        });
      } catch (error: unknown) {
        console.error("Error during protocol generation pipeline:", error);
        sendUpdate({
          status: "failed",
          stage: "error",
          progress: 100,
          message: error instanceof Error ? error.message : "Произошла неизвестная ошибка при обработке."
        });
      } finally {
        // Cleanup temp folder if created
        if (tempDir) {
          try {
            await rm(tempDir, { recursive: true, force: true });
          } catch (cleanupErr) {
            console.error("Failed to clean up temp directory:", tempDir, cleanupErr);
          }
        }
        // Cleanup Google File API file
        if (uploadResultName) {
          try {
            const gemini = new GeminiClient();
            await gemini.deleteFile(uploadResultName);
          } catch (cleanupCloudErr) {
            console.error("Failed to clean up file from Google Cloud:", uploadResultName, cleanupCloudErr);
          }
        }
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
