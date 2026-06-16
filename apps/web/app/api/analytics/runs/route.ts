import { addJob } from "@tools/db";

interface AnalyticsRunRequest {
  reportType?: "day1";
  day1Date?: string;
  day2Date?: string;
  selectedBlocks?: string[];
  customReportName?: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AnalyticsRunRequest;

    if (payload.reportType !== "day1" || !payload.day1Date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.day1Date)) {
      return Response.json(
        {
          status: "error",
          message: "Для первого запуска нужен reportType=day1 и day1Date в формате YYYY-MM-DD."
        },
        { status: 400 }
      );
    }

    // Add job to the SQLite background jobs queue
    const jobId = addJob("analytics", payload);

    return Response.json({
      status: "queued",
      jobId
    });
  } catch (error) {
    console.error("Analytics job queueing error:", error);
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось поставить задачу аналитики в очередь."
      },
      { status: 500 }
    );
  }
}
