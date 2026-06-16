import { getPrompt, setPrompt } from "@tools/db";

function maskSingleKey(key: string): string {
  const clean = key.trim();
  if (!clean) return "";
  if (clean.length <= 10) return "***";
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function maskKeys(rawKeys?: string): string {
  if (!rawKeys) return "(не настроено)";
  const keys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return "(не настроено)";
  return keys.map(maskSingleKey).join(", ");
}

export async function GET() {
  try {
    const env = process.env;

    const systemSettings = {
      llmApiKeyMasked: maskKeys(env.LLM_API_KEY),
      llmModelDefault: env.LLM_MODEL ?? "qwen3.7-max",
      geminiApiKeyMasked: maskKeys(env.GEMINI_API_KEY),
      deepgramApiKeyMasked: maskKeys(env.DEEPGRAM_API_KEY),
      deepgramModelDefault: env.DEEPGRAM_MODEL ?? "nova-2",
      imageServiceUrlDefault: env.IMAGE_SERVICE_URL ?? "http://automation-codex-service:3007/codex-internal",
      imageServiceApiKeyMasked: maskKeys(env.IMAGE_SERVICE_API_KEY)
    };

    const customSettings = {
      extraLlmKeys: getPrompt("config.extra_llm_keys", ""),
      llmModel: getPrompt("config.llm_model", ""),
      extraGeminiKeys: getPrompt("config.extra_gemini_keys", ""),
      extraDeepgramKeys: getPrompt("config.extra_deepgram_keys", ""),
      deepgramModel: getPrompt("config.deepgram_model", ""),
      extraImageServiceKey: getPrompt("config.extra_image_service_key", ""),
      imageServiceUrl: getPrompt("config.image_service_url", ""),
      imageModel: getPrompt("config.image_model", "")
    };

    return Response.json({ systemSettings, customSettings });
  } catch (err: any) {
    console.error("Failed to load settings keys:", err);
    return Response.json(
      { status: "error", message: err.message || "Failed to load keys." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as {
      extraLlmKeys?: string;
      llmModel?: string;
      extraGeminiKeys?: string;
      extraDeepgramKeys?: string;
      deepgramModel?: string;
      extraImageServiceKey?: string;
      imageServiceUrl?: string;
      imageModel?: string;
    };

    if (payload.extraLlmKeys !== undefined) setPrompt("config.extra_llm_keys", payload.extraLlmKeys);
    if (payload.llmModel !== undefined) setPrompt("config.llm_model", payload.llmModel);
    if (payload.extraGeminiKeys !== undefined) setPrompt("config.extra_gemini_keys", payload.extraGeminiKeys);
    if (payload.extraDeepgramKeys !== undefined) setPrompt("config.extra_deepgram_keys", payload.extraDeepgramKeys);
    if (payload.deepgramModel !== undefined) setPrompt("config.deepgram_model", payload.deepgramModel);
    if (payload.extraImageServiceKey !== undefined) setPrompt("config.extra_image_service_key", payload.extraImageServiceKey);
    if (payload.imageServiceUrl !== undefined) setPrompt("config.image_service_url", payload.imageServiceUrl);
    if (payload.imageModel !== undefined) setPrompt("config.image_model", payload.imageModel);

    return Response.json({ status: "saved" });
  } catch (err: any) {
    console.error("Failed to save settings keys:", err);
    return Response.json(
      { status: "error", message: err.message || "Failed to save keys." },
      { status: 500 }
    );
  }
}
export { PUT as POST };
