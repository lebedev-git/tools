import { yandexFormIds } from "@tools/analytics";
import { normalizeYandexValue, YandexFormsClient, type YandexFormAnswersResponse } from "@tools/integrations";

function normalizeForm(response: YandexFormAnswersResponse) {
  const columns = response.columns ?? [];
  const questionList = columns.map((column, index) => column.text || column.slug || `question_${index + 1}`);
  const answers = [];

  for (const answer of response.answers ?? []) {
    const normalizedAnswers: Record<string, unknown> = {};

    for (let index = 0; index < columns.length; index += 1) {
      const question = columns[index]?.text || columns[index]?.slug || `question_${index + 1}`;
      const normalizedValue = normalizeYandexValue(answer.data?.[index]?.value);

      if (normalizedValue === null || normalizedValue === "") {
        continue;
      }

      normalizedAnswers[question] = normalizedValue;
    }

    answers.push({
      answerId: answer.id,
      created: answer.created,
      answers: normalizedAnswers
    });
  }

  return {
    count: answers.length,
    questionList,
    answers
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const day1Date = searchParams.get("day1Date");
  const day2Date = searchParams.get("day2Date");

  if (!day1Date || !/^\d{4}-\d{2}-\d{2}$/.test(day1Date)) {
    return Response.json(
      {
        status: "error",
        message: "day1Date parameter in YYYY-MM-DD format is required."
      },
      { status: 400 }
    );
  }

  const client = new YandexFormsClient();

  try {
    const [input, output, day2] = await Promise.all([
      client.getAnswers(yandexFormIds.day1Input),
      client.getAnswers(yandexFormIds.day1Output),
      day2Date && /^\d{4}-\d{2}-\d{2}$/.test(day2Date) ? client.getAnswers(yandexFormIds.day2) : Promise.resolve(null)
    ]);

    const day1InputContext = normalizeForm(input);
    const day1OutputContext = normalizeForm(output);
    const day2Context = day2 ? normalizeForm(day2) : null;

    return Response.json({
      status: "success",
      day1Input: day1InputContext,
      day1Output: day1OutputContext,
      day2: day2Context
    });
  } catch (error) {
    console.error("Failed to fetch answers for scenario builder:", error);
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load answers."
      },
      { status: 500 }
    );
  }
}
