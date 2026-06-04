"use client";

import {
  Activity,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyticsBlocks, latestAnalyticsRun } from "@tools/analytics";
import { latestProtocolRun, protocolFields, sampleProtocols } from "@tools/protocols";
import { statusLabels, statusTone, type ProcessRun, type ProcessStep } from "@tools/core";

type Section = "analytics" | "protocols" | "runs" | "documents" | "settings";

interface IntegrationStatus {
  yandexForms: boolean;
  llm: boolean;
  outline: boolean;
  imageService: boolean;
  storage: boolean;
}

const navItems: Array<{ id: Section; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "analytics", label: "Аналитика", icon: Gauge },
  { id: "protocols", label: "Протоколы", icon: ClipboardList },
  { id: "runs", label: "Запуски", icon: Activity },
  { id: "documents", label: "Документы", icon: FileText },
  { id: "settings", label: "Настройки", icon: Settings }
];

const sessions = [
  { id: "s-001", date: "3 июня 2026", day1In: 18, day1Out: 6, day2: 14, status: "Готова к запуску" },
  { id: "s-002", date: "4 апреля 2026", day1In: 21, day1Out: 12, day2: 14, status: "Есть День 2" },
  { id: "s-003", date: "28 марта 2026", day1In: 16, day1Out: 9, day2: 0, status: "Только День 1" }
];

interface AvailabilityOption {
  date: string;
  inputCount: number;
  outputCount: number;
}

interface AnalyticsRunResult {
  status: "ready" | "no_data" | "error";
  message: string;
  reportMarkdown?: string;
  stats?: {
    inputCount: number;
    outputCount: number;
  };
}

const platformLayers = [
  { title: "UI shell", text: "Единая навигация и дизайн-система", icon: LayoutDashboard },
  { title: "Queue", text: "Graphile Worker без Docker и Redis", icon: Workflow },
  { title: "Database", text: "PostgreSQL, версии и audit trail", icon: Database },
  { title: "LLM adapter", text: "Provider requests и structured output", icon: Sparkles },
  { title: "Outline", text: "Публикация и версии документов", icon: FileText }
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function StatusPill({ status }: { status: keyof typeof statusLabels }) {
  return <span className={cx("status-pill", `tone-${statusTone[status]}`)}>{statusLabels[status]}</span>;
}

function StepIcon({ status }: { status: ProcessStep["status"] }) {
  if (status === "succeeded") {
    return <CheckCircle2 size={16} />;
  }

  if (status === "running" || status === "retrying") {
    return <Loader2 className="spin" size={16} />;
  }

  return <CircleDashed size={16} />;
}

function ProcessGraph({ steps }: { steps: ProcessStep[] }) {
  return (
    <div className="process-graph" aria-label="Граф процесса">
      {steps.map((step, index) => (
        <div className="graph-row" key={step.id}>
          <div className={cx("graph-node", `node-${step.status}`)}>
            <StepIcon status={step.status} />
            <div>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </div>
          </div>
          {index < steps.length - 1 ? <div className="graph-line" /> : null}
        </div>
      ))}
    </div>
  );
}

function RunSummary({ run }: { run: ProcessRun }) {
  return (
    <section className="run-summary">
      <div>
        <div className="eyebrow">{run.toolType === "analytics" ? "Analytics Tool" : "Protocol Tool"}</div>
        <h3>{run.title}</h3>
        <p>Запущено: {run.startedAt}</p>
      </div>
      <div className="run-meter">
        <StatusPill status={run.status} />
        <div className="meter">
          <span style={{ width: `${run.progress}%` }} />
        </div>
        <small>{run.progress}%</small>
      </div>
    </section>
  );
}

function AnalyticsView() {
  const [selectedSession, setSelectedSession] = useState(sessions[0]?.id ?? "");
  const [enabledBlocks, setEnabledBlocks] = useState(() => new Set(analyticsBlocks.filter((block) => block.enabled).map((block) => block.id)));
  const [availability, setAvailability] = useState<AvailabilityOption[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<AnalyticsRunResult | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAvailability() {
      setIsLoadingAvailability(true);
      try {
        const response = await fetch("/api/analytics/availability?reportType=day1");
        const data = (await response.json()) as { options?: AvailabilityOption[]; message?: string };

        if (!mounted) {
          return;
        }

        setAvailability(data.options ?? []);
        if (data.options?.[0]) {
          setSelectedSession(data.options[0].date);
        }
      } catch (error) {
        if (mounted) {
          setRunResult({
            status: "error",
            message: error instanceof Error ? error.message : "Не удалось загрузить даты из Yandex Forms."
          });
        }
      } finally {
        if (mounted) {
          setIsLoadingAvailability(false);
        }
      }
    }

    void loadAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  const realSessions = availability.map((option) => ({
    id: option.date,
    date: option.date,
    day1In: option.inputCount,
    day1Out: option.outputCount,
    day2: 0,
    status: option.inputCount + option.outputCount > 0 ? "Готова к запуску" : "Нет ответов"
  }));
  const sessionOptions = realSessions.length ? realSessions : sessions;
  const currentSession = sessionOptions.find((session) => session.id === selectedSession) ?? sessionOptions[0];
  const selectedBlocks = analyticsBlocks.filter((block) => enabledBlocks.has(block.id));

  function handleBlockToggle(blockId: (typeof analyticsBlocks)[number]["id"]) {
    setEnabledBlocks((current) => {
      const next = new Set(current);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  async function handleRunClick() {
    if (!currentSession) {
      return;
    }

    setIsRunning(true);
    setRunResult(null);

    try {
      const response = await fetch("/api/analytics/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportType: "day1",
          day1Date: currentSession.id
        })
      });
      const data = (await response.json()) as AnalyticsRunResult;
      setRunResult(data);
    } catch (error) {
      setRunResult({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось запустить аналитику."
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Analytics Tool</div>
          <h1>Операторская консоль аналитики</h1>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button" aria-label="Фильтры">
            <SlidersHorizontal size={18} />
          </button>
          <button className="primary-button" disabled={isRunning || !currentSession} onClick={handleRunClick}>
            {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            {isRunning ? "Запуск" : "Запустить"}
          </button>
        </div>
      </section>

      <section className="three-column">
        <div className="panel">
          <div className="panel-head">
            <h2>Сессии</h2>
            <Search size={17} />
          </div>
          <div className="session-list">
            {isLoadingAvailability ? <div className="loading-line">Загрузка дат из Yandex Forms</div> : null}
            {sessionOptions.map((session) => (
              <button className={cx("session-row", selectedSession === session.id && "selected")} key={session.id} onClick={() => setSelectedSession(session.id)}>
                <span>{session.date}</span>
                <small>
                  День 1: {session.day1In}/{session.day1Out} · День 2: {session.day2 || "нет"}
                </small>
                <em>{session.status}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="panel main-panel">
          <div className="panel-head">
            <h2>Конструктор сценария</h2>
            <span className="muted">{currentSession?.date}</span>
          </div>
          <div className="builder-grid">
            {analyticsBlocks.map((block) => {
              const enabled = enabledBlocks.has(block.id);
              return (
                <button className={cx("builder-block", enabled && "enabled")} key={block.id} onClick={() => handleBlockToggle(block.id)}>
                  <span className="block-marker">{enabled ? <CheckCircle2 size={16} /> : <Plus size={16} />}</span>
                  <strong>{block.title}</strong>
                  <small>{block.description}</small>
                </button>
              );
            })}
          </div>
          <div className="selected-flow">
            <div>
              <strong>Выбрано блоков: {selectedBlocks.length}</strong>
              <span>{selectedBlocks.map((block) => block.title).join(" -> ")}</span>
            </div>
            <Workflow size={22} />
          </div>
          <ProcessGraph steps={latestAnalyticsRun.steps} />
          {runResult ? (
            <div className={cx("run-result", runResult.status === "error" && "error", runResult.status === "ready" && "success")}>
              <strong>{runResult.status === "ready" ? "Запуск выполнен" : runResult.status === "no_data" ? "Нет данных" : "Ошибка запуска"}</strong>
              <span>{runResult.message}</span>
              {runResult.stats ? (
                <small>
                  Входных: {runResult.stats.inputCount} · Выходных: {runResult.stats.outputCount}
                </small>
              ) : null}
            </div>
          ) : null}
          {runResult?.reportMarkdown ? (
            <article className="report-preview">
              <div className="panel-head">
                <h2>Результат аналитики</h2>
                <FileText size={17} />
              </div>
              <pre>{runResult.reportMarkdown}</pre>
            </article>
          ) : null}
        </div>

        <aside className="panel inspector">
          <div className="panel-head">
            <h2>Параметры</h2>
            <Settings size={17} />
          </div>
          <label>
            Prompt preset
            <select defaultValue="analytics.day1.v1">
              <option value="analytics.day1.v1">analytics.day1.v1</option>
              <option value="analytics.day2.v1">analytics.day2.v1</option>
              <option value="analytics.overall.v1">analytics.overall.v1</option>
            </select>
          </label>
          <label>
            Модель
            <select defaultValue="qwen-compatible">
              <option value="qwen-compatible">OpenAI-compatible provider</option>
              <option value="fallback">Fallback provider</option>
            </select>
          </label>
          <label className="check-line">
            <input checked={enabledBlocks.has("media")} onChange={() => handleBlockToggle("media")} type="checkbox" />
            Загружать фото
          </label>
          <label className="check-line">
            <input checked={enabledBlocks.has("nps")} onChange={() => handleBlockToggle("nps")} type="checkbox" />
            Добавить NPS
          </label>
          <RunSummary run={latestAnalyticsRun} />
        </aside>
      </section>
    </main>
  );
}

function ProtocolsView() {
  const [selectedProtocol, setSelectedProtocol] = useState(sampleProtocols[0]?.id ?? "");
  const protocol = sampleProtocols.find((item) => item.id === selectedProtocol) ?? sampleProtocols[0];

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Protocol Tool</div>
          <h1>Инструмент подготовки протоколов</h1>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button">
            <RefreshCw size={17} />
            Regenerate draft
          </button>
          <button className="primary-button">
            <ArrowUpRight size={17} />
            Publish
          </button>
        </div>
      </section>

      <section className="three-column protocol-layout">
        <div className="panel">
          <div className="panel-head">
            <h2>Протоколы</h2>
            <Plus size={17} />
          </div>
          <div className="session-list">
            {sampleProtocols.map((item) => (
              <button className={cx("session-row", item.id === selectedProtocol && "selected")} key={item.id} onClick={() => setSelectedProtocol(item.id)}>
                <span>{item.title}</span>
                <small>{item.date} · {item.participants.length} участника</small>
                <em>{item.status}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="panel main-panel">
          <div className="panel-head">
            <h2>{protocol?.title}</h2>
            <StatusPill status={latestProtocolRun.status} />
          </div>
          <div className="protocol-editor">
            {protocolFields.map((field, index) => (
              <label key={field}>
                {field}
                <input
                  defaultValue={
                    index === 0
                      ? protocol?.title
                      : index === 1
                        ? protocol?.date
                        : index === 2
                          ? protocol?.participants.join(", ")
                          : ""
                  }
                  placeholder={`Заполнить: ${field.toLowerCase()}`}
                />
              </label>
            ))}
          </div>
        </div>

        <aside className="panel inspector">
          <div className="panel-head">
            <h2>Решения и задачи</h2>
            <ListChecks size={17} />
          </div>
          <div className="metric-grid">
            <div>
              <strong>{protocol?.decisions}</strong>
              <span>решения</span>
            </div>
            <div>
              <strong>{protocol?.actionItems}</strong>
              <span>задачи</span>
            </div>
          </div>
          <ProcessGraph steps={latestProtocolRun.steps} />
          <RunSummary run={latestProtocolRun} />
        </aside>
      </section>
    </main>
  );
}

function RunsView() {
  const runs = [latestAnalyticsRun, latestProtocolRun];

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Shared Platform</div>
          <h1>Запуски</h1>
        </div>
      </section>
      <section className="panel">
        <div className="runs-table">
          {runs.map((run) => (
            <RunSummary key={run.id} run={run} />
          ))}
        </div>
      </section>
    </main>
  );
}

function DocumentsView() {
  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Outline publications</div>
          <h1>Документы</h1>
        </div>
      </section>
      <section className="documents-grid">
        {[
          ["analytics_note", "Аналитическая записка День 1", "draft"],
          ["nps_report", "NPS отчет", "generated"],
          ["protocol", "Протокол встречи", "published"]
        ].map(([type, title, status]) => (
          <article className="document-card" key={title}>
            <FileText size={20} />
            <strong>{title}</strong>
            <span>{type}</span>
            <em>{status}</em>
          </article>
        ))}
      </section>
    </main>
  );
}

function SettingsView() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      const response = await fetch("/api/integrations/status");
      const nextStatus = (await response.json()) as IntegrationStatus;

      if (mounted) {
        setStatus(nextStatus);
      }
    }

    void loadStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Shared Platform</div>
          <h1>Настройки и интеграции</h1>
        </div>
      </section>
      <section className="platform-grid">
        {platformLayers.map((layer) => {
          const Icon = layer.icon;
          return (
            <article className="platform-card" key={layer.title}>
              <Icon size={20} />
              <strong>{layer.title}</strong>
              <span>{layer.text}</span>
            </article>
          );
        })}
      </section>
      <section className="panel settings-panel">
        <h2>Статус подключений</h2>
        <div className="namespace-grid">
          {[
            ["Yandex Forms", status?.yandexForms],
            ["LLM provider", status?.llm],
            ["Outline", status?.outline],
            ["Image service", status?.imageService],
            ["Storage", status?.storage]
          ].map(([label, connected]) => (
            <span className={cx("integration-status", connected === true && "connected", connected === false && "missing")} key={String(label)}>
              <strong>{label}</strong>
              <em>{connected === undefined ? "Проверка" : connected ? "Подключено" : "Не настроено"}</em>
            </span>
          ))}
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>Prompt namespaces</h2>
        <div className="namespace-grid">
          <span>analytics.day1</span>
          <span>analytics.day2</span>
          <span>analytics.overall</span>
          <span>analytics.nps</span>
          <span>protocol.meeting</span>
          <span>protocol.session</span>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("analytics");
  const activeView = useMemo(() => {
    if (section === "protocols") {
      return <ProtocolsView />;
    }
    if (section === "runs") {
      return <RunsView />;
    }
    if (section === "documents") {
      return <DocumentsView />;
    }
    if (section === "settings") {
      return <SettingsView />;
    }
    return <AnalyticsView />;
  }, [section]);

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand">
          <Boxes size={22} />
          <div>
            <strong>Tools</strong>
            <span>2026 platform</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={cx(section === item.id && "active")} key={item.id} onClick={() => setSection(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="rail-footer">
          <ShieldCheck size={17} />
          <span>Analytics и Protocol разделены бизнес-логикой</span>
        </div>
      </aside>
      {activeView}
    </div>
  );
}
