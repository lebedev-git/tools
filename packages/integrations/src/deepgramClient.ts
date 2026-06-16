import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface DeepgramUtterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

export interface DeepgramTranscriptionResult {
  /** Plain full transcript without speaker labels. */
  transcript: string;
  /** Transcript grouped by speaker as "Спикер N: ...". */
  diarizedText: string;
  /** Raw utterances with speaker tags and timestamps. */
  utterances: DeepgramUtterance[];
  /** Number of distinct speakers detected. */
  speakerCount: number;
}

export interface DeepgramTranscribeOptions {
  language?: string;
  model?: string;
}

/**
 * Client for Deepgram pre-recorded Speech-to-Text with speaker diarization.
 * Handles long audio (hours) in a single request — no chunking required, so
 * speaker labels stay consistent across the whole recording.
 */
export class DeepgramClient {
  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  private getApiKey(): string {
    const key = this.config.deepgramApiKey;
    if (!key) {
      throw new Error("DEEPGRAM_API_KEY is not configured in environment variables.");
    }
    return key;
  }

  private getBaseUrl(): string {
    const raw = this.config.deepgramBaseUrl;
    const base = raw && raw.trim() ? raw.trim() : "https://api.deepgram.com";
    return base.endsWith("/") ? base.slice(0, -1) : base;
  }

  /**
   * Transcribes an audio buffer and returns a diarized transcript.
   * Retries on transient (5xx / network / timeout) errors.
   */
  public async transcribeWithDiarization(
    audio: Buffer,
    mimeType: string = "audio/mp3",
    opts: DeepgramTranscribeOptions = {},
    retries = 2,
    delay = 3000
  ): Promise<DeepgramTranscriptionResult> {
    const apiKey = this.getApiKey();
    const model = opts.model ?? this.config.deepgramModel ?? "nova-2";
    const language = opts.language ?? "ru";

    const params = new URLSearchParams({
      model,
      language,
      diarize: "true",
      punctuate: "true",
      smart_format: "true",
      utterances: "true"
    });
    const url = `${this.getBaseUrl()}/v1/listen?${params.toString()}`;

    const controller = new AbortController();
    // 20 minutes — generous headroom for multi-hour files.
    const timeoutId = setTimeout(() => controller.abort(), 1200000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": mimeType
        },
        body: new Uint8Array(audio),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Deepgram API returned status ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
      const transcript: string = (alternative?.transcript ?? "").trim();
      const rawUtterances: any[] = Array.isArray(data?.results?.utterances) ? data.results.utterances : [];

      const utterances: DeepgramUtterance[] = rawUtterances
        .map((u) => ({
          speaker: typeof u.speaker === "number" ? u.speaker : 0,
          transcript: String(u.transcript ?? "").trim(),
          start: typeof u.start === "number" ? u.start : 0,
          end: typeof u.end === "number" ? u.end : 0
        }))
        .filter((u) => u.transcript.length > 0);

      if (!transcript && utterances.length === 0) {
        throw new Error("Deepgram returned an empty transcription result.");
      }

      const diarizedText = DeepgramClient.formatDiarized(utterances) || transcript;
      const speakerCount = new Set(utterances.map((u) => u.speaker)).size;

      return { transcript, diarizedText, utterances, speakerCount };
    } catch (error: any) {
      if (error.name === "AbortError") {
        if (retries > 0) {
          console.warn(`Deepgram request timed out. Retrying in ${delay}ms... (${retries} attempts left).`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.transcribeWithDiarization(audio, mimeType, opts, retries - 1, delay * 2);
        }
        throw new Error("Deepgram transcription request timed out.");
      }

      const is5xx = /status 5\d\d/.test(error.message ?? "");
      const is429 = (error.message ?? "").includes("status 429");
      const isNetwork = error.name === "TypeError" || (error.message ?? "").includes("fetch failed");

      if (retries > 0 && (is5xx || is429 || isNetwork)) {
        console.warn(`Deepgram operation failed. Retrying in ${delay}ms... (${retries} attempts left). Error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.transcribeWithDiarization(audio, mimeType, opts, retries - 1, delay * 2);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Groups consecutive utterances by speaker into a readable dialogue:
   *   Спикер 0: ...
   *   Спикер 1: ...
   */
  public static formatDiarized(utterances: DeepgramUtterance[]): string {
    if (!utterances.length) {
      return "";
    }

    const blocks: string[] = [];
    let currentSpeaker = -1;
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length > 0) {
        blocks.push(`Спикер ${currentSpeaker}: ${buffer.join(" ").trim()}`);
        buffer = [];
      }
    };

    for (const utterance of utterances) {
      if (utterance.speaker !== currentSpeaker) {
        flush();
        currentSpeaker = utterance.speaker;
      }
      buffer.push(utterance.transcript);
    }
    flush();

    return blocks.join("\n\n");
  }
}
