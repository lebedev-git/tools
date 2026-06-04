export const tableNames = [
  "process_runs",
  "process_run_steps",
  "step_events",
  "provider_requests",
  "prompt_settings",
  "outline_publications",
  "document_versions",
  "form_snapshots",
  "analytics_documents",
  "protocol_records",
  "protocol_sections",
  "protocol_decisions",
  "protocol_action_items"
] as const;

export type TableName = (typeof tableNames)[number];

export interface MigrationPlanItem {
  table: TableName;
  purpose: string;
}

export const initialMigrationPlan: MigrationPlanItem[] = [
  {
    table: "process_runs",
    purpose: "Один запуск Analytics Tool или Protocol Tool."
  },
  {
    table: "prompt_settings",
    purpose: "Версионированные prompt namespaces для обоих инструментов."
  },
  {
    table: "document_versions",
    purpose: "История черновиков, approved и published документов."
  }
];
