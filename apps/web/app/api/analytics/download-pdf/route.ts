import { generateAnalyticsDocxBuffer } from "../download-docx/route";
import { convertDocxToPdf } from "@/lib/pdfConverter";

interface DownloadPdfRequest {
  title?: string;
  markdown?: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DownloadPdfRequest;
    const docTitle = payload.title || "Аналитический отчет";
    const markdown = payload.markdown || "";

    // 1. Генерируем DOCX-буфер
    const docxBuffer = await generateAnalyticsDocxBuffer(docTitle, markdown);

    // 2. Конвертируем его в PDF на сервере
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    const safeFilename = docTitle.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_") || "report";

    // 3. Возвращаем PDF
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.pdf`
      }
    });
  } catch (error: any) {
    console.error("Failed to generate PDF:", error);
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
        message: error instanceof Error ? error.message : "Не удалось сгенерировать PDF файл."
      },
      { status: 500 }
    );
  }
}
