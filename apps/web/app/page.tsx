"use client";

import {
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
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Play,
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
import { latestProtocolRun, type ProtocolRecord } from "@tools/protocols";
import { type ProcessRun, type ProcessStep } from "@tools/core";

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

const promptDefaults: Record<string, string> = {
  day1: "Проанализируй анкеты обратной связи участников за День 1. Сделай структурированный отчет на русском языке.\nВыдели:\n1. Количество ответов, общий уровень удовлетворенности и индекс NPS.\n2. Топ-3 освоенных инструментов (например: Perplexity, Gamma, Suno).\n3. Качественные показатели изменения отношения к ИИ (в процентах и долях).\n4. Качественные эффекты: преодоление страха (уверенность на входе/выходе), формирование единого понятийного поля, практические результаты внедрения (планы внедрения, автоматизация отчетности).",
  day2: "Проанализируй анкеты обратной связи участников за День 2.\nСфокусируйся на динамике по сравнению с Днем 1:\n1. Сравнительные метрики NPS и удовлетворенности.\n2. Изменение уверенности при работе с ИИ, командная согласованность.\n3. Новые изученные сценарии и продвинутые инструменты.",
  overall: "Синтезируй результаты первого и второго дня стратегической сессии в единую аналитическую справку на русском языке.\nСобери все ключевые метрики (NPS по дням, командная согласованность, рост числа освоенных инструментов).\nОпиши качественные эффекты (преодоление барьеров, командная синергия, практические планы).",
  products: "Проанализируй предложенные на сессии концепции цифровых продуктов.\nДля каждого продукта опиши:\n- Название и суть концепции (например: ИИ-генератор контента, Система ИИ-модерации, Бот-тренажер).\n- Решаемую проблему и практическую ценность.\n- Как продукт автоматизирует работу и повышает эффективность.",
  infographic: "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.\nРазметка должна строго соответствовать следующей структуре:\n\nЗАГОЛОВОК (ВЕРХНИЙ КОЛОНТИТУЛ):\nТренажёр «МАЯК» | ИИ-грамотность для органов власти [Даты сессии, Город]\n\nЛЕВАЯ КОЛОНКА: ЗАДАЧИ И МЕТРИКИ\nЭффективность программы:\n• NPS День 1: [Значение]\n• NPS День 2: [Значение]\n• Командная согласованность: [Оценка]/10\n• Рост числа инструментов: [На входе] → [На выходе] (+[Разница] за день)\n\nПРАВАЯ КОЛОНКА (ИЛИ НИЖНИЙ БЛОК): КОМПЕТЕНЦИИ И ИНСАЙТЫ\nКОМПЕТЕНЦИИ И НАВЫКИ (Уровень владения ИИ):\n• На входе: [Оценка]/10\n• На выходе: [Оценка]/10 (Рост уверенности в [Коэффициент] раза)\n\nТоп-3 инструментария (Лидеры освоения):\n1. Аналитика и Данные: [Инструмент 1]\n2. Визуал и Презентации: [Инструмент 2]\n3. Креатив и Аудио: [Инструмент 3]\n\nКАЧЕСТВЕННЫЕ ПОКАЗАТЕЛИ (Изменение отношения к ИИ):\n• Кардинально изменилось (Увидели огромный потенциал): [Процент]% ([Доля])\n• Дополнилось (Увидели новые сценарии): [Процент]% ([Доля])\n\nКачественные эффекты:\n• Преодоление страха: [Краткое описание эффекта и количества инструментов].\n• Командная синергия: [Описание формирования единого понятийного поля].\n• Практический результат: [Описание конкретных планов внедрения и автоматизации отчетов].\n\nВизуальное оформление: указать место для логотипа и общего фото участников, цветовой стиль адаптировать под цвета логотипа.",
  logo: "",
  generalPhoto: "",
  publish: "",
  "protocol.meeting": "Проанализируй стенограмму или заметки встречи. Сформируй структурированный протокол на русском языке.\nВыдели и подробно распиши следующие разделы:\n- Тема (Краткое резюме сути обсуждения)\n- Повестка (Список обсуждавшихся вопросов)\n- Основные тезисы (Ключевые аргументы, идеи и обсуждения)\n- Решения (Список утвержденных решений)\n- Задачи (Список конкретных поручений)\n- Ответственные (Кто выполняет задачи)\n- Сроки (Дедлайны для каждой задачи)\n- Риски (Выявленные угрозы или неопределенности)\n- Приложения (Документы, ссылки или дополнительные материалы)",
  "protocol.session": "Проанализируй результаты рабочей сессии. Выдели ключевые решения, задачи, ответственных лиц, сроки, а также основные риски и приложения.",
  "protocol.transcript": "Сделай дословную и максимально точную транскрибацию этого аудиофайла на русском языке, обязательно разделяя текст по спикерам (диаризация по голосам). Форматируй текст в виде диалога, указывая спикеров, например:\nСпикер 1: [реплика спикера]\nСпикер 2: [реплика спикера]\nИ так далее. Внимательно следи за сменой голосов. Запиши только произнесенный текст встречи, не добавляй от себя никаких комментариев, резюме или вводных фраз."
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


function StepIcon({ status }: { status: ProcessStep["status"] }) {
  if (status === "succeeded") {
    return <CheckCircle2 size={16} />;
  }
  if (status === "running" || status === "retrying") {
    return <Loader2 className="spin" size={16} />;
  }
  return <CircleDashed size={16} />;
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

function ProtocolsView({
  activeRun,
  setActiveRun,
  promptSettings
}: {
  activeRun: ProcessRun;
  setActiveRun: Dispatch<SetStateAction<ProcessRun>>;
  promptSettings: Record<string, string>;
}) {
  const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewTab, setPreviewTab] = useState<"protocol" | "transcript">("protocol");

  const [chunksCount, setChunksCount] = useState<number | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState<string>("");
  const [extractingProgressText, setExtractingProgressText] = useState("Инициализация анализа текста...");

  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [runSteps, setRunSteps] = useState<Array<{
    id: string;
    title: string;
    description: string;
    status: "pending" | "running" | "succeeded" | "failed";
  }>>([]);

  useEffect(() => {
    async function loadProtocols() {
      try {
        const res = await fetch("/api/protocols");
        const data = await res.json();
        let list = data.protocols || [];
        if (list.length === 0) {
          const defaultProto = {
            id: "default-protocol",
            title: "Новый протокол встречи",
            date: new Date().toISOString().substring(0, 10),
            status: "draft" as const,
            participants: ["Администратор"],
            actionItems: 0,
            decisions: 0,
            transcript: "",
            theme: "",
            agenda: "",
            keyPoints: "",
            decisionsText: "",
            tasksText: "",
            responsible: "",
            deadlines: "",
            risks: "",
            attachments: ""
          };
          list = [defaultProto];
          await fetch("/api/protocols", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ protocols: list })
          });
        }
        setProtocols(list);
        setSelectedProtocolId(list[0]?.id || "default-protocol");
      } catch (err) {
        console.error("Failed to load protocols:", err);
      }
    }
    void loadProtocols();
  }, []);

  const saveProtocols = async (updatedList: ProtocolRecord[]) => {
    try {
      await fetch("/api/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocols: updatedList })
      });
    } catch (err) {
      console.error("Failed to save protocols:", err);
    }
  };

  const protocol = protocols.find((item) => item.id === selectedProtocolId);

  // Sync run steps from existing protocol data or selected file
  useEffect(() => {
    if (protocol) {
      const hasTranscript = Boolean(protocol.transcript && protocol.transcript.trim());
      const hasProtocol = Boolean(protocol.theme && protocol.theme.trim());

      if (isGenerating) {
        return;
      }

      if (hasTranscript || hasProtocol) {
        setHasRunStarted(true);
        setRunSteps([
          { id: "split", title: "Разбивка файла", description: "Файл успешно подготовлен и разбит на сегменты", status: "succeeded" },
          { id: "transcribe", title: "Подготовка стенограммы", description: hasTranscript ? "Стенограмма успешно подготовлена" : "Ожидание подготовки...", status: hasTranscript ? "succeeded" : "pending" },
          { id: "extract", title: "Подготовка протокола", description: hasProtocol ? "Протокол встречи подготовлен" : "Ожидание подготовки...", status: hasProtocol ? "succeeded" : "pending" }
        ]);
      } else if (selectedFile) {
        setHasRunStarted(true);
        const partsText = chunksCount !== null ? `Определено частей: ${chunksCount}. Готов к запуску` : "Определение частей...";
        setRunSteps([
          { id: "split", title: "Разбивка файла", description: partsText, status: "pending" },
          { id: "transcribe", title: "Подготовка стенограммы", description: "Ожидание запуска", status: "pending" },
          { id: "extract", title: "Подготовка протокола", description: "Ожидание запуска", status: "pending" }
        ]);
      } else {
        setHasRunStarted(false);
        setRunSteps([]);
      }
    }
  }, [selectedProtocolId, protocol, selectedFile, chunksCount, isGenerating]);

  // Rotator of AI phases during extraction
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isGenerating && currentStage === "extract") {
      const phrases = [
        "Анализируем структуру стенограммы...",
        "Выделяем ключевые темы обсуждения...",
        "Определяем список принятых решений...",
        "Формулируем задачи и поручения...",
        "Составляем список ответственных лиц...",
        "Определяем сроки и дедлайны...",
        "Анализируем потенциальные риски...",
        "Генерируем финальный структурированный протокол...",
        "Завершаем оформление документа..."
      ];
      let idx = 0;
      setExtractingProgressText(phrases[0]);
      timer = setInterval(() => {
        idx = (idx + 1) % phrases.length;
        setExtractingProgressText(phrases[idx]);
      }, 5000);
    } else {
      setExtractingProgressText("Инициализация анализа текста...");
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating, currentStage]);

  const handleFileSelect = (file: File | null) => {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      setChunksCount(null);
      setMediaDuration(null);
      return;
    }

    setSelectedFile(file);
    setChunksCount(null);
    setMediaDuration(null);

    const objectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video");
    const media = document.createElement(isVideo ? "video" : "audio");
    media.src = objectUrl;

    media.onloadedmetadata = () => {
      const duration = media.duration;
      if (duration && !isNaN(duration)) {
        setMediaDuration(duration);
        const count = Math.ceil(duration / 600); // 10 минут = 600 секунд
        setChunksCount(count);
      } else {
        setChunksCount(1);
      }
      URL.revokeObjectURL(objectUrl);
    };

    media.onerror = () => {
      setChunksCount(1);
      URL.revokeObjectURL(objectUrl);
    };
  };

  const handleFieldChange = (fieldKey: keyof ProtocolRecord, value: string) => {
    const updated = protocols.map((item) => {
      if (item.id === selectedProtocolId) {
        const updatedItem = { ...item };
        if (fieldKey === "participants") {
          updatedItem.participants = value.split(",").map((p) => p.trim()).filter(Boolean);
        } else {
          Object.assign(updatedItem, { [fieldKey]: value });
        }

        if (fieldKey === "decisionsText") {
          const lines = value.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0);
          updatedItem.decisions = lines.length;
        }
        if (fieldKey === "tasksText") {
          const lines = value.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0);
          updatedItem.actionItems = lines.length;
        }

        return updatedItem;
      }
      return item;
    });
    setProtocols(updated);
    void saveProtocols(updated);
  };

  const handleRegenerate = async () => {
    if (!protocol) return;

    if (!selectedFile) {
      alert("Файл не выбран. Пожалуйста, выберите аудио или видео файл.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgressMessage("Подготовка файла...");
    setUploadProgress(5);
    setPreviewTab("transcript");
    setHasRunStarted(true);

    const partsCount = chunksCount || 1;
    setRunSteps([
      { id: "split", title: "Разбивка файла", description: "Сохранение и конвертация файла...", status: "running" },
      { id: "transcribe", title: "Подготовка стенограммы", description: `Ожидание распознавания речи (${partsCount} частей)...`, status: "pending" },
      { id: "extract", title: "Подготовка протокола", description: "Ожидание выделения структуры...", status: "pending" }
    ]);

    setProtocols((prevProtocols) => prevProtocols.map((item) => {
      if (item.id === protocol.id) {
        return {
          ...item,
          transcript: "",
          theme: "",
          agenda: "",
          keyPoints: "",
          decisionsText: "",
          tasksText: "",
          responsible: "",
          deadlines: "",
          risks: "",
          attachments: "",
          decisions: 0,
          actionItems: 0,
          status: "draft"
        };
      }
      return item;
    }));

    setActiveRun({
      ...activeRun,
      status: "running",
      progress: 5,
      steps: activeRun.steps.map((s) => {
        if (s.id === "source") return { ...s, status: "running" as const, description: "Загрузка файла на сервер..." };
        return { ...s, status: "pending" as const };
      })
    });

    try {
      const promptText = promptSettings["protocol.meeting"] || "";
      const transcriptPromptText = promptSettings["protocol.transcript"] || "";
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("protocolId", protocol.id);
      formData.append("prompt", promptText);
      formData.append("transcriptPrompt", transcriptPromptText);

      const response = await fetch("/api/protocols/runs", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Не удалось прочитать поток ответа сервера.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const update = JSON.parse(line);

          if (update.status === "failed") {
            throw new Error(update.message || "Ошибка генерации протокола.");
          }

          if (update.stage) {
            setCurrentStage(update.stage);
          }

          if (update.message) {
            setProgressMessage(update.message);
          }
          if (typeof update.progress === "number") {
            setUploadProgress(update.progress);
          }

          if (update.currentTranscript) {
            setProtocols((prevProtocols) => prevProtocols.map((item) => {
              if (item.id === protocol.id) {
                return {
                  ...item,
                  transcript: update.currentTranscript
                };
              }
              return item;
            }));
          }

          setRunSteps((prevSteps) => {
            return prevSteps.map((step) => {
              if (update.stage === "upload" || update.stage === "convert" || update.stage === "split") {
                if (step.id === "split") {
                  return { ...step, status: "running" as const, description: update.message || "Подготовка и разделение файла..." };
                }
              }
              if (update.stage === "transcribe") {
                if (step.id === "split") {
                  return { ...step, status: "succeeded" as const, description: `Файл успешно подготовлен и разбит на ${partsCount} частей` };
                }
                if (step.id === "transcribe") {
                  return { ...step, status: "running" as const, description: update.message || "Распознавание речи..." };
                }
              }
              if (update.stage === "extract" || update.stage === "save") {
                if (step.id === "split") return { ...step, status: "succeeded" as const, description: `Файл успешно подготовлен и разбит на ${partsCount} частей` };
                if (step.id === "transcribe") return { ...step, status: "succeeded" as const, description: "Стенограмма успешно подготовлена" };
                if (step.id === "extract") {
                  return { ...step, status: "running" as const, description: update.message || "Извлечение ИИ структуры протокола..." };
                }
              }
              return step;
            });
          });

          if (update.stage === "done" && update.extractedData) {
            const ext = update.extractedData;
            const finalTranscript = update.finalTranscript || "";

            const decisionsCount = ext.decisionsText
              ? ext.decisionsText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0).length
              : 0;
            const tasksCount = ext.tasksText
              ? ext.tasksText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l) || l.length > 0).length
              : 0;

            const updated = protocols.map((item) => {
              if (item.id === selectedProtocolId) {
                return {
                  ...item,
                  transcript: finalTranscript,
                  theme: ext.theme || "",
                  agenda: ext.agenda || "",
                  keyPoints: ext.keyPoints || "",
                  decisionsText: ext.decisionsText || "",
                  tasksText: ext.tasksText || "",
                  responsible: ext.responsible || "",
                  deadlines: ext.deadlines || "",
                  risks: ext.risks || "",
                  attachments: ext.attachments || "",
                  decisions: decisionsCount,
                  actionItems: tasksCount,
                  status: "review" as const
                };
              }
              return item;
            });

            setProtocols(updated);
            await saveProtocols(updated);

            setRunSteps([
              { id: "split", title: "Разбивка файла", description: `Файл успешно подготовлен и разбит на ${partsCount} частей`, status: "succeeded" },
              { id: "transcribe", title: "Подготовка стенограммы", description: "Стенограмма успешно подготовлена", status: "succeeded" },
              { id: "extract", title: "Подготовка протокола", description: "Протокол встречи подготовлен", status: "succeeded" }
            ]);

            setSelectedFile(null);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Не удалось сгенерировать протокол.";
      setError(errorMessage);
      setProgressMessage("Ошибка генерации");
      setRunSteps((prevSteps) => prevSteps.map((s) => s.status === "running" ? { ...s, status: "failed" as const, description: "Сбой операции" } : s));
    } finally {
      setIsGenerating(false);
      setUploadProgress(null);
      setCurrentStage("");
    }
  };

  const handleDownloadDocx = async () => {
    if (!protocol) return;

    try {
      const response = await fetch("/api/protocols/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(protocol)
      });

      if (!response.ok) {
        throw new Error("Не удалось сгенерировать DOCX файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${protocol.title.toLowerCase().replace(/\s+/g, "-")}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании файла.");
    }
  };

  const handleDownloadTranscriptDocx = async () => {
    if (!protocol?.transcript) return;

    try {
      const response = await fetch("/api/analytics/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Стенограмма встречи: ${protocol.title || "Новый протокол"}`,
          markdown: protocol.transcript
        })
      });

      if (!response.ok) {
        throw new Error("Не удалось сгенерировать DOCX файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${protocol.title.toLowerCase().replace(/\s+/g, "-")}-transcript.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании файла.");
    }
  };

  return (
    <main className="workspace">
      <section className="toolbar">
        <div>
          <div className="eyebrow">Инструмент протоколов</div>
          <h1>Инструмент подготовки протоколов</h1>
        </div>
      </section>

      {error && (
        <div className="run-result error" style={{ margin: "0 auto 20px auto", width: "100%" }}>
          <strong>Ошибка генерации</strong>
          <span>{error}</span>
        </div>
      )}

      <section style={{ padding: "24px", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
        {protocol ? (
          <div className="panel main-panel" style={{ margin: 0, padding: "24px", width: "100%" }}>
            <div className="panel-head" style={{ marginBottom: "16px" }}>
              <h2>{protocol.title || "Новый протокол встречи"}</h2>
            </div>

            <div className="protocol-editor" style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", paddingRight: "4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label>
                  Название встречи
                  <input
                    value={protocol.title || ""}
                    onChange={(e) => handleFieldChange("title", e.target.value)}
                    placeholder="Заполнить название"
                  />
                </label>
                <label>
                  Дата встречи
                  <input
                    type="date"
                    value={protocol.date || ""}
                    onChange={(e) => handleFieldChange("date", e.target.value)}
                  />
                </label>
              </div>

              {/* Зона загрузки медиафайлов */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                  Загрузка записи встречи
                </span>

                <div 
                  style={{ 
                    border: "2px dashed var(--line)", 
                    borderRadius: "var(--border-radius)",
                    padding: "32px 16px",
                    textAlign: "center",
                    background: "var(--bg)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    position: "relative"
                  }}
                  onClick={() => document.getElementById("audio-video-upload")?.click()}
                >
                  <Download size={36} style={{ color: "var(--muted)", marginBottom: "4px" }} />
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>
                    {selectedFile ? selectedFile.name : "Выберите аудио или видео файл"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {selectedFile 
                      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Нажмите, чтобы заменить` 
                      : "Поддерживаются MP4, AVI, MKV, MP3, WAV, M4A и др."
                    }
                  </span>
                  
                  {selectedFile && (
                    <span style={{ fontSize: "13px", color: "var(--green)", fontWeight: 600, marginTop: "4px" }}>
                      {mediaDuration 
                        ? `Длительность: ${Math.floor(mediaDuration / 60)} мин ${Math.round(mediaDuration % 60)} сек · Разбивка на ${chunksCount} ${chunksCount === 1 ? "часть" : chunksCount && chunksCount < 5 ? "части" : "частей"}`
                        : "Определение длительности файла..."
                      }
                    </span>
                  )}
                  
                  <input 
                    id="audio-video-upload" 
                    type="file" 
                    accept="audio/*,video/*" 
                    style={{ display: "none" }} 
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {/* Кнопка "Запустить" */}
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedFile || isGenerating || chunksCount === null}
                  onClick={handleRegenerate}
                  style={{ 
                    marginTop: "8px",
                    height: "44px", 
                    fontSize: "14px", 
                    fontWeight: 600,
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px",
                    borderRadius: "var(--border-radius)",
                    cursor: (!selectedFile || isGenerating || chunksCount === null) ? "not-allowed" : "pointer",
                    opacity: (!selectedFile || isGenerating || chunksCount === null) ? 0.5 : 1
                  }}
                >
                  <Play size={16} />
                  Запустить
                </button>
                
                {isGenerating && progressMessage && (
                  <div style={{ 
                    background: "var(--bg)", 
                    border: "1px solid var(--line)", 
                    borderRadius: "var(--border-radius)", 
                    padding: "12px 16px",
                    marginTop: "4px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                      <span style={{ fontWeight: 600 }}>{progressMessage}</span>
                      {uploadProgress !== null && <span>{uploadProgress}%</span>}
                    </div>
                    {uploadProgress !== null && (
                      <div style={{ height: "6px", background: "var(--line)", borderRadius: "99px", overflow: "hidden" }}>
                        <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--green)", transition: "width 0.3s ease" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Вкладки превью результатов (перенесены ВЫШЕ хода выполнения) */}
              {(protocol.transcript || isGenerating) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                  <div style={{ display: "flex", borderBottom: "1px solid var(--line)", paddingBottom: "2px", gap: "16px" }}>
                    <button
                      type="button"
                      disabled={isGenerating && previewTab === "protocol"}
                      style={{
                        padding: "8px 4px",
                        background: "transparent",
                        border: "none",
                        borderBottom: previewTab === "protocol" ? "2px solid var(--green)" : "none",
                        color: previewTab === "protocol" ? "var(--text)" : "var(--muted)",
                        fontWeight: previewTab === "protocol" ? 700 : 500,
                        cursor: isGenerating && previewTab === "protocol" ? "not-allowed" : "pointer",
                        opacity: isGenerating && previewTab === "protocol" ? 0.5 : 1,
                        fontSize: "14px"
                      }}
                      onClick={() => setPreviewTab("protocol")}
                    >
                      Превью протокола
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "8px 4px",
                        background: "transparent",
                        border: "none",
                        borderBottom: previewTab === "transcript" ? "2px solid var(--green)" : "none",
                        color: previewTab === "transcript" ? "var(--text)" : "var(--muted)",
                        fontWeight: previewTab === "transcript" ? 700 : 500,
                        cursor: "pointer",
                        fontSize: "14px"
                      }}
                      onClick={() => setPreviewTab("transcript")}
                    >
                      Превью стенограммы {isGenerating && " (распознавание...)"}
                    </button>
                  </div>

                  {previewTab === "protocol" && !isGenerating ? (
                    <div className="protocol-preview" style={{ 
                      padding: "16px", 
                      background: "var(--bg)", 
                      borderRadius: "var(--border-radius)", 
                      border: "1px solid var(--line)", 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: "16px", 
                      fontSize: "14px", 
                      lineHeight: "1.6",
                      maxHeight: "350px",
                      overflowY: "auto"
                    }}>
                      {protocol.theme && (
                        <div>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Тема встречи</strong>
                          <div style={{ color: "var(--muted)" }}>{protocol.theme}</div>
                        </div>
                      )}
                      {protocol.agenda && (
                        <div>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Повестка</strong>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{protocol.agenda}</div>
                        </div>
                      )}
                      {protocol.keyPoints && (
                        <div>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Основные тезисы</strong>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{protocol.keyPoints}</div>
                        </div>
                      )}
                      {protocol.decisionsText && (
                        <div>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Принятые решения</strong>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{protocol.decisionsText}</div>
                        </div>
                      )}
                      {protocol.tasksText && (
                        <div>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Задачи к выполнению</strong>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{protocol.tasksText}</div>
                        </div>
                      )}
                      {(protocol.responsible || protocol.deadlines) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                          {protocol.responsible && (
                            <div>
                              <strong style={{ color: "var(--text)", fontSize: "13px", display: "block" }}>Ответственные</strong>
                              <div style={{ color: "var(--muted)" }}>{protocol.responsible}</div>
                            </div>
                          )}
                          {protocol.deadlines && (
                            <div>
                              <strong style={{ color: "var(--text)", fontSize: "13px", display: "block" }}>Сроки</strong>
                              <div style={{ color: "var(--muted)" }}>{protocol.deadlines}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {protocol.risks && (
                        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                          <strong style={{ color: "var(--text)", fontSize: "14px", display: "block", marginBottom: "4px" }}>Выявленные риски</strong>
                          <div style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{protocol.risks}</div>
                        </div>
                      )}
                      {protocol.attachments && (
                        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                          <strong style={{ color: "var(--text)", fontSize: "13px", display: "block", marginBottom: "4px" }}>Приложения</strong>
                          <div style={{ color: "var(--muted)" }}>{protocol.attachments}</div>
                        </div>
                      )}
                    </div>
                  ) : previewTab === "protocol" && isGenerating ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", background: "var(--bg)", borderRadius: "var(--border-radius)", border: "1px solid var(--line)" }}>
                      <Loader2 className="spin" style={{ margin: "0 auto 12px auto" }} size={24} />
                      <span style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "8px" }}>
                        {extractingProgressText}
                      </span>
                      <span>Протокол будет сгенерирован сразу после завершения распознавания речи.</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: "16px",
                      background: "var(--bg)",
                      borderRadius: "var(--border-radius)",
                      border: "1px solid var(--line)",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      maxHeight: "350px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      color: "var(--muted)",
                      fontFamily: "monospace"
                    }}>
                      {protocol.transcript || (isGenerating ? "Ожидание распознавания первой части..." : "Стенограмма пуста.")}
                    </div>
                  )}
                </div>
              )}

              {/* Ход выполнения (перенесен ниже превью) */}
              {(() => {
                if (!hasRunStarted) return null;
                const visibleSteps = (isGenerating || selectedFile)
                  ? runSteps
                  : runSteps.filter((step) => step.status === "succeeded");
                if (visibleSteps.length === 0) return null;
                return (
                  <section className="execution-panel panel" style={{ marginTop: "8px", padding: "16px 20px" }}>
                    <div className="panel-head" style={{ marginBottom: "16px" }}>
                      <h2 style={{ fontSize: "15px", fontWeight: 700 }}>Ход выполнения</h2>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {visibleSteps.map((step) => {
                        const isStepSucceeded = step.status === "succeeded";
                        return (
                          <div 
                            key={step.id} 
                            className={cx("graph-node", `node-${step.status}`)}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                              <StepIcon status={step.status} />
                              <div>
                                <strong style={{ fontSize: "13px", fontWeight: 700 }}>{step.title}</strong>
                                <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px", display: "block" }}>
                                  {step.description}
                                </span>
                              </div>
                            </div>
                            {isStepSucceeded && (
                              step.id === "transcribe" ? (
                                <button 
                                  type="button"
                                  className="secondary-button" 
                                  style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                  onClick={handleDownloadTranscriptDocx}
                                >
                                  <Download size={12} />
                                  Скачать DOCX
                                </button>
                              ) : step.id === "extract" ? (
                                <button 
                                  type="button"
                                  className="secondary-button" 
                                  style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                  onClick={handleDownloadDocx}
                                >
                                  <Download size={12} />
                                  Скачать DOCX
                                </button>
                              ) : null
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="panel loading-line" style={{ padding: "24px", textAlign: "center" }}>
            Загрузка протокола...
          </div>
        )}
      </section>
    </main>
  );
}


function PromptsView({
  workspace,
  promptSettings,
  setPromptSettings
}: {
  workspace: "analytics" | "protocols";
  promptSettings: Record<string, string>;
  setPromptSettings: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const blocks = useMemo(() => {
    if (workspace === "analytics") {
      return [
        { id: "day1", title: "День 1", description: "Анализ анкет обратной связи участников за День 1" },
        { id: "day2", title: "День 2", description: "Анализ анкет обратной связи участников за День 2" },
        { id: "overall", title: "Синтез (Общий)", description: "Синтез результатов первого и второго дня стратегической сессии" },
        { id: "products", title: "Продукты", description: "Анализ предложенных концепций цифровых продуктов" },
        { id: "infographic", title: "Инфографика", description: "Итоговая разметка для дашборда-инфографики" }
      ];
    } else {
      return [
        { id: "protocol.meeting", title: "Шаблон протокола", description: "Анализ стенограммы встречи и формирование протокола" },
        { id: "protocol.transcript", title: "Шаблон стенограммы", description: "Транскрибация аудиофайла и разделение по спикерам" },
        { id: "protocol.session", title: "Шаблон сессии", description: "Анализ результатов рабочей сессии" }
      ];
    }
  }, [workspace]);

  const [activeTab, setActiveTab] = useState<string>(() => blocks[0].id);
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

  const activeBlock = blocks.find((b) => b.id === activeTab) ?? blocks[0];

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
          {blocks.map((block) => (
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
                value={localPrompts[activeTab] || ""}
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
  const [promptSettings, setPromptSettings] = useState<Record<string, string>>(promptDefaults);
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
      const data = (await response.json()) as { prompts?: Record<string, string> };
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
      return <ProtocolsView activeRun={activeProtocolRun} setActiveRun={setActiveProtocolRun} promptSettings={promptSettings} />;
    }
    if (section === "settings") {
      return <SettingsView />;
    }
    if (section === "prompts") {
      return <PromptsView key={workspace} workspace={workspace} promptSettings={promptSettings} setPromptSettings={setPromptSettings} />;
    }
    return <AnalyticsView promptSettings={promptSettings} activeRun={activeAnalyticsRun} setActiveRun={setActiveAnalyticsRun} />;
  }, [promptSettings, section, activeAnalyticsRun, activeProtocolRun, workspace]);

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
              <button className={cx(section === "prompts" && "active")} onClick={() => setSection("prompts")} title="Настройки промптов">
                <Sparkles size={18} />
                <span>Настройки промптов</span>
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
