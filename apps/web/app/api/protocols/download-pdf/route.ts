import { generateProtocolDocxBuffer } from "../download-docx/route";
import { convertDocxToPdf } from "@/lib/pdfConverter";
import type { ProtocolRecord } from "@tools/protocols";

export async function POST(request: Request) {
  try {
    const protocol = (await request.json()) as ProtocolRecord;
    const docTitle = protocol.title || "Протокол встречи";

    // 1. Генерируем DOCX-буфер для протокола
    const docxBuffer = await generateProtocolDocxBuffer(protocol);

    // 2. Конвертируем его в PDF на сервере
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    const safeFilename = docTitle.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_") || "protocol";

    // 3. Возвращаем PDF
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="protocol.pdf"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.pdf`
      }
    });
  } catch (error: any) {
    console.error("Failed to generate protocol PDF:", error);
    if (error.message === "LIBREOFFICE_NOT_FOUND") {
      return Response.json(
        {
          status: "error",
          code: "LIBREOFFICE_NOT_FOUND",
          message: "LibreOffice не установлен. Будет использована клиентская генерация PDF."
        },
        { status: 412 }
      );
    }
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось сгенерировать PDF файл протокола."
      },
      { status: 500 }
    );
  }
}
