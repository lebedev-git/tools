import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

function getSofficeCommand(): string | null {
  if (process.platform === "win32") {
    const standardPaths = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) {
        return `"${p}"`;
      }
    }
    return null;
  }
  // На Linux/macOS
  return "soffice";
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const sofficeCmd = getSofficeCommand();
  
  if (process.platform !== "win32") {
    try {
      await execAsync("which soffice");
    } catch {
      throw new Error("LIBREOFFICE_NOT_FOUND");
    }
  } else if (!sofficeCmd) {
    throw new Error("LIBREOFFICE_NOT_FOUND");
  }

  const tmpDir = os.tmpdir();
  const uniqueId = Math.random().toString(36).substring(7);
  const tempDocxPath = path.join(tmpDir, `temp_${uniqueId}.docx`);
  const tempPdfPath = path.join(tmpDir, `temp_${uniqueId}.pdf`);

  await fs.promises.writeFile(tempDocxPath, docxBuffer);

  try {
    const cmd = process.platform === "win32" ? sofficeCmd : "soffice";
    await execAsync(`${cmd} --headless --convert-to pdf --outdir "${tmpDir}" "${tempDocxPath}"`);
    const pdfBuffer = await fs.promises.readFile(tempPdfPath);
    return pdfBuffer;
  } catch (error) {
    console.error("LibreOffice conversion failed:", error);
    throw new Error(`Ошибка конвертации DOCX в PDF: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await fs.promises.unlink(tempDocxPath).catch(() => {});
    await fs.promises.unlink(tempPdfPath).catch(() => {});
  }
}
