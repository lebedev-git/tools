"use client";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  Camera,
  ChevronDown,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Compass,
  Database,
  Download,
  FileCheck,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Sun,
  User,
  Workflow
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { analyticsBlocks, latestAnalyticsRun } from "@tools/analytics";
import { latestProtocolRun, protocolFields, sampleProtocols } from "@tools/protocols";
import { statusLabels, statusTone, type ProcessRun, type ProcessStep } from "@tools/core";

type Section =
  | "analytics"
  | "prompts"
  | "prompt-day1"
  | "prompt-day2"
  | "prompt-overall"
  | "prompt-products"
  | "prompt-infographic"
  | "prompt-logo"
  | "prompt-generalPhoto"
  | "prompt-publish"
  | "protocols"
  | "runs"
  | "documents"
  | "settings";

type AnalyticsBlockId = (typeof analyticsBlocks)[number]["id"];

interface IntegrationStatus {
  yandexForms: boolean;
  llm: boolean;
  outline: boolean;
  imageService: boolean;
  storage: boolean;
}

interface AvailabilityOption {
  date: string;
  inputCount: number;
  outputCount: number;
}

interface Day2AvailabilityOption {
  date: string;
  count: number;
}

interface AnalyticsRunResult {
  status: "ready" | "no_data" | "error";
  message: string;
  reportMarkdown?: string;
  infographicImageUrl?: string;
  stageReports?: Partial<Record<AnalyticsBlockId, string>>;
  stats?: {
    inputCount: number;
    outputCount: number;
    day2Count?: number;
  };
}

interface NpsBucketResult {
  label: string;
  date: string;
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number;
}

interface RunStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "succeeded" | "failed";
}

const promptDefaults: Record<AnalyticsBlockId, string> = {
  day1: "Проанализируй анкеты обратной связи участников за День 1. Сделай структурированный отчет на русском языке.\nВыдели:\n1. Количество ответов, общий уровень удовлетворенности и индекс NPS.\n2. Топ-3 освоенных инструментов (например: Perplexity, Gamma, Suno).\n3. Качественные показатели изменения отношения к ИИ (в процентах и долях).\n4. Качественные эффекты: преодоление страха (уверенность на входе/выходе), формирование единого понятийного поля, практические результаты внедрения (планы внедрения, автоматизация отчетности).",
  day2: "Проанализируй анкеты обратной связи участников за День 2.\nСфокусируйся на динамике по сравнению с Днем 1:\n1. Сравнительные метрики NPS и удовлетворенности.\n2. Изменение уверенности при работе с ИИ, командная согласованность.\n3. Новые изученные сценарии и продвинутые инструменты.",
  overall: "Синтезируй результаты первого и второго дня стратегической сессии в единую аналитическую справку на русском языке.\nСобери все ключевые метрики (NPS по дням, командная согласованность, рост числа освоенных инструментов).\nОпиши качественные эффекты (преодоление барьеров, командная синергия, практические планы).",
  products: "Проанализируй предложенные на сессии концепции цифровых продуктов.\nДля каждого продукта опиши:\n- Название и суть концепции (например: ИИ-генератор контента, Система ИИ-модерации, Бот-тренажер).\n- Решаемую проблему и практическую ценность.\n- Как продукт автоматизирует работу и повышает эффективность.",
  infographic: "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.\nРазметка должна строго соответствовать следующей структуре:\n\nЗАГОЛОВОК (ВЕРХНИЙ КОЛОНТИТУЛ):\nТренажёр «МАЯК» | ИИ-грамотность для органов власти [Даты сессии, Город]\n\nЛЕВАЯ КОЛОНКА: ЗАДАЧИ И МЕТРИКИ\nЭффективность программы:\n• NPS День 1: [Значение]\n• NPS День 2: [Значение]\n• Командная согласованность: [Оценка]/10\n• Рост числа инструментов: [На входе] → [На выходе] (+[Разница] за день)\n\nПРАВАЯ КОЛОНКА (ИЛИ НИЖНИЙ БЛОК): КОМПЕТЕНЦИИ И ИНСАЙТЫ\nКОМПЕТЕНЦИИ И НАВЫКИ (Уровень владения ИИ):\n• На входе: [Оценка]/10\n• На выходе: [Оценка]/10 (Рост уверенности в [Коэффициент] раза)\n\nТоп-3 инструментария (Лидеры освоения):\n1. Аналитика и Данные: [Инструмент 1]\n2. Визуал и Презентации: [Инструмент 2]\n3. Креатив и Аудио: [Инструмент 3]\n\nКАЧЕСТВЕННЫЕ ПОКАЗАТЕЛИ (Изменение отношения к ИИ):\n• Кардинально изменилось (Увидели огромный потенциал): [Процент]% ([Доля])\n• Дополнилось (Увидели новые сценарии): [Процент]% ([Доля])\n\nКачественные эффекты:\n• Преодоление страха: [Краткое описание эффекта и количества инструментов].\n• Командная синергия: [Описание формирования единого понятийного поля].\n• Практический результат: [Описание конкретных планов внедрения и автоматизации отчетов].\n\nВизуальное оформление: указать место для логотипа и общего фото участников, цветовой стиль адаптировать под цвета логотипа.",
  logo: "",
  generalPhoto: "",
  publish: ""
};

function formatDate(value?: string) {
  if (!value) {
    return "";
  }
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function isPromptBlock(blockId: AnalyticsBlockId) {
  return blockId !== "logo" && blockId !== "generalPhoto" && blockId !== "publish";
}

const platformLayers = [
  { title: "Интерфейс", text: "Единая навигация и дизайн-система", icon: LayoutDashboard },
  { title: "Очередь задач", text: "Graphile Worker без Docker и Redis", icon: Workflow },
  { title: "База данных", text: "PostgreSQL, версии и аудит изменений", icon: Database },
  { title: "ИИ-адаптер", text: "Запросы к моделям и структурированный вывод", icon: Sparkles },
  { title: "Публикация", text: "Публикация и версии документов в Outline", icon: FileText }
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

interface AnalyticsViewProps {
  promptSettings: Record<AnalyticsBlockId, string>;
  activeRun: ProcessRun;
  setActiveRun: Dispatch<SetStateAction<ProcessRun>>;
}

function AnalyticsView({ promptSettings, activeRun, setActiveRun }: AnalyticsViewProps) {
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedDay2Date, setSelectedDay2Date] = useState("");
  const [enabledBlocks, setEnabledBlocks] = useState(() => new Set(analyticsBlocks.filter((block) => block.enabled && block.id !== "day2").map((block) => block.id)));
  const [availability, setAvailability] = useState<AvailabilityOption[]>([]);
  const [day2Availability, setDay2Availability] = useState<Day2AvailabilityOption[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [isSessionPickerOpen, setIsSessionPickerOpen] = useState(false);
  const [isDay2PickerOpen, setIsDay2PickerOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isCalculatingNps, setIsCalculatingNps] = useState(false);
  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [runResult, setRunResult] = useState<AnalyticsRunResult | null>(null);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);

  interface NpsData {
    status: string;
    nps: number;
    promoters: number;
    passives: number;
    detractors: number;
    total: number;
    results: NpsBucketResult[];
    message?: string;
  }

  const [npsResult, setNpsResult] = useState<string | null>(null);
  const [npsData, setNpsData] = useState<NpsData | null>(null);
  const [assetFiles, setAssetFiles] = useState<Record<string, string[]>>({});

  const loadAvailability = useCallback(async () => {
    setIsLoadingAvailability(true);
    setRunResult(null);
    try {
      const [day1Response, day2Response] = await Promise.all([
        fetch("/api/analytics/availability?reportType=day1"),
        fetch("/api/analytics/availability?reportType=day2")
      ]);
      const day1Data = (await day1Response.json()) as { options?: AvailabilityOption[]; message?: string };
      const day2Data = (await day2Response.json()) as { options?: Day2AvailabilityOption[]; message?: string };

      setAvailability(day1Data.options ?? []);
      setDay2Availability(day2Data.options ?? []);
      setSelectedSession((current) => current || (day1Data.options?.[0]?.date ?? ""));
      setSelectedDay2Date((current) => current || (day2Data.options?.[0]?.date ?? ""));
    } catch (error) {
      setRunResult({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось загрузить даты из Yandex Forms."
      });
    } finally {
      setIsLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const sessionOptions = availability.map((option) => ({
    id: option.date,
    date: option.date,
    day1In: option.inputCount,
    day1Out: option.outputCount
  }));
  const currentSession = sessionOptions.find((session) => session.id === selectedSession) ?? null;
  const currentDay2Session = day2Availability.find((session) => session.date === selectedDay2Date) ?? null;
  const selectedBlocks = analyticsBlocks.filter((block) => enabledBlocks.has(block.id));
  const selectedFlowText = selectedBlocks.length ? selectedBlocks.map((block) => block.title).join(" -> ") : "Выберите хотя бы один этап";
  const hasDay1Block = enabledBlocks.has("day1");
  const hasDay2Block = enabledBlocks.has("day2");
  const hasAssetUploads = enabledBlocks.has("products") || enabledBlocks.has("logo") || enabledBlocks.has("generalPhoto");
  const hasRequiredDates = (!hasDay1Block || Boolean(currentSession)) && (!hasDay2Block || Boolean(currentDay2Session));
  const canRun = hasRequiredDates && selectedBlocks.length > 0 && !isLoadingAvailability;

  function isBlockDisabled(blockId: AnalyticsBlockId) {
    const hasAnyDay = enabledBlocks.has("day1") || enabledBlocks.has("day2");
    
    if (blockId === "day1" || blockId === "day2") {
      return false;
    }
    if (blockId === "overall") {
      return !(enabledBlocks.has("day1") && enabledBlocks.has("day2"));
    }
    if (blockId === "products") {
      return !enabledBlocks.has("overall");
    }
    if (blockId === "infographic") {
      return !hasAnyDay && !enabledBlocks.has("overall") && !enabledBlocks.has("products");
    }
    if (blockId === "logo" || blockId === "generalPhoto") {
      return !enabledBlocks.has("infographic");
    }
    if (blockId === "publish") {
      return enabledBlocks.size === 0;
    }
    return false;
  }

  function handleBlockToggle(blockId: AnalyticsBlockId) {
    if (!enabledBlocks.has(blockId) && isBlockDisabled(blockId)) {
      return;
    }

    setEnabledBlocks((current) => {
      const next = new Set(current);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      
      // Cascade-disable logic
      if (!next.has("day1") || !next.has("day2")) {
        next.delete("overall");
      }
      if (!next.has("overall")) {
        next.delete("products");
      }
      
      const hasAnyDay = next.has("day1") || next.has("day2");
      
      if (!hasAnyDay) {
        next.delete("overall");
        next.delete("products");
        next.delete("infographic");
        next.delete("logo");
        next.delete("generalPhoto");
      }
      if (!next.has("day1") && !next.has("day2") && !next.has("overall") && !next.has("products")) {
        next.delete("infographic");
      }
      if (!next.has("infographic")) {
        next.delete("logo");
        next.delete("generalPhoto");
      }
      if (next.size === 0) {
        next.delete("publish");
      }
      return next;
    });
  }

  function handleAssetChange(assetId: "products" | "logo" | "generalPhoto" | "infographic", files: FileList | null) {
    setAssetFiles((current) => ({
      ...current,
      [assetId]: files ? Array.from(files).map((file) => file.name) : []
    }));
  }

  async function handleRunClick() {
    if (!canRun || !currentSession) {
      return;
    }

    setIsRunning(true);
    setHasRunStarted(true);
    setRunResult(null);

    // Initialize execution steps graph
    const initialSteps: RunStep[] = [
      { id: "fetch-forms", title: "Загрузка Яндекс Форм", description: "Запрос ответов из Yandex Forms", status: "running" },
      { id: "normalize", title: "Подготовка данных", description: "Очистка данных и сопоставление ответов", status: "pending" }
    ];

    if (enabledBlocks.has("day1")) {
      initialSteps.push({ id: "day1", title: "ИИ-анализ: День 1", description: "Аналитическая обработка первого дня сессии", status: "pending" });
    }
    if (enabledBlocks.has("day2")) {
      initialSteps.push({ id: "day2", title: "ИИ-анализ: День 2", description: "Анализ динамики и результатов второго дня", status: "pending" });
    }
    if (enabledBlocks.has("overall")) {
      initialSteps.push({ id: "overall", title: "Синтез результатов", description: "Подготовка общей аналитической справки", status: "pending" });
    }
    if (enabledBlocks.has("products")) {
      initialSteps.push({ id: "products", title: "Анализ концепций продуктов", description: "Анализ цифровых продуктов сессии", status: "pending" });
    }
    if (enabledBlocks.has("infographic")) {
      initialSteps.push({ id: "infographic", title: "Генерация инфографики", description: "Визуализация ключевых метрик сессии", status: "pending" });
    }
    if (enabledBlocks.has("publish")) {
      initialSteps.push({ id: "publish", title: "Публикация в Outline", description: "Сохранение и выгрузка отчетов в Outline", status: "pending" });
    }

    setRunSteps(initialSteps);

    // Set initial active run metadata status
    setActiveRun({
      ...latestAnalyticsRun,
      status: "running",
      progress: 10,
      steps: latestAnalyticsRun.steps.map((s) => {
        if (s.id === "fetch-forms") return { ...s, status: "running" as const };
        return { ...s, status: "pending" as const };
      })
    });

    // Start simulations of early stages
    const timeout1 = setTimeout(() => {
      setRunSteps((prev) => prev.map((s) => {
        if (s.id === "fetch-forms") return { ...s, status: "succeeded" as const };
        if (s.id === "normalize") return { ...s, status: "running" as const };
        return s;
      }));
      setActiveRun((prev) => ({
        ...prev,
        progress: 30,
        steps: prev.steps.map((s) => {
          if (s.id === "fetch-forms") return { ...s, status: "succeeded" as const };
          if (s.id === "normalize") return { ...s, status: "running" as const };
          return s;
        })
      }));
    }, 1200);

    const timeout2 = setTimeout(() => {
      setRunSteps((prev) => prev.map((s) => {
        if (s.id === "normalize") return { ...s, status: "succeeded" as const };
        if (["day1", "day2", "overall", "products"].includes(s.id)) return { ...s, status: "running" as const };
        return s;
      }));
      setActiveRun((prev) => ({
        ...prev,
        progress: 60,
        steps: prev.steps.map((s) => {
          if (s.id === "normalize") return { ...s, status: "succeeded" as const };
          if (s.id === "llm") return { ...s, status: "running" as const };
          return s;
        })
      }));
    }, 2400);

    try {
      const response = await fetch("/api/analytics/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportType: "day1",
          day1Date: currentSession.id,
          day2Date: currentDay2Session?.date,
          selectedBlocks: selectedBlocks.map((block) => block.id),
          stagePrompts: Object.fromEntries(selectedBlocks.filter((block) => isPromptBlock(block.id)).map((block) => [block.id, promptSettings[block.id]])),
          assetFiles
        })
      });

      const data = (await response.json()) as AnalyticsRunResult & {
        run?: {
          id: string;
          steps: Array<{
            id: string;
            title: string;
            description?: string;
            status: ProcessStep["status"];
          }>;
        };
      };

      clearTimeout(timeout1);
      clearTimeout(timeout2);

      if (response.ok && (data.status === "ready" || data.status === "no_data")) {
        // Fast-forward fetch and normalize steps to success, and set LLM steps to success
        setRunSteps((prev) => prev.map((s) => {
          if (s.id === "fetch-forms" || s.id === "normalize" || ["day1", "day2", "overall", "products"].includes(s.id)) {
            return { ...s, status: "succeeded" as const };
          }
          return s;
        }));

        // Execute infographic step sequentially if selected
        if (enabledBlocks.has("infographic")) {
          setRunSteps((prev) => prev.map((s) => s.id === "infographic" ? { ...s, status: "running" as const } : s));
          setActiveRun((prev) => ({
            ...prev,
            progress: 80,
            steps: prev.steps.map((s) => {
              if (s.id === "llm") return { ...s, status: "succeeded" as const };
              if (s.id === "media") return { ...s, status: "running" as const };
              return s;
            })
          }));
          await new Promise((resolve) => setTimeout(resolve, 2500));
          const imageOk = Boolean(data.infographicImageUrl);
          setRunSteps((prev) => prev.map((s) => s.id === "infographic" ? { ...s, status: imageOk ? "succeeded" as const : "failed" as const } : s));
        }

        // Execute publish step sequentially if selected
        if (enabledBlocks.has("publish")) {
          setRunSteps((prev) => prev.map((s) => s.id === "publish" ? { ...s, status: "running" as const } : s));
          setActiveRun((prev) => ({
            ...prev,
            progress: 90,
            steps: prev.steps.map((s) => {
              if (s.id === "media") return { ...s, status: "succeeded" as const };
              if (s.id === "publish") return { ...s, status: "running" as const };
              return s;
            })
          }));
          await new Promise((resolve) => setTimeout(resolve, 1500));
          setRunSteps((prev) => prev.map((s) => s.id === "publish" ? { ...s, status: "succeeded" as const } : s));
        }

        setRunResult(data);
        setIsRunning(false);

        if (data.status === "ready" && data.run) {
          setActiveRun({
            id: data.run.id,
            toolType: "analytics",
            title: `Аналитика ${formatDate(currentSession.id)}`,
            status: "succeeded",
            progress: 100,
            startedAt: activeRun.startedAt,
            steps: data.run.steps.map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description || "",
              status: s.status
            }))
          });
        } else {
          setActiveRun((prev) => ({ ...prev, status: "failed", progress: 100 }));
        }
      } else {
        throw new Error(data.message || "Ошибка генерации отчетов.");
      }
    } catch (error) {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      setRunResult({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось запустить аналитику."
      });
      setRunSteps((prev) => prev.map((s) => {
        if (s.status === "running" || s.status === "pending") {
          return { ...s, status: "failed" as const };
        }
        return s;
      }));
      setActiveRun((prev) => ({ ...prev, status: "failed" }));
      setIsRunning(false);
    }
  }

  async function handleNpsClick() {
    if ((!hasDay1Block || !currentSession) && (!hasDay2Block || !currentDay2Session)) {
      return;
    }

    setIsCalculatingNps(true);
    setNpsResult(null);
    setNpsData(null);

    try {
      const response = await fetch("/api/analytics/nps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          day1Date: hasDay1Block ? currentSession?.id : undefined,
          day2Date: hasDay2Block ? currentDay2Session?.date : undefined
        })
      });
      const data = (await response.json()) as {
        status: string;
        nps?: number;
        promoters?: number;
        passives?: number;
        detractors?: number;
        total?: number;
        results?: NpsBucketResult[];
        message?: string;
      };
      if (data.status === "ready" && typeof data.nps === "number") {
        setNpsData(data as NpsData);
        const byDate = (data.results ?? [])
          .filter((item) => item.total > 0)
          .map((item) => `${item.label} ${formatDate(item.date)}: ${item.total} ответов, NPS ${item.nps}`)
          .join("; ");
        setNpsResult(
          `${byDate}. Итого: ${data.total} ответов, NPS ${data.nps}; промоутеры ${data.promoters}, нейтральные ${data.passives}, критики ${data.detractors}.`
        );
      } else {
        setNpsResult(data.message ?? "Не удалось посчитать NPS.");
      }
    } catch (error) {
      setNpsResult(error instanceof Error ? error.message : "Не удалось посчитать NPS.");
    } finally {
      setIsCalculatingNps(false);
    }
  }

  async function handleDownloadResult(block: { id: AnalyticsBlockId; title: string }) {
    const content = runResult?.stageReports?.[block.id] ?? runResult?.reportMarkdown;

    if (!content) {
      return;
    }

    try {
      const response = await fetch("/api/analytics/download-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: block.title,
          markdown: content
        })
      });

      if (!response.ok) {
        throw new Error("Не удалось сгенерировать DOCX файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${block.title.toLowerCase().replace(/\s+/g, "-")}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании файла.");
    }
  }

  const blockCardDetails = (blockId: AnalyticsBlockId) => {
    if (blockId === "day1") {
      return currentSession ? `03.06.2026 - ${currentSession.day1In + currentSession.day1Out} отв.` : "03.06.2026 - 18 ответов";
    }
    if (blockId === "day2") {
      return currentDay2Session ? `04.04.2026 - ${currentDay2Session.count} отв.` : "04.04.2026 - 14 ответов";
    }
    return "";
  };

  const blockIcons: Record<AnalyticsBlockId, React.ComponentType<{ size?: number }>> = {
    day1: Calendar,
    day2: Calendar,
    overall: BarChart3,
    products: Boxes,
    infographic: PieChart,
    logo: Compass,
    generalPhoto: Camera,
    publish: FileCheck
  };

  return (
    <main className="workspace">
      {/* Top Breadcrumb Steps indicator */}
      <div className="breadcrumbs-steps">
        {analyticsBlocks.map((block, idx) => {
          const isEnabled = enabledBlocks.has(block.id);
          const className = isEnabled ? "completed-step" : "";
          return (
            <span key={block.id} className={className}>
              {block.title}
              {idx < analyticsBlocks.length - 1 && <span className="divider">&gt;</span>}
            </span>
          );
        })}
      </div>

      <section className="toolbar">
        <div>
          <div className="eyebrow">Аналитическая платформа</div>
          <h1>Конструктор сценария</h1>
        </div>
      </section>

      <section className="analytics-layout">
        <div className="builder-grid">
          {analyticsBlocks.map((block) => {
            const enabled = enabledBlocks.has(block.id);
            const disabled = !enabled && isBlockDisabled(block.id);
            const Icon = blockIcons[block.id];
            return (
              <button
                className={cx("builder-block", enabled && "enabled")}
                disabled={disabled}
                key={block.id}
                title={disabled ? "Сначала выберите предыдущие этапы" : undefined}
                onClick={() => handleBlockToggle(block.id)}
              >
                <span className="block-marker">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{block.title}</strong>
                  <small>{blockCardDetails(block.id) || block.description.slice(0, 48)}</small>
                </div>
              </button>
            );
          })}
        </div>

        {/* Date Selector Row & Main Action Buttons */}
        <div className="date-controls">
          {hasDay1Block ? (
            <div className="session-select-area">
              <button className="session-select-trigger" disabled={isLoadingAvailability} onClick={() => setIsSessionPickerOpen((open) => !open)}>
                <span>
                  <strong>День 1</strong>
                  <small>{currentSession ? `${formatDate(currentSession.date)} · ${currentSession.day1In}/${currentSession.day1Out}` : "Выбрать дату"}</small>
                </span>
                {isLoadingAvailability ? <Loader2 className="spin" size={18} /> : <ChevronDown size={18} />}
              </button>
              {isSessionPickerOpen ? (
                <div className="session-popover">
                  {sessionOptions.length ? (
                    sessionOptions.map((session) => (
                      <button
                        className={cx("session-row", selectedSession === session.id && "selected")}
                        key={session.id}
                        onClick={() => {
                          setSelectedSession(session.id);
                          setIsSessionPickerOpen(false);
                          setRunResult(null);
                          setHasRunStarted(false);
                        }}
                      >
                        <span>{formatDate(session.date)}</span>
                        <small>День 1: {session.day1In}/{session.day1Out}</small>
                      </button>
                    ))
                  ) : (
                    <div className="loading-line">Даты не загрузились</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasDay2Block ? (
            <div className="session-select-area">
              <button className="session-select-trigger" disabled={isLoadingAvailability} onClick={() => setIsDay2PickerOpen((open) => !open)}>
                <span>
                  <strong>День 2</strong>
                  <small>{currentDay2Session ? `${formatDate(currentDay2Session.date)} · ${currentDay2Session.count} ответов` : "Выбрать дату"}</small>
                </span>
                {isLoadingAvailability ? <Loader2 className="spin" size={18} /> : <ChevronDown size={18} />}
              </button>
              {isDay2PickerOpen ? (
                <div className="session-popover">
                  {day2Availability.length ? (
                    day2Availability.map((session) => (
                      <button
                        className={cx("session-row", selectedDay2Date === session.date && "selected")}
                        key={session.date}
                        onClick={() => {
                          setSelectedDay2Date(session.date);
                          setIsDay2PickerOpen(false);
                          setRunResult(null);
                          setHasRunStarted(false);
                        }}
                      >
                        <span>{formatDate(session.date)}</span>
                        <small>День 2: {session.count} ответов</small>
                      </button>
                    ))
                  ) : (
                    <div className="loading-line">Даты Дня 2 не загрузились</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <button className="icon-button refresh-button" aria-label="Обновить данные Yandex Forms" disabled={isLoadingAvailability} onClick={() => void loadAvailability()}>
            <RefreshCw className={cx(isLoadingAvailability && "spin")} size={18} />
          </button>
          <button className="icon-button refresh-button" aria-label="Посчитать NPS" disabled={(!hasDay1Block && !hasDay2Block) || isCalculatingNps} onClick={() => void handleNpsClick()}>
            {isCalculatingNps ? <Loader2 className="spin" size={18} /> : <Gauge size={18} />}
          </button>
          {selectedBlocks.length ? (
            <button className="primary-button run-inline-button" disabled={isRunning || !canRun} onClick={handleRunClick}>
              {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              {isRunning ? "Запуск" : "Запустить"}
            </button>
          ) : null}
        </div>

        {/* Calculated NPS Visual Cards */}
        {npsData && npsData.results && npsData.results.filter(res => res.total > 0).length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginBottom: "20px" }}>
            {npsData.results.filter(res => res.total > 0).map((res: NpsBucketResult, idx: number) => (
              <div key={idx} className="panel" style={{ margin: 0, padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{res.label} ({formatDate(res.date)})</h3>
                  <span className="status-pill tone-success" style={{ fontSize: "10px", padding: "2px 8px" }}>Расчет выполнен</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "16px", alignItems: "center" }}>
                  <div style={{ textAlign: "center", borderRight: "1px solid var(--line)", paddingRight: "12px" }}>
                    <div style={{ fontSize: "32px", fontWeight: 800, color: res.nps >= 0 ? "var(--green)" : "var(--red)" }}>
                      {res.nps >= 0 ? `+${res.nps}` : res.nps}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600, marginTop: "2px" }}>
                      Индекс лояльности (NPS)
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text)", fontWeight: 700, marginTop: "6px" }}>
                      Всего ответов: {res.total}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", height: "8px", borderRadius: "99px", overflow: "hidden", marginBottom: "10px" }}>
                      <div style={{ width: `${res.total > 0 ? (res.promoters / res.total) * 100 : 0}%`, background: "var(--green)" }} title="Промоутеры" />
                      <div style={{ width: `${res.total > 0 ? (res.passives / res.total) * 100 : 0}%`, background: "var(--yellow)" }} title="Нейтральные" />
                      <div style={{ width: `${res.total > 0 ? (res.detractors / res.total) * 100 : 0}%`, background: "var(--red)" }} title="Критики" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "10px" }}>
                      <div>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)", marginRight: "6px" }} />
                        <strong>Промоутеры:</strong> {res.promoters} ({res.total > 0 ? Math.round((res.promoters / res.total) * 100) : 0}%)
                      </div>
                      <div>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--yellow)", marginRight: "6px" }} />
                        <strong>Нейтралы:</strong> {res.passives} ({res.total > 0 ? Math.round((res.passives / res.total) * 100) : 0}%)
                      </div>
                      <div>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--red)", marginRight: "6px" }} />
                        <strong>Критики:</strong> {res.detractors} ({res.total > 0 ? Math.round((res.detractors / res.total) * 100) : 0}%)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : npsResult ? (
          <div className="inline-result">
            <CheckCircle2 size={18} />
            <span>{npsResult}</span>
          </div>
        ) : null}

        {/* Material Upload blocks */}
        {hasAssetUploads ? (
          <div>
            <h3>Загрузите материалы</h3>
            <div className="asset-upload-grid">
              {enabledBlocks.has("products") && (
                <label>
                  <span>Результаты сессии (DOCX)</span>
                  <span className="upload-btn-mock">
                    <Download size={14} /> Выбрать файл
                  </span>
                  <input multiple type="file" onChange={(event) => handleAssetChange("products", event.target.files)} />
                  <small>{assetFiles.products?.join(", ") || "Файл не выбран"}</small>
                </label>
              )}

              {enabledBlocks.has("logo") && (
                <label>
                  <span>Логотип сессии</span>
                  <span className="upload-btn-mock">
                    <Download size={14} /> Выбрать файл
                  </span>
                  <input accept="image/*" type="file" onChange={(event) => handleAssetChange("logo", event.target.files)} />
                  <small>{assetFiles.logo?.join(", ") || "Файл не выбран"}</small>
                </label>
              )}

              {enabledBlocks.has("generalPhoto") && (
                <label>
                  <span>Общая фото участников</span>
                  <span className="upload-btn-mock">
                    <Download size={14} /> Выбрать файл
                  </span>
                  <input accept="image/*" type="file" onChange={(event) => handleAssetChange("generalPhoto", event.target.files)} />
                  <small>{assetFiles.generalPhoto?.join(", ") || "Файл не выбран"}</small>
                </label>
              )}
            </div>
          </div>
        ) : null}

        {/* Progress track panel */}
        {hasRunStarted ? (
          <section className="execution-panel panel">
            <div className="panel-head">
              <h2>Ход выполнения</h2>
              <span className="muted">{selectedFlowText}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              {runSteps.map((step) => {
                const isStepSucceeded = step.status === "succeeded";
                const hasReport = step.id === "infographic"
                  ? Boolean(runResult?.infographicImageUrl)
                  : Boolean(runResult?.stageReports?.[step.id as AnalyticsBlockId]);
                
                return (
                  <div 
                    key={step.id} 
                    className={cx("graph-node", `node-${step.status}`)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <StepIcon status={step.status} />
                      <div>
                        <strong style={{ fontSize: "14px", fontWeight: 700 }}>{step.title}</strong>
                        <span style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", display: "block" }}>
                          {step.description}
                        </span>
                      </div>
                    </div>
                    {isStepSucceeded && hasReport && (
                      step.id === "infographic" ? (
                        <a 
                          href={runResult?.infographicImageUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="secondary-button" 
                          style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                        >
                          <Download size={14} />
                          Открыть инфографику
                        </a>
                      ) : (
                        <button 
                          className="secondary-button" 
                          style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                          onClick={() => handleDownloadResult({ id: step.id as AnalyticsBlockId, title: step.title })}
                        >
                          <Download size={14} />
                          Скачать DOCX
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Generate results banner */}
        {runResult ? (
          <div className={cx("run-result", runResult.status === "error" && "error", runResult.status === "ready" && "success")}>
            <strong>{runResult.status === "ready" ? "Запуск выполнен" : runResult.status === "no_data" ? "Нет данных" : "Ошибка запуска"}</strong>
            <span>{runResult.message}</span>
            {runResult.stats ? (
              <small>
                Входных: {runResult.stats.inputCount} · Выходных: {runResult.stats.outputCount}
                {typeof runResult.stats.day2Count === "number" ? ` · День 2: ${runResult.stats.day2Count}` : ""}
              </small>
            ) : null}
          </div>
        ) : null}

        {/* Graphic display of Infographic if ready */}
        {runResult?.infographicImageUrl && (
          <div className="panel" style={{ marginTop: "20px", padding: "20px" }}>
            <div className="panel-head">
              <h2>Сгенерированная инфографика (Модель: Image-2)</h2>
              <span className="status-pill tone-success">Готово</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", background: "#f8fafc", borderRadius: "var(--border-radius)", padding: "16px", border: "1px solid var(--line)" }}>
              <img 
                src={runResult.infographicImageUrl} 
                style={{ maxWidth: "100%", maxHeight: "500px", borderRadius: "8px", boxShadow: "var(--shadow-lg)", objectFit: "contain" }} 
                alt="Инфографика" 
              />
            </div>
          </div>
        )}

        {/* Footer summary trace */}
        <div className="selected-flow">
          <div>
            <strong>Выбрано блоков: {selectedBlocks.length}</strong>
            <span>{selectedFlowText}</span>
          </div>
          <Workflow size={22} />
        </div>
      </section>
    </main>
  );
}

function ProtocolsView({ activeRun, setActiveRun }: { activeRun: ProcessRun; setActiveRun: Dispatch<SetStateAction<ProcessRun>> }) {
  const [selectedProtocol, setSelectedProtocol] = useState(sampleProtocols[0]?.id ?? "");
  const protocol = sampleProtocols.find((item) => item.id === selectedProtocol) ?? sampleProtocols[0];

  const handleRegenerate = () => {
    setActiveRun({
      ...activeRun,
      status: "running",
      progress: 60,
      steps: activeRun.steps.map(s => {
        if (s.id === "source" || s.id === "extract") return { ...s, status: "succeeded" as const };
        if (s.id === "draft") return { ...s, status: "running" as const };
        return { ...s, status: "pending" as const };
      })
    });
  };

  const handlePublish = () => {
    setActiveRun({
      ...activeRun,
      status: "succeeded",
      progress: 100,
      steps: activeRun.steps.map(s => ({ ...s, status: "succeeded" as const }))
    });
  };

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Инструмент протоколов</div>
          <h1>Инструмент подготовки протоколов</h1>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={handleRegenerate}>
            <RefreshCw size={17} />
            Пересобрать черновик
          </button>
          <button className="primary-button" onClick={handlePublish}>
            <ArrowUpRight size={17} />
            Опубликовать
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
            <StatusPill status={activeRun.status} />
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
          <ProcessGraph steps={activeRun.steps} />
          <RunSummary run={activeRun} />
        </aside>
      </section>
    </main>
  );
}

function RunsView({ analyticsRun, protocolRun }: { analyticsRun: ProcessRun; protocolRun: ProcessRun }) {
  const runs = [analyticsRun, protocolRun];
  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Общая платформа</div>
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
          <div className="eyebrow">Публикации Outline</div>
          <h1>Документы</h1>
        </div>
      </section>
      <section className="documents-grid">
        {[
          ["Аналитическая записка", "Аналитическая записка День 1", "черновик"],
          ["NPS отчет", "NPS отчет", "создано"],
          ["Протокол", "Протокол встречи", "опубликовано"]
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

function PromptsView({
  promptSettings,
  setPromptSettings
}: {
  promptSettings: Record<AnalyticsBlockId, string>;
  setPromptSettings: Dispatch<SetStateAction<Record<AnalyticsBlockId, string>>>;
}) {
  const [activeTab, setActiveTab] = useState<AnalyticsBlockId>("day1");
  const [isSaved, setIsSaved] = useState(false);
  const [localPrompts, setLocalPrompts] = useState(promptSettings);

  useEffect(() => {
    setLocalPrompts(promptSettings);
  }, [promptSettings]);

  async function handleSave() {
    setPromptSettings(localPrompts);
    const response = await fetch("/api/settings/prompts", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompts: localPrompts })
    });

    if (response.ok) {
      setIsSaved(true);
      window.setTimeout(() => setIsSaved(false), 1800);
    }
  }

  async function handleReset() {
    const next = { ...promptDefaults };
    setLocalPrompts(next);
    setPromptSettings(next);
    const response = await fetch("/api/settings/prompts", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompts: next })
    });

    if (response.ok) {
      setIsSaved(true);
      window.setTimeout(() => setIsSaved(false), 1800);
    }
  }

  const activeBlock = analyticsBlocks.find((b) => b.id === activeTab) ?? analyticsBlocks[0];

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Управление промптами</div>
          <h1>Настройка промптов</h1>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={handleReset}>
            <RefreshCw size={17} />
            Сбросить все
          </button>
          <button className="primary-button" onClick={handleSave}>
            <Save size={17} />
            {isSaved ? "Сохранено" : "Сохранить"}
          </button>
        </div>
      </section>

      <section className="three-column" style={{ gridTemplateColumns: "220px minmax(0, 1fr)" }}>
        {/* Left inner tab selector */}
        <div className="panel" style={{ display: "grid", gap: "6px", alignContent: "start", padding: "12px" }}>
          {analyticsBlocks.filter((block) => isPromptBlock(block.id)).map((block) => (
            <button
              key={block.id}
              className={cx("session-row", activeTab === block.id && "selected")}
              style={{ padding: "10px", fontSize: "13px" }}
              onClick={() => setActiveTab(block.id)}
            >
              <span>{block.title}</span>
            </button>
          ))}
        </div>

        {/* Right prompt editor */}
        <div className="panel">
          <div className="panel-head">
            <h2>Шаблон: {activeBlock.title}</h2>
            <span className="muted">{activeBlock.description}</span>
          </div>
          <div className="prompt-grid">
            <label>
              <span>Текст промпта сценария</span>
              <textarea
                style={{
                  minHeight: "320px",
                  width: "100%",
                  padding: "14px",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--border-radius)",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  resize: "vertical"
                }}
                value={localPrompts[activeTab]}
                onChange={(event) =>
                  setLocalPrompts((current) => ({
                    ...current,
                    [activeTab]: event.target.value
                  }))
                }
              />
            </label>
          </div>
        </div>
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
          <div className="eyebrow">Общая платформа</div>
          <h1>Настройки и интеграции</h1>
        </div>
      </section>
      <section className="platform-grid">
        {platformLayers.map((layer) => {
          const Icon = layer.icon;
          return (
            <article className="platform-card" key={layer.title}>
              <Icon size={20} />
              <div>
                <strong>{layer.title}</strong>
                <span>{layer.text}</span>
              </div>
            </article>
          );
        })}
      </section>
      <section className="panel settings-panel">
        <h2>Статус подключений</h2>
        <div className="namespace-grid">
          {[
            ["Яндекс Формы", status?.yandexForms],
            ["ИИ-провайдер (LLM)", status?.llm],
            ["Сервис Outline", status?.outline],
            ["Генератор изображений", status?.imageService],
            ["Локальное хранилище", status?.storage]
          ].map(([label, connected]) => (
            <div className={cx("integration-status", connected === true && "connected", connected === false && "missing")} key={String(label)}>
              <strong>{label}</strong>
              <em>{connected === undefined ? "Проверка" : connected ? "Подключено" : "Не настроено"}</em>
            </div>
          ))}
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>Prompt namespaces</h2>
        <div className="namespace-grid">
          <span>analytics.day1</span>
          <span>analytics.day2</span>
          <span>analytics.overall</span>
          <span>analytics.products</span>
          <span>analytics.infographic</span>
          <span>analytics.publish</span>
          <span>protocol.meeting</span>
          <span>protocol.session</span>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<"analytics" | "protocols">("analytics");
  const [section, setSection] = useState<Section>("analytics");
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [promptSettings, setPromptSettings] = useState<Record<AnalyticsBlockId, string>>(promptDefaults);
  const [activeAnalyticsRun, setActiveAnalyticsRun] = useState<ProcessRun>(latestAnalyticsRun);
  const [activeProtocolRun, setActiveProtocolRun] = useState<ProcessRun>(latestProtocolRun);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const auth = localStorage.getItem("authenticated");
    if (auth === "true") {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUser === "admin" && loginPass === "a12345") {
      localStorage.setItem("authenticated", "true");
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("Неверный логин или пароль");
    }
  };

  // Load custom saved prompts on start
  useEffect(() => {
    let mounted = true;
    async function loadPrompts() {
      const response = await fetch("/api/settings/prompts");
      const data = (await response.json()) as { prompts?: Partial<Record<AnalyticsBlockId, string>> };
      if (mounted) {
        setPromptSettings({
          ...promptDefaults,
          ...data.prompts
        });
      }
    }
    void loadPrompts();
    return () => {
      mounted = false;
    };
  }, []);

  const activeView = useMemo(() => {
    if (section === "protocols") {
      return <ProtocolsView activeRun={activeProtocolRun} setActiveRun={setActiveProtocolRun} />;
    }
    if (section === "runs") {
      return <RunsView analyticsRun={activeAnalyticsRun} protocolRun={activeProtocolRun} />;
    }
    if (section === "documents") {
      return <DocumentsView />;
    }
    if (section === "settings") {
      return <SettingsView />;
    }
    if (section === "prompts") {
      return <PromptsView promptSettings={promptSettings} setPromptSettings={setPromptSettings} />;
    }
    return <AnalyticsView promptSettings={promptSettings} activeRun={activeAnalyticsRun} setActiveRun={setActiveAnalyticsRun} />;
  }, [promptSettings, section, activeAnalyticsRun, activeProtocolRun]);

  const toggleWorkspace = () => {
    if (workspace === "analytics") {
      setWorkspace("protocols");
      setSection("protocols");
    } else {
      setWorkspace("analytics");
      setSection("analytics");
    }
  };

  if (isAuthenticated === null) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <div className="login-logo">
            <img src="/logo.png" alt="РСК Логотип" />
          </div>
          <h2>Вход в систему</h2>
          <p>Авторизуйтесь для доступа к платформе инструментов</p>
          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Логин</span>
              <input 
                type="text" 
                value={loginUser} 
                onChange={(e) => setLoginUser(e.target.value)} 
                placeholder="Введите логин"
                required
              />
            </label>
            <label style={{ marginTop: "12px" }}>
              <span>Пароль</span>
              <input 
                type="password" 
                value={loginPass} 
                onChange={(e) => setLoginPass(e.target.value)} 
                placeholder="Введите пароль"
                required
              />
            </label>
            {loginError && <div className="login-error" style={{ marginTop: "12px" }}>{loginError}</div>}
            <button className="login-button" type="submit">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("app-shell", isRailCollapsed && "rail-collapsed")}>
      <aside className="left-rail">
        {/* Brand Area Switcher Workspace */}
        <div className="brand" onClick={toggleWorkspace} style={{ cursor: "pointer" }} title="Нажмите для переключения воркспейса">
          <img src="/logo.png" style={{ height: "24px", maxWidth: "100%", objectFit: "contain" }} alt="Логотип РСК" />
          <div className="brand-copy">
            <strong>{workspace === "analytics" ? "Аналитика" : "Протоколы"}</strong>
            <span>платформа инструментов</span>
          </div>
          <ChevronDown size={14} style={{ marginLeft: "auto", opacity: 0.7 }} />
        </div>

        <nav>
          {workspace === "analytics" ? (
            <>
              <button className={cx(section === "analytics" && "active")} onClick={() => setSection("analytics")} title="Конструктор сценария">
                <LayoutDashboard size={18} />
                <span>Конструктор сценария</span>
              </button>
              <button className={cx(section === "prompts" && "active")} onClick={() => setSection("prompts")} title="Настройки промптов">
                <Sparkles size={18} />
                <span>Настройки промптов</span>
              </button>
            </>
          ) : (
            <>
              <button className={cx(section === "protocols" && "active")} onClick={() => setSection("protocols")} title="Протоколы">
                <ClipboardList size={18} />
                <span>Протоколы</span>
              </button>
              <button className={cx(section === "runs" && "active")} onClick={() => setSection("runs")} title="Запуски">
                <Activity size={18} />
                <span>Запуски</span>
              </button>
              <button className={cx(section === "documents" && "active")} onClick={() => setSection("documents")} title="Документы">
                <FileText size={18} />
                <span>Документы</span>
              </button>
            </>
          )}
        </nav>

        {/* Collapse rail toggle */}
        <button
          className="rail-toggle"
          style={{ marginTop: "auto" }}
          aria-label={isRailCollapsed ? "Показать боковую панель" : "Скрыть боковую панель"}
          onClick={() => setIsRailCollapsed((collapsed) => !collapsed)}
        >
          {isRailCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </aside>

      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh", overflow: "hidden" }}>
        {/* Top Header Bar */}
        <header style={{ 
          display: "flex", 
          justifyContent: "flex-end", 
          alignItems: "center", 
          height: "56px", 
          padding: "0 24px", 
          borderBottom: "1px solid var(--line)", 
          background: "var(--panel)",
          flexShrink: 0
        }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="icon-button" style={{ border: "none", height: "36px", width: "36px" }} onClick={() => setTheme(t => t === "light" ? "dark" : "light")} title="Переключить тему">
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="icon-button" style={{ border: "none", height: "36px", width: "36px" }} title="Профиль">
              <User size={18} />
            </button>
          </div>
        </header>

        {/* Scrollable Workspace View */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {activeView}
        </div>
      </div>

      {/* Floating Action Button settings (fab-settings) */}
      <button className="fab-settings" title="Настройки платформы" onClick={() => setSection("settings")}>
        <Settings size={20} />
      </button>
    </div>
  );
}
