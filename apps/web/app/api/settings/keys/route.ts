import { getPrompt, setPrompt } from "@tools/db";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function findMonorepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return process.cwd();
    }
    dir = parent;
  }
}

function getAccountsPath() {
  if (existsSync("/app/image-service-data")) {
    return "/app/image-service-data/accounts.json";
  }
  const root = findMonorepoRoot();
  return join(root, "image-service-data/accounts.json");
}

function maskSingleKey(key: string): string {
  const clean = key.trim();
  if (!clean) return "";
  if (clean.length <= 12) return "***";
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function splitKeys(rawKeys?: string): string[] {
  if (!rawKeys) return [];
  return rawKeys.split(",").map(k => k.trim()).filter(Boolean);
}

function readExistingAccounts(): any[] {
  const accountsPath = getAccountsPath();
  if (existsSync(accountsPath)) {
    try {
      const raw = readFileSync(accountsPath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("Failed to read accounts.json:", err);
    }
  }
  return [];
}

export async function GET() {
  try {
    const env = process.env;

    const systemSettings = {
      llmApiKeysMasked: splitKeys(env.LLM_API_KEY).map(maskSingleKey),
      llmModelDefault: env.LLM_MODEL ?? "qwen3.7-max",
      geminiApiKeysMasked: splitKeys(env.GEMINI_API_KEY).map(maskSingleKey),
      deepgramApiKeysMasked: splitKeys(env.DEEPGRAM_API_KEY).map(maskSingleKey),
      deepgramModelDefault: env.DEEPGRAM_MODEL ?? "nova-2",
      imageServiceUrlDefault: env.IMAGE_SERVICE_URL ?? "http://automation-codex-service:3007/codex-internal",
      imageServiceApiKeyMasked: maskSingleKey(env.IMAGE_SERVICE_API_KEY ?? "")
    };

    const customSettings = {
      extraLlmKeys: splitKeys(getPrompt("config.extra_llm_keys", "")),
      llmModel: getPrompt("config.llm_model", ""),
      extraGeminiKeys: splitKeys(getPrompt("config.extra_gemini_keys", "")),
      extraDeepgramKeys: splitKeys(getPrompt("config.extra_deepgram_keys", "")),
      deepgramModel: getPrompt("config.deepgram_model", ""),
      extraImageServiceKey: getPrompt("config.extra_image_service_key", ""),
      imageServiceUrl: getPrompt("config.image_service_url", ""),
      imageModel: getPrompt("config.image_model", "")
    };

    // Load GPT Accounts for infographic
    const rawAccounts = readExistingAccounts();
    const accounts = rawAccounts.map((acc: any) => {
      const imageGenLimit = Array.isArray(acc.limits_progress)
        ? acc.limits_progress.find((l: any) => l.feature_name === "image_gen")
        : null;

      const remaining = imageGenLimit ? imageGenLimit.remaining : (acc.quota ?? 3);
      const maxQuota = acc.quota ?? 3;

      return {
        email: acc.email,
        status: acc.status || "正常",
        quota: maxQuota,
        remaining: remaining,
        access_token: maskSingleKey(acc.access_token),
        created_at: acc.created_at
      };
    });

    return Response.json({ systemSettings, customSettings, accounts });
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
      extraLlmKeys?: string[];
      llmModel?: string;
      extraGeminiKeys?: string[];
      extraDeepgramKeys?: string[];
      deepgramModel?: string;
      extraImageServiceKey?: string;
      imageServiceUrl?: string;
      imageModel?: string;
      accounts?: Array<{
        email: string;
        access_token: string;
        status?: string;
        quota?: number;
      }>;
    };

    if (payload.extraLlmKeys !== undefined) {
      setPrompt("config.extra_llm_keys", payload.extraLlmKeys.join(","));
    }
    if (payload.llmModel !== undefined) {
      setPrompt("config.llm_model", payload.llmModel);
    }
    if (payload.extraGeminiKeys !== undefined) {
      setPrompt("config.extra_gemini_keys", payload.extraGeminiKeys.join(","));
    }
    if (payload.extraDeepgramKeys !== undefined) {
      setPrompt("config.extra_deepgram_keys", payload.extraDeepgramKeys.join(","));
    }
    if (payload.deepgramModel !== undefined) {
      setPrompt("config.deepgram_model", payload.deepgramModel);
    }
    if (payload.extraImageServiceKey !== undefined) {
      setPrompt("config.extra_image_service_key", payload.extraImageServiceKey);
    }
    if (payload.imageServiceUrl !== undefined) {
      setPrompt("config.image_service_url", payload.imageServiceUrl);
    }
    if (payload.imageModel !== undefined) {
      setPrompt("config.image_model", payload.imageModel);
    }

    // Handle GPT Accounts
    if (payload.accounts !== undefined) {
      const existing = readExistingAccounts();
      
      const merged = payload.accounts.map((acc) => {
        const found = existing.find((e) => e.email === acc.email);
        const isMasked = acc.access_token.includes("...");
        
        let token = acc.access_token;
        if (isMasked && found) {
          token = found.access_token;
        }

        const now = new Date();
        const formattedDate = now.getFullYear() + "-" + 
          String(now.getMonth() + 1).padStart(2, "0") + "-" + 
          String(now.getDate()).padStart(2, "0") + " " + 
          String(now.getHours()).padStart(2, "0") + ":" + 
          String(now.getMinutes()).padStart(2, "0") + ":" + 
          String(now.getSeconds()).padStart(2, "0");

        return {
          created_at: found?.created_at || formattedDate,
          access_token: token,
          source_type: found?.source_type || "web",
          type: found?.type || "free",
          status: acc.status || found?.status || "正常",
          quota: acc.quota ?? found?.quota ?? 3,
          image_quota_unknown: found?.image_quota_unknown ?? false,
          email: acc.email,
          user_id: found?.user_id || "user-" + Math.random().toString(36).substring(2, 15),
          proxy: found?.proxy || "",
          limits_progress: found?.limits_progress || [],
          default_model_slug: found?.default_model_slug || "auto",
          restore_at: found?.restore_at || now.toISOString()
        };
      });

      const accountsPath = getAccountsPath();
      // Ensure the directory exists
      const dir = dirname(accountsPath);
      if (!existsSync(dir)) {
        const fs = await import("node:fs");
        fs.mkdirSync(dir, { recursive: true });
      }
      writeFileSync(accountsPath, JSON.stringify(merged, null, 2), "utf8");
    }

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
