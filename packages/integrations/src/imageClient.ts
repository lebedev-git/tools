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
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: options.model ?? "image-2",
          prompt: options.prompt,
          n: 1,
          size: options.size ?? "1024x1024"
        }),
        signal: controller.signal
      });

      const body = await response.json() as {
        data?: Array<{ url?: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(body.error?.message || `Image API returned status ${response.status}.`);
      }

      const url = body.data?.[0]?.url;
      if (!url) {
        throw new Error("Image API did not return an image URL.");
      }

      return url;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error("Image generation timed out after 60 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
