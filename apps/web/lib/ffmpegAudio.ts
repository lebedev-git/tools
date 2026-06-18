// Browser-side audio extraction/compression via ffmpeg.wasm.
//
// Why: the protocol worker downsamples every upload to 16 kHz mono before
// transcription anyway. By doing that compression in the browser BEFORE upload,
// a ~240 MB meeting video becomes a ~5 MB audio file, so the upload over the
// user's (often VPN-routed) uplink drops from minutes to seconds.
//
// Loading strategy: the UMD build (ffmpeg + util + core) is loaded from a CDN
// at runtime and the worker is passed explicitly via `classWorkerURL`. This is
// deliberately decoupled from the app bundler — Next/turbopack does not resolve
// ffmpeg's internal `new Worker(new URL(...))`, which makes `load()` hang. The
// CDN files are cached by the browser after the first run.
//
// Everything here is client-only and must be imported dynamically from a
// "use client" component. On any failure the caller falls back to uploading the
// original file, so this is a best-effort optimisation, never a hard dependency.

// Self-hosted from /public/ffmpeg (populated at build time by scripts/copy-ffmpeg.mjs).
// Same-origin real URLs are required: ffmpeg.js derives its webpack public path
// from its own <script> src and spawns the classic worker (814.ffmpeg.js) from
// there. Blob URLs break that chunk resolution; a CDN cross-origin worker is
// blocked by the browser. Hence same-origin files.
const FF_BASE = "/ffmpeg";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ffmpeg="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.dataset.ffmpeg = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(s);
  });
}

async function fetchFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFFmpeg(): Promise<any> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    await loadScript(`${FF_BASE}/ffmpeg.js`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasm = (window as any).FFmpegWASM;
    if (!wasm || !wasm.FFmpeg) throw new Error("FFmpegWASM не инициализировался");
    const { FFmpeg } = wasm;
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: `${FF_BASE}/ffmpeg-core.js`,
      wasmURL: `${FF_BASE}/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  })().catch((err) => {
    ffmpegPromise = null; // allow a later retry after a transient failure
    throw err;
  });
  return ffmpegPromise;
}

export interface ExtractAudioOptions {
  /** Progress ratio in the range 0..1 (best-effort, may be coarse). */
  onProgress?: (ratio: number) => void;
}

/**
 * Decodes any audio/video file and re-encodes the audio track to a 16 kHz mono
 * MP3 — the exact format the transcription pipeline uses. Returns a new File
 * (named `<original>.mp3`). Throws on unsupported input or out-of-memory; the
 * caller should fall back to the original file in that case.
 */
export async function extractAudioMp3(
  file: File,
  opts: ExtractAudioOptions = {}
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    if (opts.onProgress) {
      opts.onProgress(Math.max(0, Math.min(1, progress)));
    }
  };
  ffmpeg.on("progress", progressHandler);

  const inputName = "input_media";
  const outputName = "output.mp3";

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i", inputName,
      "-vn",            // drop any video track
      "-ac", "1",       // mono
      "-ar", "16000",   // 16 kHz
      "-b:a", "64k",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes: Uint8Array = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const blob = new Blob([bytes as BlobPart], { type: "audio/mpeg" });
    const base = file.name.replace(/\.[^./\\]+$/, "") || "audio";
    return new File([blob], `${base}.mp3`, { type: "audio/mpeg" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
  }
}
