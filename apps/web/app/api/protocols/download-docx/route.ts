import { Document, Paragraph, TextRun, Packer, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, PageOrientation } from "docx";
import type { ProtocolRecord } from "@tools/protocols";

function cleanMarkdownFormatting(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
}

function parseMarkdownToElements(markdown: string): Array<Paragraph | Table> {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const children: Array<Paragraph | Table> = [];
  
  let currentTextBuffer: string[] = [];

  const flushTextBuffer = () => {
    if (currentTextBuffer.length === 0) return;
    const fullText = currentTextBuffer.join(" ");
    currentTextBuffer = [];

    // Simple bold parser: **text**
    const textRuns: TextRun[] = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIdx = 0;
    let match;
    while ((match = boldRegex.exec(fullText)) !== null) {
      if (match.index > lastIdx) {
        textRuns.push(new TextRun({ text: fullText.substring(lastIdx, match.index), font: "Aptos", size: "9.5pt" }));
      }
      textRuns.push(new TextRun({ text: match[1], bold: true, font: "Aptos", size: "9.5pt" }));
      lastIdx = boldRegex.lastIndex;
    }
    if (lastIdx < fullText.length) {
      textRuns.push(new TextRun({ text: fullText.substring(lastIdx), font: "Aptos", size: "9.5pt" }));
    }

    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: textRuns
      })
    );
  };

  const parseInline = (text: string): TextRun[] => {
    const textRuns: TextRun[] = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIdx = 0;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        textRuns.push(new TextRun({ text: text.substring(lastIdx, match.index), font: "Aptos", size: "9.5pt" }));
      }
      textRuns.push(new TextRun({ text: match[1], bold: true, font: "Aptos", size: "9.5pt" }));
      lastIdx = boldRegex.lastIndex;
    }
    if (lastIdx < text.length) {
      textRuns.push(new TextRun({ text: text.substring(lastIdx), font: "Aptos", size: "9.5pt" }));
    }
    return textRuns;
  };

  let inTable = false;
  let tableRowsData: string[][] = [];

  const flushTable = () => {
    if (tableRowsData.length > 0) {
      const rows = tableRowsData.map((rowCells) => {
        return new TableRow({
          children: rowCells.map((cellText) => {
            return new TableCell({
              width: {
                size: 100 / rowCells.length,
                type: WidthType.PERCENTAGE
              },
              margins: {
                top: 100,
                bottom: 100,
                left: 150,
                right: 150
              },
              shading: {
                fill: "FFFFFF"
              },
              children: [
                new Paragraph({
                  children: parseInline(cellText),
                  spacing: { before: 60, after: 60 }
                })
              ]
            });
          })
        });
      });

      const table = new Table({
        rows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE
        },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
          left: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
          right: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
        }
      });

      children.push(table);
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: []
        })
      );

      tableRowsData = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Table handling
    if (trimmed.startsWith("|")) {
      flushTextBuffer();
      inTable = true;
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      if (cells.every((c) => c.startsWith("-"))) {
        continue;
      }

      tableRowsData.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!trimmed) {
      flushTextBuffer();
      children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushTextBuffer();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 120, after: 60 },
          children: [new TextRun({ text: cleanMarkdownFormatting(trimmed.substring(4)), bold: true, font: "Aptos Display", size: "11pt", color: "183B5E" })]
        })
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushTextBuffer();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 80 },
          children: [new TextRun({ text: cleanMarkdownFormatting(trimmed.substring(3)), bold: true, font: "Aptos Display", size: "12pt", color: "183B5E" })]
        })
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushTextBuffer();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: cleanMarkdownFormatting(trimmed.substring(2)), bold: true, font: "Aptos Display", size: "14pt", color: "103052" })]
        })
      );
      continue;
    }

    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
    const isNumbered = /^\d+\.\s+/.test(trimmed);

    if (isBullet || isNumbered) {
      flushTextBuffer();
      const contentText = isBullet 
        ? trimmed.substring(2).trim() 
        : trimmed.substring(trimmed.indexOf(".") + 1).trim();

      const textRuns = parseInline(contentText);

      if (isNumbered) {
        const numberPrefix = trimmed.match(/^\d+\.\s+/)?.[0] || "";
        textRuns.unshift(new TextRun({ text: numberPrefix, bold: true, font: "Aptos", size: "9.5pt" }));
      }

      children.push(
        new Paragraph({
          bullet: isBullet ? { level: 0 } : undefined,
          spacing: { before: 60, after: 60 },
          children: textRuns
        })
      );
      continue;
    }

    // Add normal line to paragraph buffer
    currentTextBuffer.push(trimmed);
  }

  flushTextBuffer();
  flushTable();

  return children;
}

export async function generateProtocolDocxBuffer(protocol: ProtocolRecord): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  // Header title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: protocol.title || "Протокол встречи",
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

  if (protocol.theme) {
    children.push(...parseMarkdownToElements(protocol.theme));
  } else {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: "Протокол встречи пуст.",
            font: "Aptos",
            size: "9.5pt"
          })
        ]
      })
    );
  }

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
            size: {
              orientation: PageOrientation.LANDSCAPE,
              width: 16838,
              height: 11906
            },
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

  return Packer.toBuffer(doc);
}

export async function POST(request: Request) {
  try {
    const protocol = (await request.json()) as ProtocolRecord;
    const docTitle = protocol.title || "Протокол встречи";

    const buffer = await generateProtocolDocxBuffer(protocol);
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
