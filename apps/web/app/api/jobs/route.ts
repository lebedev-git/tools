import { getJob } from "@tools/db";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const idStr = searchParams.get("id");
    
    if (!idStr) {
      return Response.json({ status: "error", message: "Не указан id задачи" }, { status: 400 });
    }

    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return Response.json({ status: "error", message: "Неверный формат id" }, { status: 400 });
    }

    const job = getJob(id);
    if (!job) {
      return Response.json({ status: "error", message: "Задача не найдена" }, { status: 404 });
    }

    return Response.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (err: any) {
    return Response.json({ status: "error", message: err.message || "Ошибка при получении статуса задачи" }, { status: 500 });
  }
}
