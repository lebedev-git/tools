import * as http from "http";
import * as https from "https";
import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface ImageGenerationOptions {
  model?: string;
  prompt: string;
  size?: string;
}

export class ImageGenerationClient {
  public constructor(private readonly config: RuntimeConfig = getRuntimeConfig()) {}

  private async executeRequest(
    baseUrl: string,
    apiKey: string,
    modelName: string,
    options: ImageGenerationOptions,
    signal: AbortSignal
  ): Promise<string> {
    const httpLib = baseUrl.startsWith("https") ? https : http;
    const parsedUrl = new URL(`${baseUrl}/images/generations`);
    const postData = JSON.stringify({
      model: modelName,
      prompt: options.prompt,
      n: 1,
      size: options.size ?? "1024x1024"
    });

    return new Promise<string>((resolve, reject) => {
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (baseUrl.startsWith("https") ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        },
        timeout: 900000 // 15 minutes
      };

      const req = httpLib.request(reqOptions, (res: any) => {
        let rawData = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { rawData += chunk; });
        res.on("end", () => {
          try {
            const body = JSON.parse(rawData);
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(body.error?.message || `Image API returned status ${res.statusCode}.`));
              return;
            }
            const url = body.data?.[0]?.url;
            const b64 = body.data?.[0]?.b64_json;
            if (!url && !b64) {
              reject(new Error("Image API did not return an image URL or base64 data."));
              return;
            }
            resolve(url || `data:image/png;base64,${b64}`);
          } catch (e) {
            reject(new Error(`Failed to parse image response: ${rawData}`));
          }
        });
      });

      req.on("error", (e: any) => { reject(e); });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Image generation request timed out."));
      });

      const onAbort = () => {
        req.destroy();
        reject(new Error("Image generation aborted."));
      };

      signal.addEventListener("abort", onAbort);
      
      let resolvedOrRejected = false;
      const originalResolve = resolve;
      const originalReject = reject;
      
      resolve = (val) => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          signal.removeEventListener("abort", onAbort);
          originalResolve(val);
        }
      };
      
      reject = (err) => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          signal.removeEventListener("abort", onAbort);
          originalReject(err);
        }
      };

      req.write(postData);
      req.end();
    });
  }

  public async generateImage(options: ImageGenerationOptions): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 900000);

    const isInternal = this.config.imageServiceUrl && this.config.imageServiceUrl.includes("automation-codex-service");
    const baseUrl = isInternal ? this.config.imageServiceUrl : "https://codex.sale/v1";
    const apiKey = isInternal ? "" : "sk-clb-3APylzCeyo_r4Lapmp_eLgQl5Ul973_z6QLyRWD1L1A";
    const modelName = options.model ?? (isInternal ? "gpt-5.5" : "gpt-image-2");

    try {
      return await this.executeRequest(baseUrl, apiKey, modelName, options, controller.signal);
    } catch (error: any) {
      if (isInternal) {
        console.warn(`Internal image service failed (${error.message}). Trying fallback to external Codex Sale API...`);
        
        const fallbackUrl = "https://codex.sale/v1";
        const fallbackApiKey = "sk-clb-3APylzCeyo_r4Lapmp_eLgQl5Ul973_z6QLyRWD1L1A";
        const fallbackModel = "gpt-image-2";

        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 900000);
        
        try {
          return await this.executeRequest(fallbackUrl, fallbackApiKey, fallbackModel, options, fallbackController.signal);
        } catch (fallbackError: any) {
          console.error("External Codex Sale API fallback also failed:", fallbackError.message);
          throw fallbackError;
        } finally {
          clearTimeout(fallbackTimeoutId);
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
