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
  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  public async createChatCompletion(options: ChatCompletionOptions): Promise<string> {
    if (!this.config.llmApiKey) {
      throw new Error("LLM_API_KEY is not configured.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.config.llmBaseUrl}${this.config.llmChatCompletionsPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.llmApiKey}`,
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
      if (error.name === "AbortError") {
        throw new Error("LLM request timed out after 120 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
