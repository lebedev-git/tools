interface NormalizedFormContext {
  count: number;
  questionList: string[];
  answersSample: Array<{
    answerId: string;
    created: string;
    answers: Record<string, unknown>;
  }>;
}

export interface Day1ReportPromptInput {
  day1Date: string;
  input: NormalizedFormContext;
  output: NormalizedFormContext;
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 4).map(compactValue);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value).slice(0, 220);
  }

  if (typeof value === "string") {
    return value.slice(0, 220);
  }

  return value;
}

function compactAnswers(answers: NormalizedFormContext["answersSample"]) {
  return answers.slice(0, 3).map((answer, index) => ({
    index: index + 1,
    created: answer.created,
    answers: Object.fromEntries(Object.entries(answer.answers).map(([question, value]) => [question, compactValue(value)]))
  }));
}

function compactForm(form: NormalizedFormContext) {
  return {
    count: form.count,
    questionList: form.questionList,
    answersSample: compactAnswers(form.answersSample),
    sampleLimitNote: "Only first 3 answers are included in prompt; full sample size is in count."
  };
}

export function buildDay1ReportMessages(input: Day1ReportPromptInput) {
  const systemMessage =
    "Return a polished final report in Russian Markdown, ready to convert to Outline. Use a clear document structure: # title, short executive summary, ## sections, KPI/stat table, key findings, risks, recommendations, next steps. Avoid one long wall of text. Use short paragraphs, bullet lists and tables where useful. Do not include service notes, prompt text, drafts, or explanations of how you worked.";
  const chatInput = [
    "Prepare the day 1 analytical report. Write the final report in Russian.",
    "Compare input and output forms as two independent slices.",
    "Use count as the full sample size; use answersSample as representative examples.",
    "",
    JSON.stringify(
      {
        selections: { day1Date: input.day1Date },
        day1Context: {
          input: compactForm(input.input),
          output: compactForm(input.output)
        }
      },
      null,
      2
    )
  ].join("\n");

  return {
    title: `Day 1 analytics - ${input.day1Date}`,
    messages: [
      { role: "system" as const, content: systemMessage },
      { role: "user" as const, content: chatInput.length <= 7000 ? chatInput : `${chatInput.slice(0, 7000)}\n\n[Truncated for prompt limit.]` }
    ]
  };
}
