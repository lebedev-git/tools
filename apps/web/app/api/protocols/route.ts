import { getProtocols, saveProtocol, deleteProtocol } from "@tools/db";
import type { ProtocolRecord } from "@tools/protocols";

export async function GET() {
  try {
    const list = getProtocols();
    const filtered = list.filter((p: ProtocolRecord) => p.id !== "protocol-001" && p.id !== "protocol-002");
    return Response.json({ protocols: filtered });
  } catch (error) {
    console.error("Failed to load protocols:", error);
    return Response.json({ protocols: [] });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { protocols: ProtocolRecord[] };
    const nextList = payload.protocols || [];
    
    // Get existing protocols in DB
    const existing = getProtocols();
    const nextIds = new Set(nextList.map((p) => p.id));
    
    // Delete missing protocols
    for (const p of existing) {
      if (!nextIds.has(p.id)) {
        deleteProtocol(p.id);
      }
    }
    
    // Save/Update current protocols
    for (const p of nextList) {
      saveProtocol(p);
    }

    return Response.json({ status: "saved", protocols: nextList });
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
