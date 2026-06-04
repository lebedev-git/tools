import type { ProcessRun, ProcessStep } from "@tools/core";

export type ProtocolStatus = "draft" | "generated" | "review" | "approved" | "published" | "archived";

export interface ProtocolRecord {
  id: string;
  title: string;
  date: string;
  status: ProtocolStatus;
  participants: string[];
  actionItems: number;
  decisions: number;
}

export const protocolFields = [
  "Название",
  "Дата",
  "Участники",
  "Тема",
  "Повестка",
  "Основные тезисы",
  "Решения",
  "Задачи",
  "Ответственные",
  "Сроки",
  "Риски",
  "Приложения"
];

export const protocolSteps: ProcessStep[] = [
  {
    id: "source",
    title: "Источник",
    description: "Ручной ввод, файл, транскрипт, форма или черновик.",
    status: "succeeded"
  },
  {
    id: "extract",
    title: "Извлечение структуры",
    description: "Участники, повестка, решения, задачи, сроки.",
    status: "succeeded",
    dependsOn: ["source"]
  },
  {
    id: "draft",
    title: "Черновик",
    description: "ИИ формирует черновик протокола без публикации.",
    status: "running",
    dependsOn: ["extract"]
  },
  {
    id: "review",
    title: "Согласование",
    description: "Ручная правка и утверждение.",
    status: "pending",
    dependsOn: ["draft"]
  },
  {
    id: "publish",
    title: "Публикация",
    description: "Публикация утвержденной версии.",
    status: "blocked",
    dependsOn: ["review"]
  }
];

export const sampleProtocols: ProtocolRecord[] = [
  {
    id: "protocol-001",
    title: "Сессия продукта: архитектура 2026",
    date: "04.06.2026",
    status: "review",
    participants: ["Product", "Engineering", "Operations"],
    actionItems: 7,
    decisions: 4
  },
  {
    id: "protocol-002",
    title: "Рабочее совещание по Outline",
    date: "03.06.2026",
    status: "published",
    participants: ["Automation", "Content"],
    actionItems: 3,
    decisions: 2
  }
];

export const latestProtocolRun: ProcessRun = {
  id: "protocol-run-001",
  toolType: "protocol",
  title: "Новый протокол встречи",
  status: "running",
  progress: 58,
  startedAt: "2026-06-04 13:42",
  steps: protocolSteps
};
