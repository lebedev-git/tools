import { GeminiClient, getRuntimeConfig } from "@tools/integrations";
import type { ProcessRun } from "@tools/core";
import type { ProtocolRecord } from "@tools/protocols";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
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
      try {
        const gemini = new GeminiClient();
        let finalTranscript = "";

        if (file) {
          // --- STAGE 1: Uploading & Pre-processing ---
          sendUpdate({ status: "running", stage: "upload", progress: 5, message: "Сохранение файла на сервере..." });
          
          tempDir = join(process.cwd(), ".data", "temp", `${protocolId}-${Date.now()}`);
          await mkdir(tempDir, { recursive: true });

          const inputExtension = file.name.split(".").pop() || "media";
          const tempInputPath = join(tempDir, `input.${inputExtension}`);
          const fileBuffer = Buffer.from(await file.arrayBuffer());
          await writeFile(tempInputPath, fileBuffer);

          // --- STAGE 2: Conversion ---
          sendUpdate({ status: "running", stage: "convert", progress: 15, message: "Конвертация в оптимизированный аудиоформат MP3..." });
          const tempOutputPath = join(tempDir, "output.mp3");

          // Conversion parameters: mono, 96 kbps, 22050 Hz
          const convertArgs = [
            "-i", tempInputPath,
            "-vn",
            "-acodec", "libmp3lame",
            "-b:a", "96k",
            "-ar", "22050",
            "-ac", "1",
            tempOutputPath,
            "-y"
          ];
          await runFFmpeg(convertArgs);

          // --- STAGE 3: Splitting ---
          sendUpdate({ status: "running", stage: "split", progress: 30, message: "Разбивка аудиозаписи на сегменты по 10 минут..." });
          const splitArgs = [
            "-i", tempOutputPath,
            "-f", "segment",
            "-segment_time", "600",
            "-c", "copy",
            join(tempDir, "chunk_%03d.mp3"),
            "-y"
          ];
          await runFFmpeg(splitArgs);

          // Read all chunk files
          const filesInTemp = await readdir(tempDir);
          const chunkFiles = filesInTemp
            .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
            .sort();

          if (chunkFiles.length === 0) {
            throw new Error("Не удалось разделить аудиофайл на части.");
          }

          // --- STAGE 4: Transcription of each chunk ---
          const transcripts: string[] = [];
          for (let i = 0; i < chunkFiles.length; i++) {
            const chunkFile = chunkFiles[i];
            const percent = 35 + Math.round((i / chunkFiles.length) * 45); // 35% to 80%
            sendUpdate({
              status: "running",
              stage: "transcribe",
              progress: percent,
              message: `Распознавание речи: часть ${i + 1} из ${chunkFiles.length}...`
            });

            const chunkPath = join(tempDir, chunkFile);
            const chunkBuffer = await readFile(chunkPath);
            const base64 = chunkBuffer.toString("base64");

            const chunkTranscript = await gemini.transcribeAudio(base64, "audio/mp3", transcriptPrompt);
            transcripts.push(chunkTranscript);

            sendUpdate({
              status: "running",
              stage: "transcribe",
              progress: percent,
              message: `Часть ${i + 1} из ${chunkFiles.length} распознана успешно.`,
              currentTranscript: transcripts.join("\n\n")
            });
          }

          finalTranscript = transcripts.join("\n\n");
        } else {
          // No file uploaded, use text transcript
          if (!textTranscript || !textTranscript.trim()) {
            throw new Error("Стенограмма встречи пуста. Пожалуйста, введите текст стенограммы или загрузите файл.");
          }
          finalTranscript = textTranscript;
        }

        // --- STAGE 5: Protocol Generation via Gemini ---
        sendUpdate({ 
          status: "running", 
          stage: "extract", 
          progress: 85, 
          message: "Анализ стенограммы и создание протокола встречи...",
          currentTranscript: finalTranscript
        });
        
        const extractedData = await gemini.generateProtocol(finalTranscript, prompt);

        // Calculate decisions and tasks count
        const decisionsCount = extractedData.decisionsText
          ? extractedData.decisionsText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0).length
          : 0;
        const tasksCount = extractedData.tasksText
          ? extractedData.tasksText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0).length
          : 0;

        // --- STAGE 6: Saving update on server ---
        sendUpdate({ status: "running", stage: "save", progress: 95, message: "Сохранение протокола..." });

        const listPath = protocolsPath();
        let protocols: ProtocolRecord[] = [];
        try {
          protocols = JSON.parse(await readFile(listPath, "utf-8"));
        } catch {
          // If no stored protocols, use sample
        }

        const protocolIndex = protocols.findIndex((p) => p.id === protocolId);
        if (protocolIndex !== -1) {
          protocols[protocolIndex] = {
            ...protocols[protocolIndex],
            transcript: finalTranscript,
            theme: extractedData.theme || "",
            agenda: extractedData.agenda || "",
            keyPoints: extractedData.keyPoints || "",
            decisionsText: extractedData.decisionsText || "",
            tasksText: extractedData.tasksText || "",
            responsible: extractedData.responsible || "",
            deadlines: extractedData.deadlines || "",
            risks: extractedData.risks || "",
            attachments: extractedData.attachments || "",
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
            { id: "source", title: "Источник", description: "Медиафайл загружен и сконвертирован", status: "succeeded" },
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
          extractedData,
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
