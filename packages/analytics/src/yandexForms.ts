export const yandexFormIds = {
  day1Input: "69b447a8e010db3d6b505b69",
  day1Output: "69b5762790fa7b47e155853c",
  day2: "69b5799f49af4761ee2057c6"
} as const;

export type YandexFormKind = keyof typeof yandexFormIds;

export interface YandexFormSource {
  kind: YandexFormKind;
  formId: string;
  label: string;
}

export const yandexFormSources: YandexFormSource[] = [
  {
    kind: "day1Input",
    formId: yandexFormIds.day1Input,
    label: "День 1: входная форма"
  },
  {
    kind: "day1Output",
    formId: yandexFormIds.day1Output,
    label: "День 1: выходная форма"
  },
  {
    kind: "day2",
    formId: yandexFormIds.day2,
    label: "День 2"
  }
];
