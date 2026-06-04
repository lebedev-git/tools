import { yandexFormIds } from "@tools/analytics";
import { formatYandexDate, YandexFormsClient } from "@tools/integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportType = url.searchParams.get("reportType") ?? "day1";
  const client = new YandexFormsClient();

  try {
    if (reportType === "day2") {
      const response = await client.getAnswers(yandexFormIds.day2);
      const availability = new Map<string, { date: string; count: number }>();

      for (const answer of response.answers ?? []) {
        const date = formatYandexDate(answer.created);
        const bucket = availability.get(date) ?? { date, count: 0 };
        bucket.count += 1;
        availability.set(date, bucket);
      }

      return Response.json({
        status: "success",
        reportType,
        options: Array.from(availability.values()).sort((left, right) => right.date.localeCompare(left.date))
      });
    }

    const [input, output] = await Promise.all([
      client.getAnswers(yandexFormIds.day1Input),
      client.getAnswers(yandexFormIds.day1Output)
    ]);
    const availability = new Map<string, { date: string; inputCount: number; outputCount: number }>();

    for (const answer of input.answers ?? []) {
      const date = formatYandexDate(answer.created);
      const bucket = availability.get(date) ?? { date, inputCount: 0, outputCount: 0 };
      bucket.inputCount += 1;
      availability.set(date, bucket);
    }

    for (const answer of output.answers ?? []) {
      const date = formatYandexDate(answer.created);
      const bucket = availability.get(date) ?? { date, inputCount: 0, outputCount: 0 };
      bucket.outputCount += 1;
      availability.set(date, bucket);
    }

    return Response.json({
      status: "success",
      reportType: "day1",
      options: Array.from(availability.values()).sort((left, right) => right.date.localeCompare(left.date))
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load Yandex Forms availability."
      },
      { status: 500 }
    );
  }
}
