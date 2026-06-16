import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export class GeminiClient {
  public constructor(
    private readonly config: RuntimeConfig = getRuntimeConfig(),
    private readonly workspace: "analytics" | "protocols" = "protocols"
  ) {}

  private getBaseUrl(): string {
    const raw = this.config.geminiBaseUrl;
    if (raw) {
      return raw.endsWith("/") ? raw.slice(0, -1) : raw;
    }
    return "https://generativelanguage.googleapis.com";
  }

  private currentKeyIndex = 0;

  private getApiKeys(): string[] {
    const rawKeys = this.workspace === "analytics"
      ? (this.config.geminiApiKeyAnalytics || this.config.geminiApiKey)
      : (this.config.geminiApiKeyProtocols || this.config.geminiApiKey);
    if (!rawKeys) {
      throw new Error(`GEMINI_API_KEY is not configured for workspace ${this.workspace}.`);
    }
    const keys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new Error(`No valid keys found for workspace ${this.workspace}.`);
    }
    return keys;
  }

  private getApiKey(keys: string[]): string {
    return keys[this.currentKeyIndex % keys.length];
  }

  private rotateKey(keys: string[]): void {
    if (keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
      console.warn(`Gemini API key rotated. New active index: ${this.currentKeyIndex}`);
    }
  }

  private async executeWithRetry<T>(
    operation: (apiKey: string, modelName: string) => Promise<T>,
    retries = 4,
    delay = 2000,
    modelName?: string
  ): Promise<T> {
    const activeModel = modelName ?? (this.workspace === "analytics"
      ? (this.config.geminiModelAnalytics ?? "gemini-2.5-flash")
      : (this.config.geminiModelProtocols ?? "gemini-2.5-flash"));

    const keys = this.getApiKeys();
    const apiKey = this.getApiKey(keys);
    try {
      return await operation(apiKey, activeModel);
    } catch (error: any) {
      const is503 = error.message?.includes("status 503") || error.message?.includes("Service Unavailable") || error.message?.includes("temporary");
      const is429 = error.message?.includes("status 429") || error.message?.includes("Quota exceeded");
      const is500 = error.message?.includes("status 500");
      const isTimeout = error.message?.includes("timed out");
      const isNetwork = error.name === "TypeError" || error.message?.includes("fetch failed");
      const isAuthError = error.message?.includes("status 401") || error.message?.includes("status 403") || error.message?.includes("API key not valid");

      if (retries > 0 && (is503 || is429 || is500 || isTimeout || isNetwork || isAuthError)) {
        if (is429 || is503 || isAuthError) {
          this.rotateKey(keys);
        }
        
        let nextModel = activeModel;
        if ((is503 || is429) && activeModel === "gemini-2.5-flash") {
          console.warn(`Gemini model ${activeModel} overloaded or rate-limited. Falling back to gemini-2.0-flash.`);
          nextModel = "gemini-2.0-flash";
        }

        console.warn(`Gemini API operation failed. Retrying in ${delay}ms... (${retries} attempts left). Error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retries - 1, delay * 2, nextModel);
      }
      if (is429 && (error.message?.includes("limit: 0") || error.message?.includes("RESOURCE_EXHAUSTED"))) {
        throw new Error("Превышена квота Gemini (limit: 0). Пожалуйста, убедитесь, что на сервере включен VPN (Google блокирует бесплатные запросы для IP-адресов из вашего региона).");
      }
      throw error;
    }
  }

  public async uploadFile(fileBuffer: Buffer, mimeType: string, displayName: string): Promise<{ name: string; uri: string }> {
    return this.executeWithRetry(async (apiKey) => {
      const initUrl = `${this.getBaseUrl()}/upload/v1beta/files?key=${apiKey}`;
      const initResponse = await fetch(initUrl, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(fileBuffer.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          file: { display_name: displayName }
        })
      });

      if (!initResponse.ok) {
        const errText = await initResponse.text();
        throw new Error(`Failed to initialize file upload: ${initResponse.status} ${errText}`);
      }

      const uploadUrl = initResponse.headers.get("x-goog-upload-url");
      if (!uploadUrl) {
        throw new Error("Failed to get upload URL from response headers.");
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": String(fileBuffer.length),
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize"
        },
        body: new Uint8Array(fileBuffer)
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Failed to upload file content: ${uploadResponse.status} ${errText}`);
      }

      const data = await uploadResponse.json();
      return {
        name: data.file.name,
        uri: data.file.uri
      };
    });
  }

  public async getFileState(fileName: string): Promise<{ state: string }> {
    return this.executeWithRetry(async (apiKey) => {
      const url = `${this.getBaseUrl()}/v1beta/${fileName}?key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get file status: ${response.status} ${errText}`);
      }
      const data = await response.json();
      return {
        state: data.state || "PROCESSING"
      };
    });
  }

  public async deleteFile(fileName: string): Promise<void> {
    return this.executeWithRetry(async (apiKey) => {
      const url = `${this.getBaseUrl()}/v1beta/${fileName}?key=${apiKey}`;
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) {
        console.warn(`Failed to delete file ${fileName} from Google Cloud: ${response.status}`);
      }
    });
  }

  public async transcribeAudioFromFileUri(fileUri: string, mimeType: string, prompt?: string): Promise<string> {
    return this.executeWithRetry(async (apiKey, modelName) => {
      const url = `${this.getBaseUrl()}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const instructionText = prompt || "Сделай дословную и максимально точную транскрибацию этого аудиофайла на русском языке. Запиши только произнесенный текст встречи, не добавляй от себя никаких комментариев, резюме или вводных фраз.";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout for whole file

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    fileData: {
                      fileUri,
                      mimeType
                    }
                  },
                  {
                    text: instructionText
                  }
                ]
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini transcription API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof text !== "string") {
          throw new Error("Gemini returned an unexpected response structure for transcription.");
        }

        return text.trim();
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini transcription request timed out after 3 minutes.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  public async transcribeAudio(base64Data: string, mimeType: string = "audio/mp3", prompt?: string): Promise<string> {
    return this.executeWithRetry(async (apiKey, modelName) => {
      const url = `${this.getBaseUrl()}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const instructionText = prompt || "Сделай дословную и максимально точную транскрибацию этого аудиофайла на русском языке. Запиши только произнесенный текст встречи, не добавляй от себя никаких комментариев, резюме или вводных фраз.";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data
                    }
                  },
                  {
                    text: instructionText
                  }
                ]
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini transcription API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof text !== "string") {
          throw new Error("Gemini returned an unexpected response structure for transcription.");
        }

        return text.trim();
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini transcription request timed out after 90 seconds.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Generates a structured protocol JSON from the meeting transcript.
   */
  public async generateProtocol(transcript: string, prompt: string): Promise<string> {
    return this.executeWithRetry(async (apiKey, modelName) => {
      const url = `${this.getBaseUrl()}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const systemPrompt = `Ты профессиональный секретарь и ассистент. Твоя задача — проанализировать стенограмму или заметки встречи и составить подробный, красиво отформатированный структурированный протокол встречи на русском языке в формате Markdown.
Отвечай строго текстом протокола в формате Markdown, без каких-либо вводных фраз или комментариев. Действуй строго в соответствии со следующими инструкциями и промптом оператора:
${prompt}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds timeout

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${systemPrompt}\n\nСтенограмма встречи для анализа:\n\n${transcript}`
                  }
                ]
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini generateProtocol API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof rawText !== "string") {
          throw new Error("Gemini returned an empty or unexpected response for protocol generation.");
        }

        return rawText.trim();
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini protocol generation request timed out after 300 seconds.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  public async generateVisualPrompt(
    reportText: string,
    logoBase64?: string,
    photoBase64?: string,
    systemPrompt?: string
  ): Promise<string> {
    return this.executeWithRetry(async (apiKey, modelName) => {
      const url = `${this.getBaseUrl()}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const sysInstruction = systemPrompt || "Ты — эксперт по визуализации данных и дизайнер дашбордов. Твоя задача — составить детальный визуальный промпт для генератора картинок на основе текстовой инфографики. Напиши подробный промпт на английском языке для генерации красивой, плоской современной инфографики (дашборда 16:9) с чистыми шрифтами, метриками и блоками в деловом технологичном стиле. Укажи в промпте конкретные надписи для ключевых показателей на английском языке.";

      const parts: any[] = [
        {
          text: `Составь визуальный промпт на основе этого отчета:\n\n${reportText}\n\nПожалуйста, обязательно проанализируй прикрепленный логотип и общую фотографию, чтобы включить их стилистику (цвета логотипа, цветовую гамму, расположение объектов) в визуальный промпт для красивой, современной и плоской инфографики.`
        }
      ];

      if (logoBase64) {
        const cleanBase64 = logoBase64.replace(/^data:.*;base64,/, "");
        const mimeType = logoBase64.match(/^data:(.*);base64,/)?.[1] || "image/png";
        parts.push({
          inlineData: {
            mimeType,
            data: cleanBase64
          }
        });
      }

      if (photoBase64) {
        const cleanBase64 = photoBase64.replace(/^data:.*;base64,/, "");
        const mimeType = photoBase64.match(/^data:(.*);base64,/)?.[1] || "image/jpeg";
        parts.push({
          inlineData: {
            mimeType,
            data: cleanBase64
          }
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts
              }
            ],
            systemInstruction: {
              parts: [
                {
                  text: sysInstruction
                }
              ]
            }
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini generateVisualPrompt API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== "string") {
          throw new Error("Gemini returned an empty or unexpected response for visual prompt generation.");
        }

        return text.trim();
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini visual prompt generation request timed out after 60 seconds.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  public async createChatCompletion(options: {
    messages: Array<{ role: string; content: string | any[] }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    return this.executeWithRetry(async (apiKey, modelName) => {
      const url = `${this.getBaseUrl()}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      // Convert OpenAI messages to Gemini contents structure
      const systemMessage = options.messages.find((m) => m.role === "system");
      const userMessages = options.messages.filter((m) => m.role !== "system");

      const contents = userMessages.map((m) => {
        const parts = Array.isArray(m.content)
          ? m.content.map((p) => {
              if (p.type === "text") return { text: p.text };
              if (p.type === "image_url") {
                const urlStr = p.image_url.url;
                const match = urlStr.match(/^data:(.*);base64,(.*)$/);
                if (match) {
                  return { inlineData: { mimeType: match[1], data: match[2] } };
                }
              }
              return { text: "" };
            })
          : [{ text: String(m.content) }];
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts
        };
      });

      const body: any = {
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.4,
          maxOutputTokens: options.maxTokens ?? 4096
        }
      };

      if (systemMessage) {
        body.systemInstruction = {
          parts: [{ text: String(systemMessage.content) }]
        };
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini generateContent API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof rawText !== "string") {
          throw new Error("Gemini returned an empty or unexpected response for generateContent.");
        }

        return rawText.trim();
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini request timed out after 3 minutes.");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 4, 2000);
  }
}
