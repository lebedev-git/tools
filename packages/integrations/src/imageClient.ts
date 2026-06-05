export interface ImageGenerationOptions {
  model?: string;
  prompt: string;
  size?: string;
}

export class ImageGenerationClient {
  private readonly apiKey = "sk-clb-3APylzCeyo_r4Lapmp_eLgQl5Ul973_z6QLyRWD1L1A";
  private readonly baseUrl = "https://codex.sale/v1";

  public async generateImage(options: ImageGenerationOptions): Promise<string> {
    const controller = new AbortController();
    // 7 minutes = 420000 ms
    const timeoutId = setTimeout(() => controller.abort(), 420000);

    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: options.model ?? "gpt-image-2",
          prompt: options.prompt,
          n: 1,
          size: options.size ?? "1024x1024"
        }),
        signal: controller.signal
      });

      const body = await response.json() as {
        data?: Array<{ url?: string; b64_json?: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(body.error?.message || `Image API returned status ${response.status}.`);
      }

      const url = body.data?.[0]?.url;
      const b64 = body.data?.[0]?.b64_json;
      if (!url && !b64) {
        throw new Error("Image API did not return an image URL or base64 data.");
      }

      return url || `data:image/png;base64,${b64}`;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error("Image generation timed out after 7 minutes.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
