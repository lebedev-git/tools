import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

    const response = await fetch(`${this.config.llmBaseUrl}${this.config.llmChatCompletionsPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model ?? "qwen3.7-max",
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 4096
      })
    });

    const body = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      throw new Error(body.error?.message || `LLM provider returned ${response.status}.`);
    }

    const content = body.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("LLM provider returned an empty response.");
    }

    return content;
  }
}
