import { Document, Paragraph, TextRun, Packer, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, PageOrientation } from "docx";

interface DownloadDocxRequest {
  title?: string;
  markdown?: string;
}

function parseInline(text: string): TextRun[] {
  const parts = text.split(/\*\*/g);
  return parts
    .map((part, index) => {
      const isBold = index % 2 === 1;
      return { part, isBold };
    })
    .filter(({ part }) => part !== "")
    .map(({ part, isBold }) => {
      return new TextRun({
        text: part,
        bold: isBold,
        font: "Aptos",
        size: "9.5pt"
      });
    });
}

export async function generateAnalyticsDocxBuffer(docTitle: string, markdown: string): Promise<Buffer> {
  const lines = markdown.split("\n");
  const children: Array<Paragraph | Table> = [];

  // Add document main heading
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: docTitle,
          bold: true,
          font: "Aptos Display",
          size: "16pt",
          color: "103052"
        })
      ]
    })
  );

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
      // Add spacer paragraph after table
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
    const line = lines[i].trim();

    // Table line handling
    if (line.startsWith("|")) {
      inTable = true;
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      // Skip separator lines like |---|---|
      if (cells.every((c) => c.startsWith("-"))) {
        continue;
      }

      tableRowsData.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers handling
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: line.slice(2),
              bold: true,
              font: "Aptos Display",
              size: "14pt",
              color: "103052"
            })
          ]
        })
      );
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 80 },
          children: [
            new TextRun({
              text: line.slice(3),
              bold: true,
              font: "Aptos Display",
              size: "12pt",
              color: "183B5E"
            })
          ]
        })
      );
    } else if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text: line.slice(4),
              bold: true,
              font: "Aptos Display",
              size: "10.5pt",
              color: "284868"
            })
          ]
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
          children: parseInline(line.slice(2))
        })
      );
    } else if (line !== "") {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: parseInline(line)
        })
      );
    }
  }

  // Flush any remaining table at the end of content
  flushTable();

  // Compile DOCX document
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
    const payload = (await request.json()) as DownloadDocxRequest;
    const docTitle = payload.title || "Аналитический отчет";
    const markdown = payload.markdown || "";

    const buffer = await generateAnalyticsDocxBuffer(docTitle, markdown);
    const safeFilename = docTitle.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_") || "report";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.docx`
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
