import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import type { ProcessRun, ProcessStep } from "@tools/core";
import type { ProtocolRecord } from "@tools/protocols";

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

function findMonorepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return process.cwd();
    }
    dir = parent;
  }
}

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;

  const storagePath = process.env.STORAGE_PATH ?? ".data/storage";
  const dbDir = isAbsolute(storagePath) ? storagePath : join(findMonorepoRoot(), storagePath);
  
  // Ensure the directory exists
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create database directory:", err);
  }

  const dbPath = join(dbDir, "db.sqlite");
  const db = new DatabaseSync(dbPath);
  
  // Enable WAL mode for better concurrency handling
  db.exec("PRAGMA journal_mode = WAL;");
  // web and worker share this DB; wait up to 5s on a locked writer instead of
  // throwing SQLITE_BUSY immediately.
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS protocol_records (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      status TEXT,
      participants TEXT, -- JSON string
      action_items INTEGER DEFAULT 0,
      decisions INTEGER DEFAULT 0,
      transcript TEXT,
      theme TEXT,
      agenda TEXT,
      key_points TEXT,
      decisions_text TEXT,
      tasks_text TEXT,
      responsible TEXT,
      deadlines TEXT,
      risks TEXT,
      attachments TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS process_runs (
      id TEXT PRIMARY KEY,
      tool_type TEXT,
      title TEXT,
      status TEXT,
      progress INTEGER,
      started_at TEXT,
      document_url TEXT,
      metadata TEXT -- JSON string containing extra details
    );

    CREATE TABLE IF NOT EXISTS process_run_steps (
      run_id TEXT,
      id TEXT,
      title TEXT,
      description TEXT,
      status TEXT,
      PRIMARY KEY (run_id, id),
      FOREIGN KEY (run_id) REFERENCES process_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS background_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT, -- 'protocol' | 'analytics'
      payload TEXT, -- JSON string
      status TEXT DEFAULT 'queued', -- 'queued' | 'running' | 'succeeded' | 'failed'
      progress INTEGER DEFAULT 0,
      message TEXT DEFAULT '',
      result TEXT DEFAULT '', -- JSON string of the result
      error TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `);

  try {
    db.exec("ALTER TABLE protocol_records ADD COLUMN notebook_id TEXT;");
  } catch (_) {}
  try {
    db.exec("ALTER TABLE protocol_records ADD COLUMN notebook_url TEXT;");
  } catch (_) {}
  try {
    db.exec("ALTER TABLE protocol_records ADD COLUMN meeting_format TEXT;");
  } catch (_) {}
  try {
    db.exec("ALTER TABLE protocol_records ADD COLUMN save_to_notebook INTEGER DEFAULT 0;");
  } catch (_) {}

  _db = db;
  return db;
}

// Prompt Settings Database Helpers
export function getPrompt(key: string, defaultValue: string): string {
  try {
    const db = getDb();
    const query = db.prepare("SELECT value FROM prompt_settings WHERE key = ?");
    const result = query.get(key) as { value: string } | undefined;
    // Treat an existing-but-empty value as "unset" and fall back to the default.
    // Otherwise blank rows saved by the settings UI (e.g. config.deepgram_model="")
    // override real defaults and break clients (empty model => provider 403).
    return result && result.value.trim() ? result.value : defaultValue;
  } catch (err) {
    console.error(`Failed to get prompt ${key}:`, err);
    return defaultValue;
  }
}

export function setPrompt(key: string, value: string): void {
  try {
    const db = getDb();
    const statement = db.prepare("INSERT INTO prompt_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    statement.run(key, value);
  } catch (err) {
    console.error(`Failed to set prompt ${key}:`, err);
  }
}

export function getAllPrompts(): Record<string, string> {
  const prompts: Record<string, string> = {};
  try {
    const db = getDb();
    const query = db.prepare("SELECT key, value FROM prompt_settings");
    const rows = query.all() as Array<{ key: string; value: string }>;
    for (const row of rows) {
      prompts[row.key] = row.value;
    }
  } catch (err) {
    console.error("Failed to get all prompts:", err);
  }
  return prompts;
}

// Protocols Database Helpers
export function getProtocols(): ProtocolRecord[] {
  try {
    const db = getDb();
    const query = db.prepare("SELECT * FROM protocol_records ORDER BY updated_at DESC");
    const rows = query.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      date: row.date,
      status: row.status,
      participants: row.participants ? JSON.parse(row.participants) : [],
      actionItems: row.action_items,
      decisions: row.decisions,
      transcript: row.transcript ?? "",
      theme: row.theme ?? "",
      agenda: row.agenda ?? "",
      keyPoints: row.key_points ?? "",
      decisionsText: row.decisions_text ?? "",
      tasksText: row.tasks_text ?? "",
      responsible: row.responsible ?? "",
      deadlines: row.deadlines ?? "",
      risks: row.risks ?? "",
      attachments: row.attachments ?? "",
      notebookId: row.notebook_id ?? "",
      notebookUrl: row.notebook_url ?? "",
      meetingFormat: (row.meeting_format as "regular" | "free") || undefined,
      saveToNotebook: row.save_to_notebook === 1
    }));
  } catch (err) {
    console.error("Failed to get protocols:", err);
    return [];
  }
}

export function saveProtocol(protocol: ProtocolRecord): void {
  try {
    const db = getDb();
    const statement = db.prepare(`
      INSERT INTO protocol_records (
        id, title, date, status, participants, action_items, decisions,
        transcript, theme, agenda, key_points, decisions_text, tasks_text,
        responsible, deadlines, risks, attachments, notebook_id, notebook_url, meeting_format, save_to_notebook, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        date = excluded.date,
        status = excluded.status,
        participants = excluded.participants,
        action_items = excluded.action_items,
        decisions = excluded.decisions,
        transcript = excluded.transcript,
        theme = excluded.theme,
        agenda = excluded.agenda,
        key_points = excluded.key_points,
        decisions_text = excluded.decisions_text,
        tasks_text = excluded.tasks_text,
        responsible = excluded.responsible,
        deadlines = excluded.deadlines,
        risks = excluded.risks,
        attachments = excluded.attachments,
        notebook_id = excluded.notebook_id,
        notebook_url = excluded.notebook_url,
        meeting_format = excluded.meeting_format,
        save_to_notebook = excluded.save_to_notebook,
        updated_at = excluded.updated_at
    `);
    const updatedAt = new Date().toISOString();
    statement.run(
      protocol.id,
      protocol.title,
      protocol.date,
      protocol.status,
      JSON.stringify(protocol.participants || []),
      protocol.actionItems || 0,
      protocol.decisions || 0,
      protocol.transcript || "",
      protocol.theme || "",
      protocol.agenda || "",
      protocol.keyPoints || "",
      protocol.decisionsText || "",
      protocol.tasksText || "",
      protocol.responsible || "",
      protocol.deadlines || "",
      protocol.risks || "",
      protocol.attachments || "",
      protocol.notebookId || null,
      protocol.notebookUrl || null,
      protocol.meetingFormat || null,
      protocol.saveToNotebook ? 1 : 0,
      updatedAt
    );
  } catch (err) {
    console.error("Failed to save protocol:", err);
  }
}

export function deleteProtocol(id: string): void {
  try {
    const db = getDb();
    const statement = db.prepare("DELETE FROM protocol_records WHERE id = ?");
    statement.run(id);
  } catch (err) {
    console.error(`Failed to delete protocol ${id}:`, err);
  }
}

// Process Runs Database Helpers
export function getProcessRun(id: string): ProcessRun | null {
  try {
    const db = getDb();
    const query = db.prepare("SELECT * FROM process_runs WHERE id = ?");
    const row = query.get(id) as any;
    if (!row) return null;

    const stepsQuery = db.prepare("SELECT * FROM process_run_steps WHERE run_id = ?");
    const stepsRows = stepsQuery.all(id) as any[];
    const steps: ProcessStep[] = stepsRows.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status
    }));

    return {
      id: row.id,
      toolType: row.tool_type,
      title: row.title,
      status: row.status,
      progress: row.progress,
      startedAt: row.started_at,
      documentUrl: row.document_url || undefined,
      steps
    };
  } catch (err) {
    console.error(`Failed to get process run ${id}:`, err);
    return null;
  }
}

export function saveProcessRun(run: ProcessRun): void {
  try {
    const db = getDb();
    
    // Use transaction for consistency
    db.exec("BEGIN TRANSACTION;");
    
    try {
      const runStmt = db.prepare(`
        INSERT INTO process_runs (id, tool_type, title, status, progress, started_at, document_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          progress = excluded.progress,
          document_url = excluded.document_url
      `);
      runStmt.run(run.id, run.toolType, run.title, run.status, run.progress, run.startedAt, run.documentUrl || null);

      if (run.steps && run.steps.length > 0) {
        const stepStmt = db.prepare(`
          INSERT INTO process_run_steps (run_id, id, title, description, status)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(run_id, id) DO UPDATE SET
            status = excluded.status
        `);
        for (const step of run.steps) {
          stepStmt.run(run.id, step.id, step.title, step.description, step.status);
        }
      }
      
      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }
  } catch (err) {
    console.error(`Failed to save process run ${run.id}:`, err);
  }
}

// Background Queue Helpers
export interface BackgroundJob {
  id: number;
  type: "protocol" | "analytics";
  payload: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  result: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}

export function addJob(type: "protocol" | "analytics", payload: any): number {
  try {
    const db = getDb();
    const statement = db.prepare(`
      INSERT INTO background_jobs (type, payload, status, progress, message, created_at, updated_at)
      VALUES (?, ?, 'queued', 0, 'В очереди', ?, ?)
    `);
    const now = new Date().toISOString();
    const info = statement.run(type, JSON.stringify(payload), now, now);
    return Number(info.lastInsertRowid);
  } catch (err) {
    console.error("Failed to add job:", err);
    throw err;
  }
}

export function getNextJob(): BackgroundJob | null {
  try {
    const db = getDb();
    const query = db.prepare("SELECT * FROM background_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1");
    const row = query.get() as any;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      status: row.status,
      progress: row.progress,
      message: row.message,
      result: row.result || "",
      error: row.error || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (err) {
    console.error("Failed to get next job:", err);
    return null;
  }
}

export function updateJob(
  id: number,
  updates: Partial<Omit<BackgroundJob, "id" | "createdAt">>
): void {
  try {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    
    for (const [key, val] of Object.entries(updates)) {
      const dbKey = key === "createdAt" ? "created_at" : key === "updatedAt" ? "updated_at" : key;
      fields.push(`${dbKey} = ?`);
      values.push(typeof val === "object" ? JSON.stringify(val) : val);
    }
    
    if (fields.length === 0) return;
    
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const statement = db.prepare(`UPDATE background_jobs SET ${fields.join(", ")} WHERE id = ?`);
    statement.run(...values);
  } catch (err) {
    console.error(`Failed to update job ${id}:`, err);
  }
}

export function getJob(id: number): BackgroundJob | null {
  try {
    const db = getDb();
    const query = db.prepare("SELECT * FROM background_jobs WHERE id = ?");
    const row = query.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      status: row.status,
      progress: row.progress,
      message: row.message,
      result: row.result || "",
      error: row.error || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (err) {
    console.error(`Failed to get job ${id}:`, err);
    return null;
  }
}

export function reapStaleJobs(onStartup = false): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    if (onStartup) {
      const stmt = db.prepare(`
        UPDATE background_jobs 
        SET status = 'failed', 
            error = 'Worker restarted while job was running', 
            message = 'Сбой: процесс воркера был перезапущен',
            updated_at = ?
        WHERE status = 'running'
      `);
      stmt.run(now);
    } else {
      const stmt = db.prepare("SELECT id, updated_at FROM background_jobs WHERE status = 'running'");
      const runningJobs = stmt.all() as Array<{ id: number; updated_at: string }>;
      const nowTime = new Date().getTime();
      const timeoutMs = 15 * 60 * 1000; // 15 minutes
      
      const updateStmt = db.prepare(`
        UPDATE background_jobs 
        SET status = 'failed', 
            error = 'Job timed out after 15 minutes of inactivity', 
            message = 'Превышен лимит времени выполнения задачи',
            updated_at = ?
        WHERE id = ?
      `);
      
      for (const job of runningJobs) {
        const updatedAt = new Date(job.updated_at).getTime();
        if (nowTime - updatedAt > timeoutMs) {
          updateStmt.run(now, job.id);
        }
      }
    }
  } catch (err) {
    console.error("Failed to reap stale jobs:", err);
  }
}

