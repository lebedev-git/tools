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
  transcript?: string;
  theme?: string;
  agenda?: string;
  keyPoints?: string;
  decisionsText?: string;
  tasksText?: string;
  responsible?: string;
  deadlines?: string;
  risks?: string;
  attachments?: string;
  meetingFormat?: "regular" | "free";
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

export const sampleProtocols: ProtocolRecord[] = [];

export const latestProtocolRun: ProcessRun = {
  id: "protocol-run-001",
  toolType: "protocol",
  title: "Новый протокол встречи",
  status: "running",
  progress: 58,
  startedAt: "2026-06-04 13:42",
  steps: protocolSteps
};
