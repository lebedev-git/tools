export type ToolType = "analytics" | "protocol";

export type RunStatus =
  | "draft"
  | "validated"
  | "queued"
  | "running"
  | "waiting_external"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StepStatus =
  | "pending"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "retrying";

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  dependsOn?: string[];
}

export interface ProcessRun {
  id: string;
  toolType: ToolType;
  title: string;
  status: RunStatus;
  progress: number;
  startedAt: string;
  documentUrl?: string;
  steps: ProcessStep[];
}

export const statusLabels: Record<RunStatus | StepStatus, string> = {
  blocked: "Заблокирован",
  cancelled: "Отменен",
  draft: "Черновик",
  failed: "Ошибка",
  pending: "Ожидает",
  queued: "В очереди",
  retrying: "Повтор",
  running: "В работе",
  skipped: "Пропущен",
  succeeded: "Готово",
  validated: "Проверен",
  waiting_external: "Ожидает API"
};

export const statusTone: Record<RunStatus | StepStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  blocked: "warning",
  cancelled: "neutral",
  draft: "neutral",
  failed: "danger",
  pending: "neutral",
  queued: "info",
  retrying: "warning",
  running: "info",
  skipped: "neutral",
  succeeded: "success",
  validated: "success",
  waiting_external: "warning"
};
