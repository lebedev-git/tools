import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export class GeminiClient {
  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  private static currentKeyIndex = 0;

  private getApiKeys(): string[] {
    const rawKeys = this.config.geminiApiKey;
    if (!rawKeys) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    const keys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new Error("No valid keys found in GEMINI_API_KEY.");
    }
    return keys;
  }

  private getApiKey(keys: string[]): string {
    return keys[GeminiClient.currentKeyIndex % keys.length];
  }

  private rotateKey(keys: string[]): void {
    if (keys.length > 1) {
      GeminiClient.currentKeyIndex = (GeminiClient.currentKeyIndex + 1) % keys.length;
      console.warn(`Gemini API key rotated. New active index: ${GeminiClient.currentKeyIndex}`);
    }
  }

  private async executeWithRetry<T>(operation: (apiKey: string) => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    const keys = this.getApiKeys();
    const apiKey = this.getApiKey(keys);
    try {
      return await operation(apiKey);
    } catch (error: any) {
      const is503 = error.message?.includes("status 503");
      const is429 = error.message?.includes("status 429");
      const is500 = error.message?.includes("status 500");
      const isTimeout = error.message?.includes("timed out");
      const isNetwork = error.name === "TypeError" || error.message?.includes("fetch failed");

      if (retries > 0 && (is503 || is429 || is500 || isTimeout || isNetwork)) {
        if (is429 || is503) {
          this.rotateKey(keys);
        }
        console.warn(`Gemini API operation failed. Retrying in ${delay}ms... (${retries} attempts left). Error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  public async transcribeAudio(base64Data: string, mimeType: string = "audio/mp3", prompt?: string): Promise<string> {
    return this.executeWithRetry(async (apiKey) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const instructionText = prompt || "Сделай дословную и максимально точную транскрибацию этого аудиофайла на русском языке. Запиши только произнесенный текст встречи, не добавляй от себя никаких комментариев, резюме или вводных фраз.";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout for large audio files

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
  public async generateProtocol(transcript: string, prompt: string): Promise<any> {
    return this.executeWithRetry(async (apiKey) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const systemPrompt = `Ты профессиональный секретарь и ассистент. Твоя задача — проанализировать стенограмму или заметки встречи и составить структурированный протокол.
Ответ должен быть строго в формате JSON без какого-либо дополнительного текста, объяснений или Markdown-разметки.
JSON должен иметь следующую структуру:
{
  "theme": "тема встречи",
  "agenda": "повестка дня (список вопросов)",
  "keyPoints": "основные тезисы обсуждения",
  "decisionsText": "принятые решения",
  "tasksText": "задачи к выполнению",
  "responsible": "ответственные лица",
  "deadlines": "сроки выполнения",
  "risks": "выявленные риски и неопределенности",
  "attachments": "приложения и полезные ссылки"
}

Дополнительная инструкция оператора по обработке:
${prompt}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

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
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
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

        try {
          return JSON.parse(rawText.trim());
        } catch (parseError) {
          console.error("Failed to parse Gemini JSON output:", rawText, parseError);
          throw new Error("ИИ вернул некорректный формат JSON. Попробуйте еще раз.");
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          throw new Error("Gemini protocol generation request timed out after 60 seconds.");
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
    return this.executeWithRetry(async (apiKey) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
}
