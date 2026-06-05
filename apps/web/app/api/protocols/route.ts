import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sampleProtocols, type ProtocolRecord } from "@tools/protocols";
import { getRuntimeConfig } from "@tools/integrations";

function protocolsPath() {
  return join(process.cwd(), getRuntimeConfig().storagePath, "protocols", "list.json");
}

export async function GET() {
  try {
    const filePath = protocolsPath();
    const stored = JSON.parse(await readFile(filePath, "utf-8")) as ProtocolRecord[];
    const filtered = stored.filter((p) => p.id !== "protocol-001" && p.id !== "protocol-002");
    if (filtered.length !== stored.length) {
      await writeFile(filePath, JSON.stringify(filtered, null, 2), "utf-8");
    }
    return Response.json({ protocols: filtered });
  } catch {
    // If folder doesn't exist, create it and save sample protocols
    try {
      const filePath = protocolsPath();
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(sampleProtocols, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write initial protocols list:", err);
    }
    return Response.json({ protocols: sampleProtocols });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { protocols: ProtocolRecord[] };
    const filePath = protocolsPath();

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload.protocols, null, 2), "utf-8");

    return Response.json({ status: "saved", protocols: payload.protocols });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to save protocols."
      },
      { status: 500 }
    );
  }
}
