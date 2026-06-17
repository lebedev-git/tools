import { addJob } from "@tools/db";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";

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

  try {
    let tempInputPath = "";
    let originalMime = "";

    if (file) {
      const storagePath = process.env.STORAGE_PATH || ".data/storage";
      const dataDir = isAbsolute(storagePath) 
        ? dirname(storagePath) 
        : join(findMonorepoRoot(), dirname(storagePath));
      const tempDir = join(dataDir, "temp");
      await mkdir(tempDir, { recursive: true });

      originalMime = file.type || "application/octet-stream";
      const inputExtension = file.name.split(".").pop() || "media";
      tempInputPath = join(tempDir, `upload-${protocolId}-${Date.now()}.${inputExtension}`);
      
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      await writeFile(tempInputPath, fileBuffer);
    }

    // Add job to the SQLite background jobs queue
    const jobPayload = {
      protocolId,
      prompt,
      transcriptPrompt,
      tempInputPath: tempInputPath || null,
      originalMime: originalMime || null,
      textTranscript: tempInputPath ? null : textTranscript
    };

    const jobId = addJob("protocol", jobPayload);

    return Response.json({
      status: "queued",
      jobId
    });
  } catch (error: any) {
    console.error("Error during protocol generation initialization:", error);
    return Response.json({
      status: "error",
      message: error instanceof Error ? error.message : "Произошла ошибка при инициализации задачи."
    }, { status: 500 });
  }
}
