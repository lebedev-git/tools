import { Document, Paragraph, TextRun, Packer, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from "docx";
import type { ProtocolRecord } from "@tools/protocols";

function parseTextLines(text: string): Paragraph[] {
  if (!text) return [];
  const lines = text.split("\n");
  return lines.map((line) => {
    // Check if line is bullet point
    const isBullet = line.trim().startsWith("-") || line.trim().startsWith("*");
    const cleanText = isBullet ? line.trim().substring(1).trim() : line;
    
    return new Paragraph({
      bullet: isBullet ? { level: 0 } : undefined,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: cleanText,
          font: "Aptos",
          size: "9.5pt"
        })
      ]
    });
  });
}

export async function POST(request: Request) {
  try {
    const protocol = (await request.json()) as ProtocolRecord;
    const docTitle = protocol.title || "Протокол встречи";

    const children: Array<Paragraph | Table> = [];

    // Header title
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: docTitle,
            bold: true,
            font: "Aptos Display",
            size: "18pt",
            color: "103052"
          })
        ]
      })
    );

    // Meta details table
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "Дата встречи:", bold: true, font: "Aptos", size: "9.5pt" })] })]
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: protocol.date || "Не указана", font: "Aptos", size: "9.5pt" })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: "Участники:", bold: true, font: "Aptos", size: "9.5pt" })] })]
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: protocol.participants?.join(", ") || "Нет данных", font: "Aptos", size: "9.5pt" })] })]
            })
          ]
        })
      ]
    });

    children.push(metaTable);
    
    // Separator space
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }));

    // Helper function to append section
    const addSection = (title: string, content?: string) => {
      if (!content || !content.trim()) return;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: title,
              bold: true,
              font: "Aptos Display",
              size: "12pt",
              color: "183B5E"
            })
          ]
        })
      );
      children.push(...parseTextLines(content));
    };

    addSection("Тема обсуждения", protocol.theme);
    addSection("Повестка дня", protocol.agenda);
    addSection("Основные тезисы", protocol.keyPoints);
    addSection("Принятые решения", protocol.decisionsText);
    addSection("Задачи к выполнению", protocol.tasksText);
    addSection("Ответственные лица", protocol.responsible);
    addSection("Сроки выполнения", protocol.deadlines);
    addSection("Выявленные риски", protocol.risks);
    addSection("Приложения", protocol.attachments);

    // Footer signature notice
    children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [] }));
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: `Документ сформирован автоматически ИИ-ассистентом. Статус протокола: ${protocol.status.toUpperCase()}.`,
            italics: true,
            font: "Aptos",
            size: "8.5pt",
            color: "64748B"
          })
        ]
      })
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: "1.55cm",
                bottom: "1.45cm",
                left: "1.65cm",
                right: "1.65cm"
              }
            }
          },
          children
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeFilename = docTitle.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_") || "protocol";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="protocol.docx"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.docx`
      }
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось сгенерировать DOCX файл."
      },
      { status: 500 }
    );
  }
}
