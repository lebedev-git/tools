import { getProtocols, saveProtocol } from "@tools/db";
import { OpenNotebookClient } from "@tools/integrations";
import type { ProtocolRecord } from "@tools/protocols";

export async function POST(request: Request) {
  try {
    const { id } = (await request.json()) as { id: string };
    
    if (!id) {
      return Response.json(
        { status: "error", message: "Не указан ID протокола для публикации." },
        { status: 400 }
      );
    }

    // Load protocols
    const list = getProtocols();
    const protocol = list.find((p: ProtocolRecord) => p.id === id);

    if (!protocol) {
      return Response.json(
        { status: "error", message: `Протокол с ID ${id} не найден.` },
        { status: 404 }
      );
    }

    if (!protocol.theme || !protocol.theme.trim()) {
      return Response.json(
        { status: "error", message: "Нельзя опубликовать пустой протокол встречи." },
        { status: 400 }
      );
    }

    // Publish to Open Notebook
    const notebookClient = new OpenNotebookClient();
    const notebookName = "Протоколы встреч";
    const notebookDesc = "Согласованные и опубликованные протоколы совещаний и рабочих встреч";

    // 1. Resolve notebook
    console.log(`Open Notebook: Resolving notebook "${notebookName}"...`);
    const notebookId = await notebookClient.getOrCreateNotebook(notebookName, notebookDesc);
    console.log(`Open Notebook: Notebook ID is ${notebookId}`);

    const displayDate = protocol.date
      ? new Date(protocol.date).toLocaleDateString("ru-RU")
      : new Date().toLocaleDateString("ru-RU");

    // 2. Publish Protocol Document
    const docTitle = `${displayDate} - ${protocol.title || "Протокол встречи"}`;
    console.log(`Open Notebook: Creating document "${docTitle}"...`);
    await notebookClient.createSource([notebookId], docTitle, protocol.theme, true, true);

    // 3. Publish Transcript Document (if exists)
    if (protocol.transcript && protocol.transcript.trim()) {
      const transTitle = `${displayDate} - Стенограмма: ${protocol.title || "Встреча"}`;
      console.log(`Open Notebook: Creating transcript document "${transTitle}"...`);
      await notebookClient.createSource([notebookId], transTitle, protocol.transcript, true, true);
    }

    // 4. Update status in database
    const updatedProtocol: ProtocolRecord = {
      ...protocol,
      status: "published"
    };
    saveProtocol(updatedProtocol);

    return Response.json({
      status: "published",
      notebookId,
      message: `Протокол успешно опубликован в блокнот "${notebookName}".`
    });
  } catch (error: any) {
    console.error("Protocol publication error:", error);
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Произошла ошибка при публикации протокола."
      },
      { status: 500 }
    );
  }
}
