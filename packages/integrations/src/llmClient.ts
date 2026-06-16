import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, any>>;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class LlmClient {
  private currentKeyIndex = 0;

  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  private getApiKeys(): string[] {
    const rawKeys = this.config.llmApiKey;
    if (!rawKeys) {
      throw new Error("LLM_API_KEY is not configured.");
    }
    const keys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new Error("No valid keys found in LLM_API_KEY.");
    }
    return keys;
  }

  private getApiKey(keys: string[]): string {
    return keys[this.currentKeyIndex % keys.length];
  }

  private rotateKey(keys: string[]): void {
    if (keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
      console.warn(`LLM API key rotated. New active index: ${this.currentKeyIndex}`);
    }
  }

  public async createChatCompletion(options: ChatCompletionOptions): Promise<string> {
    const keys = this.getApiKeys();
    return this.executeWithRetry(options, keys, 3, 2000);
  }

  private async executeWithRetry(
    options: ChatCompletionOptions,
    keys: string[],
    retries = 3,
    delay = 2000
  ): Promise<string> {
    const apiKey = this.getApiKey(keys);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.config.llmBaseUrl}${this.config.llmChatCompletionsPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: options.model ?? this.config.llmModel ?? "qwen3.7-max",
          messages: options.messages,
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxTokens ?? 4096
        }),
        signal: controller.signal
      });

      const body = (await response.json()) as ChatCompletionResponse;

      if (!response.ok) {
        throw new Error(body.error?.message || `LLM provider returned ${response.status}.`);
      }

      const content = body.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("LLM provider returned an empty response.");
      }

      // Strip trailing metadata details injected by proxy routers
      let cleaned = content.replace(/<details>[\s\S]*?<\/details>/gi, "");
      cleaned = cleaned.replace(/Response ID:\s*[a-f0-9-]+\s*/gi, "");
      cleaned = cleaned.replace(/Request ID:\s*[a-f0-9-]+\s*/gi, "");
      return cleaned.trim();
    } catch (error: any) {
      const isRateLimit = error.message?.includes("Rate limit") || error.message?.includes("rate limit") || error.message?.includes("429") || error.message?.includes("Limit reached");
      const is5xx = error.message?.includes("500") || error.message?.includes("503") || error.message?.includes("502");
      const isTimeout = error.message?.includes("timed out") || error.name === "AbortError";
      const isNetwork = error.name === "TypeError" || error.message?.includes("fetch failed");

      if (retries > 0 && (isRateLimit || is5xx || isTimeout || isNetwork)) {
        if (isRateLimit || is5xx) {
          this.rotateKey(keys);
        }
        console.warn(`LLM API operation failed. Retrying in ${delay}ms... (${retries} attempts left). Error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(options, keys, retries - 1, delay * 2);
      }

      if (error.name === "AbortError") {
        throw new Error("LLM request timed out after 120 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
