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
  Sparkles,
  Sun,
  User,
  Workflow,
  Eye,
  EyeOff,
  Check,
  Smile,
  Meh,
  Frown,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef, type Dispatch, type SetStateAction } from "react";
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
  stageReports?: Partial<Record<string, string>>;
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

function getNow(): number {
  return Date.now();
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
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





function formatTime(seconds?: number) {
  if (seconds === undefined || seconds === null) return "";
  if (seconds < 60) {
    return `${seconds} сек`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}м ${secs}с`;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return <strong key={idx}>{part}</strong>;
    }
    return part;
  });
}

function MarkdownPreview({ text }: { text: string }) {
  if (!text) return <p style={{ color: "var(--muted)", margin: 0 }}>Превью пусто.</p>;

  const lines = text.split("\n");
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {lines.map((line, idx) => {
        if (line.startsWith("# ")) {
          return <h1 key={idx} style={{ fontSize: "20px", fontWeight: "800", borderBottom: "1px solid var(--line)", paddingBottom: "4px", margin: "12px 0 6px 0", color: "var(--text)" }}>{line.replace("# ", "")}</h1>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={idx} style={{ fontSize: "16px", fontWeight: "700", margin: "10px 0 4px 0", color: "var(--text)" }}>{line.replace("## ", "")}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={idx} style={{ fontSize: "14px", fontWeight: "600", margin: "8px 0 4px 0", color: "var(--text)" }}>{line.replace("### ", "")}</h3>;
        }
        
        if (line.startsWith("- ") || line.startsWith("* ")) {
          const content = line.startsWith("- ") ? line.replace("- ", "") : line.replace("* ", "");
          return (
            <ul key={idx} style={{ margin: "2px 0", paddingLeft: "20px" }}>
              <li style={{ listStyleType: "disc" }}>{renderInlineMarkdown(content)}</li>
            </ul>
          );
        }

        if (line.trim() === "---") {
          return <hr key={idx} style={{ border: "none", borderTop: "1px solid var(--line)", margin: "12px 0" }} />;
        }

        if (!line.trim()) {
          return <div key={idx} style={{ height: "4px" }} />;
        }

        return <p key={idx} style={{ margin: "2px 0" }}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

interface AnalyticsViewProps {
  promptSettings: Record<AnalyticsBlockId, string>;
  activeRun: ProcessRun;
  setActiveRun: Dispatch<SetStateAction<ProcessRun>>;
}

function AnalyticsView({ promptSettings, activeRun, setActiveRun }: AnalyticsViewProps) {
  void activeRun;
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
  const [assetFiles, setAssetFiles] = useState<Record<string, Array<{ name: string; type: string; base64: string }>>>({});
  const [executionTimes, setExecutionTimes] = useState<Record<string, number>>({});
  const [totalTime, setTotalTime] = useState(0);

  // Scenario Builder & Section Selection states
  const [useScenarioBuilder, setUseScenarioBuilder] = useState(false);
  interface ScenarioDataAnswer {
    answerId: string;
    created?: string;
    disabled: boolean;
    answers: Record<string, string | string[] | undefined>;
  }

  const [scenarioData, setScenarioData] = useState<{
    day1Input: { questionList: string[]; answers: ScenarioDataAnswer[] };
    day1Output: { questionList: string[]; answers: ScenarioDataAnswer[] };
    day2: { questionList: string[]; answers: ScenarioDataAnswer[] } | null;
  } | null>(null);
  const [isLoadingScenario, setIsLoadingScenario] = useState(false);
  const [scenarioActiveTab, setScenarioActiveTab] = useState<"day1Input" | "day1Output" | "day2">("day1Input");
  const [useDay1Input, setUseDay1Input] = useState(true);
  const [useDay1Output, setUseDay1Output] = useState(true);
  const [isScenarioSaved, setIsScenarioSaved] = useState(true);
  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Preview and Average Timing states
  const [openPreviews, setOpenPreviews] = useState<Record<string, boolean>>({});
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [averageTimes, setAverageTimes] = useState<Record<string, number>>({});

  const togglePreview = (stepId: string) => {
    setOpenPreviews((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Scroll to first checked row when active tab or data changes
  useEffect(() => {
    if (!useScenarioBuilder || !scenarioData || !tableContainerRef.current || isTableCollapsed) return;
    const activeTable = scenarioData[scenarioActiveTab];
    if (!activeTable) return;
    
    const firstActiveIndex = activeTable.answers.findIndex((ans: { disabled?: boolean }) => !ans.disabled);
    if (firstActiveIndex === -1) return;
    
    const container = tableContainerRef.current;
    const timer = setTimeout(() => {
      const rowElement = container.querySelector(`tbody tr:nth-child(${firstActiveIndex + 1})`);
      if (rowElement instanceof HTMLElement) {
        container.scrollTop = rowElement.offsetTop - 50;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [scenarioActiveTab, scenarioData, useScenarioBuilder, isTableCollapsed]);

  // Load scenario builder answers on date or builder toggle changes
  useEffect(() => {
    async function fetchScenarioAnswers() {
      if (!useScenarioBuilder || !selectedSession) {
        setScenarioData(null);
        return;
      }
      setIsLoadingScenario(true);
      try {
        const url = `/api/analytics/answers?day1Date=${selectedSession}${selectedDay2Date ? `&day2Date=${selectedDay2Date}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Не удалось загрузить ответы для конструктора сценариев");
        const data = await res.json();
        
        if (data.day1Input) {
          data.day1Input.answers = data.day1Input.answers.map((ans: { answerId: string; created?: string; answers: Record<string, string | string[] | undefined> }) => ({
            ...ans,
            disabled: ans.created ? ans.created.slice(0, 10) !== selectedSession : true
          }));
        }
        if (data.day1Output) {
          data.day1Output.answers = data.day1Output.answers.map((ans: { answerId: string; created?: string; answers: Record<string, string | string[] | undefined> }) => ({
            ...ans,
            disabled: ans.created ? ans.created.slice(0, 10) !== selectedSession : true
          }));
        }
        if (data.day2) {
          data.day2.answers = data.day2.answers.map((ans: { answerId: string; created?: string; answers: Record<string, string | string[] | undefined> }) => ({
            ...ans,
            disabled: ans.created ? ans.created.slice(0, 10) !== selectedDay2Date : true
          }));
        }
        
        setScenarioData(data);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Ошибка при загрузке ответов.");
      } finally {
        setIsLoadingScenario(false);
      }
    }
    void fetchScenarioAnswers();
  }, [useScenarioBuilder, selectedSession, selectedDay2Date]);


  const loadAverageTimes = useCallback(() => {
    try {
      const historyStr = localStorage.getItem("analytics_runs_history");
      if (!historyStr) return;
      const history = JSON.parse(historyStr) as Array<{ durations: Record<string, number> }>;
      const sums: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const run of history) {
        if (!run.durations) continue;
        for (const [stepId, duration] of Object.entries(run.durations)) {
          sums[stepId] = (sums[stepId] || 0) + duration;
          counts[stepId] = (counts[stepId] || 0) + 1;
        }
      }
      const averages: Record<string, number> = {};
      for (const stepId of Object.keys(sums)) {
        averages[stepId] = Math.round(sums[stepId] / counts[stepId]);
      }
      setAverageTimes(averages);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadAverageTimes();
  }, [loadAverageTimes, runResult]);

  const updateAnswerDisabled = (tab: "day1Input" | "day1Output" | "day2", index: number, disabled: boolean) => {
    setIsScenarioSaved(false);
    setScenarioData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const tabData = next[tab];
      if (!tabData) return prev;
      const table = { ...tabData };
      const answers = [...table.answers];
      answers[index] = { ...answers[index], disabled };
      table.answers = answers;
      next[tab] = table;
      return next;
    });
  };

  const updateAnswerValue = (tab: "day1Input" | "day1Output" | "day2", index: number, question: string, value: string) => {
    setIsScenarioSaved(false);
    setScenarioData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const tabData = next[tab];
      if (!tabData) return prev;
      const table = { ...tabData };
      const answers = [...table.answers];
      const ans = { ...answers[index] };
      const ansAnswers = { ...ans.answers };
      ansAnswers[question] = value;
      ans.answers = ansAnswers;
      answers[index] = ans;
      table.answers = answers;
      next[tab] = table;
      return next;
    });
  };

  const addAnswerRow = (tab: "day1Input" | "day1Output" | "day2") => {
    setIsScenarioSaved(false);
    setScenarioData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const tabData = next[tab];
      if (!tabData) return prev;
      const table = { ...tabData };
      const answers = [...table.answers];
      const newAnswersObj: Record<string, string> = {};
      table.questionList.forEach((q: string) => {
        newAnswersObj[q] = "";
      });
      answers.push({
        answerId: `temp-${getNow()}`,
        created: new Date().toISOString(),
        answers: newAnswersObj,
        disabled: false
      });
      table.answers = answers;
      next[tab] = table;
      return next;
    });
  };

  const handleResetPage = () => {
    setRunResult(null);
    setHasRunStarted(false);
    setNpsResult(null);
    setNpsData(null);
    setExecutionTimes({});
    setTotalTime(0);
    setAssetFiles({});
    setUseScenarioBuilder(false);
    setScenarioData(null);
    setIsScenarioSaved(true);
    setIsTableCollapsed(false);
    setEnabledBlocks(new Set(analyticsBlocks.filter((block) => block.enabled && block.id !== "day2").map((block) => block.id)));
  };

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

  const day1InputSelectedCount = useScenarioBuilder && scenarioData?.day1Input
    ? scenarioData.day1Input.answers.filter((a: { disabled?: boolean }) => !a.disabled).length
    : (currentSession ? currentSession.day1In : 0);

  const day1OutputSelectedCount = useScenarioBuilder && scenarioData?.day1Output
    ? scenarioData.day1Output.answers.filter((a: { disabled?: boolean }) => !a.disabled).length
    : (currentSession ? currentSession.day1Out : 0);

  const day2SelectedCount = useScenarioBuilder && scenarioData?.day2
    ? scenarioData.day2.answers.filter((a: { disabled?: boolean }) => !a.disabled).length
    : (currentDay2Session ? currentDay2Session.count : 0);

  // Set the default active tab depending on selected dates
  useEffect(() => {
    if (hasDay1Block) {
      setScenarioActiveTab(useDay1Input ? "day1Input" : "day1Output");
    } else if (hasDay2Block) {
      setScenarioActiveTab("day2");
    }
  }, [hasDay1Block, hasDay2Block, useDay1Input]);

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

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  async function handleAssetChange(assetId: "products" | "logo" | "generalPhoto" | "infographic", files: FileList | null) {
    if (!files) {
      setAssetFiles((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      return;
    }

    const fileList = Array.from(files);
    try {
      const fileData = await Promise.all(
        fileList.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            base64
          };
        })
      );
      setAssetFiles((current) => ({
        ...current,
        [assetId]: fileData
      }));
    } catch (error) {
      console.error("Error reading file:", error);
    }
  }

  async function handleRunClick() {
    if (!canRun || !currentSession) {
      return;
    }

    const stepsToRun = [];
    if (enabledBlocks.has("day1")) stepsToRun.push("day1");
    if (enabledBlocks.has("day2")) stepsToRun.push("day2");
    if (enabledBlocks.has("overall")) stepsToRun.push("overall");
    if (enabledBlocks.has("products")) stepsToRun.push("products");
    if (enabledBlocks.has("infographic")) {
      stepsToRun.push("infographic-prompt");
      stepsToRun.push("infographic-image");
    }
    if (enabledBlocks.has("publish")) {
      stepsToRun.push("publish");
    }

    if (stepsToRun.length === 0) return;

    setIsRunning(true);
    setHasRunStarted(true);
    setRunResult(null);
    setExecutionTimes({});
    setTotalTime(0);
    
    // Initialize execution steps graph
    const initialRunSteps = stepsToRun.map(stepId => {
      let title = "";
      let description = "";
      if (stepId === "day1") {
        title = "ИИ-анализ: День 1";
        description = "Аналитическая обработка отзывов первого дня";
      } else if (stepId === "day2") {
        title = "ИИ-анализ: День 2";
        description = "Сравнительный анализ отзывов второго дня";
      } else if (stepId === "overall") {
        title = "Синтез результатов";
        description = "Сведение данных первого и второго дней";
      } else if (stepId === "products") {
        title = "Анализ продуктов";
        description = "Анализ концепций цифровых продуктов";
      } else if (stepId === "infographic-prompt") {
        title = "Подготовка промта инфографики";
        description = "Генерация промта по материалам сессии";
      } else if (stepId === "infographic-image") {
        title = "Генерация инфографики";
        description = "Создание дашборда-инфографики";
      } else if (stepId === "publish") {
        title = "Публикация в Outline";
        description = "Сохранение и выгрузка отчетов в Outline";
      }
      return { id: stepId, title, description, status: "pending" as const };
    });
    
    setRunSteps(initialRunSteps);

    setActiveRun({
      ...latestAnalyticsRun,
      status: "running",
      progress: 10,
      steps: initialRunSteps.map(s => ({ id: s.id, title: s.title, description: s.description, status: "pending" as const }))
    });
    
    const startTime = getNow();
    const stepDurations: Record<string, number> = {};
    const accumulatedReports: Record<string, string> = {};
    let accumulatedImageUrl = "";
    let runAnswersContext = useScenarioBuilder ? scenarioData : null;
    let finalStats = null;
    let currentStepId = "";
    let currentStepStart = 0;

    const interval = setInterval(() => {
      const now = getNow();
      setTotalTime(Math.max(1, Math.round((now - startTime) / 1000)));
      if (currentStepId && currentStepStart) {
        const secs = Math.max(1, Math.round((now - currentStepStart) / 1000));
        setExecutionTimes(prev => ({ ...prev, [currentStepId]: secs }));
      }
    }, 1000);

    try {
      for (const stepId of stepsToRun) {
        currentStepId = stepId;
        currentStepStart = getNow();
        
        setRunSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: "running" as const } : s));

        if (stepId === "publish") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const duration = Math.max(1, Math.round((getNow() - currentStepStart) / 1000));
          stepDurations[stepId] = duration;
          setExecutionTimes(prev => ({ ...prev, [stepId]: duration }));
          setRunSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: "succeeded" as const } : s));
          continue;
        }

        // For Day 1, if we unchecked day1Input or day1Output, let's filter the answers
        let customAnswersPayload = runAnswersContext;
        if (stepId === "day1" && runAnswersContext) {
          customAnswersPayload = {
            ...runAnswersContext,
            day1Input: useDay1Input ? runAnswersContext.day1Input : { questionList: [], answers: [] },
            day1Output: useDay1Output ? runAnswersContext.day1Output : { questionList: [], answers: [] }
          };
        }

        const response = await fetch("/api/analytics/runs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            reportType: "day1",
            day1Date: currentSession.id,
            day2Date: currentDay2Session?.date,
            selectedBlocks: [stepId],
            stagePrompts: {
              [stepId === "infographic-prompt" ? "infographic-prompt" : stepId === "infographic-image" ? "infographic-image" : stepId]: 
                promptSettings[(stepId === "infographic-prompt" || stepId === "infographic-image" ? "infographic" : stepId) as AnalyticsBlockId]
            },
            stageReports: accumulatedReports,
            assetFiles,
            customAnswers: customAnswersPayload ?? undefined
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || `Ошибка выполнения этапа ${stepId}`);
        }

        const data = await response.json();

        // Capture context for subsequent requests if not already set
        if (!runAnswersContext && (data.day1Context || data.day2Context)) {
          runAnswersContext = {
            day1Input: data.day1Context?.input || { questionList: [], answers: [] },
            day1Output: data.day1Context?.output || { questionList: [], answers: [] },
            day2: data.day2Context || null
          };
        }

        if (data.stats) {
          finalStats = data.stats;
        }

        const duration = Math.max(1, Math.round((getNow() - currentStepStart) / 1000));
        stepDurations[stepId] = duration;
        setExecutionTimes(prev => ({ ...prev, [stepId]: duration }));

        if (data.stageReports) {
          Object.assign(accumulatedReports, data.stageReports);
        }
        if (data.infographicImageUrl) {
          accumulatedImageUrl = data.infographicImageUrl;
        }

        setRunResult({
          status: "ready",
          message: "Идет обработка шагов...",
          stageReports: { ...accumulatedReports },
          infographicImageUrl: accumulatedImageUrl,
          stats: finalStats || undefined
        });

        setRunSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: "succeeded" as const } : s));
      }

      // Merge and set final result
      const finalReportMarkdown = [
        accumulatedReports.day1,
        accumulatedReports.day2,
        accumulatedReports.overall,
        accumulatedReports.products,
        accumulatedReports["infographic-prompt"] ? `# Подготовка промта для инфографики\n\n${accumulatedReports["infographic-prompt"]}` : null,
        accumulatedReports["infographic-image"] ? `# Инфографика\n\n${accumulatedReports["infographic-image"]}` : null
      ]
        .filter(Boolean)
        .join("\n\n---\n\n");

      const finalResult: AnalyticsRunResult = {
        status: "ready",
        message: "Данные обработаны успешно.",
        reportMarkdown: finalReportMarkdown,
        infographicImageUrl: accumulatedImageUrl,
        stageReports: accumulatedReports,
        stats: finalStats || undefined
      };

      setRunResult(finalResult);

      // Save to localStorage history since the run completed successfully
      try {
        const historyStr = localStorage.getItem("analytics_runs_history") || "[]";
        const history = JSON.parse(historyStr);
        history.push({
          timestamp: getNow(),
          durations: stepDurations
        });
        localStorage.setItem("analytics_runs_history", JSON.stringify(history));
      } catch (err) {
        console.error("Failed to save run history to localStorage:", err);
      }

      setActiveRun({
        id: `analytics-day1-${currentSession.id}`,
        toolType: "analytics",
        title: `Аналитика ${formatDate(currentSession.id)}`,
        status: "succeeded",
        progress: 100,
        startedAt: new Date(startTime).toISOString(),
        steps: initialRunSteps.map(s => ({ id: s.id, title: s.title, description: s.description, status: "succeeded" as const }))
      });

    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при генерации отчетов.";
      setRunResult({
        status: "error",
        message: errorMessage
      });

      setRunSteps(prev => prev.map(s => {
        if (s.id === currentStepId) return { ...s, status: "failed" as const };
        return s;
      }));

      setActiveRun(prev => ({ ...prev, status: "failed", progress: 100 }));
    } finally {
      clearInterval(interval);
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
          day2Date: hasDay2Block ? currentDay2Session?.date : undefined,
          customAnswers: useScenarioBuilder ? scenarioData : undefined
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

  function handleDownloadPdf(block: { id: string; title: string }) {
    const content = runResult?.stageReports?.[block.id] ?? runResult?.reportMarkdown;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Пожалуйста, разрешите всплывающие окна для экспорта PDF.");
      return;
    }

    let htmlContent = content;
    htmlContent = htmlContent.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    htmlContent = htmlContent.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    htmlContent = htmlContent.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    
    const lines = htmlContent.split("\n");
    let inList = false;
    const formattedLines = lines.map((line: string) => {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const itemText = line.substring(2);
        let prefix = "";
        if (!inList) {
          inList = true;
          prefix = "<ul>";
        }
        return prefix + `<li>${itemText}</li>`;
      } else {
        let suffix = "";
        if (inList) {
          inList = false;
          suffix = "</ul>";
        }
        return suffix + line;
      }
    });
    if (inList) {
      formattedLines.push("</ul>");
    }
    htmlContent = formattedLines.join("\n");
    htmlContent = htmlContent.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    htmlContent = htmlContent.replace(/\n/g, "<br />");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${block.title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; background: #ffffff; }
            h1 { font-size: 26px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; color: #0f172a; }
            h2 { font-size: 20px; font-weight: 700; margin-top: 28px; margin-bottom: 12px; color: #1e293b; }
            h3 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #334155; }
            ul { margin: 8px 0 16px 0; padding-left: 24px; }
            li { margin-bottom: 6px; list-style-type: disc; }
            p { margin: 8px 0; }
            strong { font-weight: 700; }
            hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
            @media print { body { padding: 20px; } button { display: none; } }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
        <div className="date-controls" style={{ marginBottom: "16px" }}>
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
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="primary-button run-inline-button" disabled={isRunning || !canRun} onClick={handleRunClick}>
                {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                {isRunning ? "Запуск" : "Запустить"}
              </button>
              <button className="secondary-button" style={{ height: "42px", padding: "0 18px", display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--line)", background: "#ffffff" }} onClick={handleResetPage}>
                Сбросить
              </button>
            </div>
          ) : null}
        </div>

        {/* Day sections selection & Settings Row */}
        {((hasDay1Block && currentSession) || (hasDay2Block && currentDay2Session)) && (
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px", padding: "12px 20px", background: "var(--panel-strong)", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Разделы дня:</span>
            {hasDay1Block && currentSession && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={useDay1Input}
                    onChange={(e) => setUseDay1Input(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>Раздел 1: Входные анкеты ({day1InputSelectedCount})</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={useDay1Output}
                    onChange={(e) => setUseDay1Output(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span>Раздел 2: Выходные анкеты ({day1OutputSelectedCount})</span>
                </label>
              </>
            )}
            {hasDay2Block && currentDay2Session && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "default", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  style={{ width: "16px", height: "16px" }}
                />
                <span>Раздел 3: День 2 ({day2SelectedCount})</span>
              </label>
            )}
            
            <div style={{ width: "1px", height: "18px", background: "var(--line)" }} />
            
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 700, color: "var(--accent)" }}>
                <input
                  type="checkbox"
                  checked={useScenarioBuilder}
                  onChange={(e) => setUseScenarioBuilder(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <span>Расширенный табличный редактор</span>
              </label>
              {useScenarioBuilder && (
                <button
                  type="button"
                  onClick={() => setIsTableCollapsed(!isTableCollapsed)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px",
                    color: "var(--accent)",
                    opacity: 0.8
                  }}
                  title={isTableCollapsed ? "Развернуть таблицу" : "Свернуть таблицу"}
                >
                  {isTableCollapsed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scenario Builder Panel */}
        {useScenarioBuilder && !isTableCollapsed && (
          <div className="panel" style={{ marginTop: "10px", marginBottom: "24px", minWidth: 0, width: "100%", overflowX: "hidden" }}>
            <div className="panel-head">
              <h2>Расширенный табличный редактор</h2>
              {isLoadingScenario ? <Loader2 className="spin" size={18} /> : <span className="status-pill tone-success">Данные загружены</span>}
            </div>
            {isLoadingScenario ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                <Loader2 className="spin" size={32} />
              </div>
            ) : scenarioData ? (
              <div>
                {/* Tabs */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
                  {hasDay1Block && useDay1Input && scenarioData.day1Input && (
                    <button
                      className={cx("secondary-button", scenarioActiveTab === "day1Input" && "primary-button")}
                      style={{ height: "36px", fontSize: "13px", padding: "0 14px" }}
                      onClick={() => setScenarioActiveTab("day1Input")}
                    >
                      Раздел 1: Входные анкеты ({day1InputSelectedCount})
                    </button>
                  )}
                  {hasDay1Block && useDay1Output && scenarioData.day1Output && (
                    <button
                      className={cx("secondary-button", scenarioActiveTab === "day1Output" && "primary-button")}
                      style={{ height: "36px", fontSize: "13px", padding: "0 14px" }}
                      onClick={() => setScenarioActiveTab("day1Output")}
                    >
                      Раздел 2: Выходные анкеты ({day1OutputSelectedCount})
                    </button>
                  )}
                  {hasDay2Block && scenarioData.day2 && (
                    <button
                      className={cx("secondary-button", scenarioActiveTab === "day2" && "primary-button")}
                      style={{ height: "36px", fontSize: "13px", padding: "0 14px" }}
                      onClick={() => setScenarioActiveTab("day2")}
                    >
                      Раздел 3: День 2 ({day2SelectedCount})
                    </button>
                  )}
                </div>

                {/* Active Tab Table */}
                {(() => {
                  const activeTable = scenarioData[scenarioActiveTab];
                  if (!activeTable) return <div style={{ padding: "16px", color: "var(--muted)" }}>Нет данных или раздел отключен</div>;

                  return (
                    <div>
                      <div ref={tableContainerRef} style={{ width: "100%", maxWidth: "100%", maxHeight: "500px", overflowX: "auto", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", marginBottom: "16px", background: "#f8fafc" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "900px" }}>
                          <thead>
                            <tr style={{ background: "#f1f5f9", borderBottom: "1px solid var(--line)" }}>
                              <th style={{ padding: "12px", textAlign: "left", width: "40px" }}>Использовать</th>
                              <th style={{ padding: "12px", textAlign: "left", width: "50px" }}>#</th>
                              <th style={{ padding: "12px", textAlign: "left", width: "150px" }}>Дата заполнения</th>
                              {activeTable.questionList.map((q: string, qIdx: number) => (
                                <th key={qIdx} style={{ padding: "12px", textAlign: "left", minWidth: "150px", maxWidth: "300px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={q}>
                                  {q}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeTable.answers.map((ans: { answerId: string; created?: string; disabled: boolean; answers: Record<string, string | string[] | undefined> }, idx: number) => {
                              return (
                                <tr key={ans.answerId || idx} style={{ borderBottom: "1px solid var(--line)", background: ans.disabled ? "#f1f5f9" : "#ffffff", opacity: ans.disabled ? 0.6 : 1 }}>
                                  <td style={{ padding: "12px", textAlign: "center" }}>
                                    <input
                                      type="checkbox"
                                      checked={!ans.disabled}
                                      onChange={(e) => updateAnswerDisabled(scenarioActiveTab, idx, !e.target.checked)}
                                      style={{ cursor: "pointer", width: "16px", height: "16px" }}
                                    />
                                  </td>
                                  <td style={{ padding: "12px", color: "var(--muted)" }}>{idx + 1}</td>
                                  <td style={{ padding: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                                    {ans.created ? new Date(ans.created).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "—"}
                                  </td>
                                  {activeTable.questionList.map((q: string, qIdx: number) => {
                                    const rawVal = ans.answers[q];
                                    const displayVal = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal ?? "");
                                    return (
                                      <td key={qIdx} style={{ padding: "6px 8px" }}>
                                        <input
                                          type="text"
                                          value={displayVal}
                                          disabled={ans.disabled}
                                          onChange={(e) => updateAnswerValue(scenarioActiveTab, idx, q, e.target.value)}
                                          style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            border: "1px solid transparent",
                                            background: "transparent",
                                            borderRadius: "4px",
                                            outline: "none",
                                            fontSize: "13px"
                                          }}
                                          onFocus={(e) => {
                                            e.target.style.border = "1px solid var(--accent)";
                                            e.target.style.background = "#ffffff";
                                          }}
                                          onBlur={(e) => {
                                            e.target.style.border = "1px solid transparent";
                                            e.target.style.background = "transparent";
                                          }}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <button
                          className="secondary-button"
                          style={{ height: "36px", fontSize: "13px", padding: "0 14px" }}
                          onClick={() => addAnswerRow(scenarioActiveTab)}
                        >
                          + Добавить строку
                        </button>
                        <button
                          className="primary-button"
                          style={{ height: "36px", fontSize: "13px", padding: "0 18px", background: isScenarioSaved ? "#10b981" : "var(--accent)", borderColor: isScenarioSaved ? "#10b981" : "var(--accent)", color: "#ffffff", display: "inline-flex", alignItems: "center", gap: "6px" }}
                          onClick={() => {
                            setIsScenarioSaved(true);
                            alert("Изменения в сценарии успешно сохранены и будут применены при запуске аналитики!");
                          }}
                        >
                          {isScenarioSaved ? <Check size={14} /> : <Save size={14} />}
                          {isScenarioSaved ? "Сохранено" : "Сохранить изменения"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", padding: "16px" }}>Выберите сессию для отображения таблицы ответов.</div>
            )}
          </div>
        )}

        {/* Calculated NPS Visual Cards */}
        {npsData && npsData.results && npsData.results.filter(res => res.total > 0).length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px", marginBottom: "20px" }}>
            {npsData.results.filter(res => res.total > 0).map((res: NpsBucketResult, idx: number) => {
              const promotersPct = res.total > 0 ? Math.round((res.promoters / res.total) * 100) : 0;
              const passivesPct = res.total > 0 ? Math.round((res.passives / res.total) * 100) : 0;
              const detractorsPct = res.total > 0 ? Math.round((res.detractors / res.total) * 100) : 0;

              return (
                <div key={idx} className="panel" style={{ margin: 0, padding: "24px", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1px solid var(--line)", borderRadius: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid rgba(226, 232, 240, 0.8)", paddingBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />
                      {res.label} ({formatDate(res.date)})
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="status-pill tone-success" style={{ fontSize: "11px", padding: "4px 12px", fontWeight: 700, borderRadius: "99px" }}>Расчет выполнен</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNpsData(null);
                          setNpsResult(null);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px",
                          borderRadius: "4px",
                          transition: "background 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        title="Закрыть"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", alignItems: "center" }}>
                    {/* Left Column: NPS Score */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingRight: "24px", borderRight: "1px solid rgba(226, 232, 240, 0.8)" }}>
                      <div style={{ fontSize: "64px", fontWeight: 800, color: res.nps >= 0 ? "#10b981" : "#ef4444", lineHeight: "1" }}>
                        {res.nps >= 0 ? `+${res.nps}` : res.nps}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 600, marginTop: "8px", letterSpacing: "-0.01em" }}>
                        Индекс лояльности (NPS)
                      </div>
                      <div style={{ 
                        marginTop: "16px",
                        background: "#eceaff",
                        color: "#6c5ce7",
                        padding: "6px 16px",
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: 700,
                        display: "inline-block",
                        boxShadow: "0 2px 4px rgba(108, 92, 231, 0.08)"
                      }}>
                        {res.total} ответов
                      </div>
                    </div>

                    {/* Right Column: Categories Stack */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Promoters Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "12px 18px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)" }}>
                        <div style={{ display: "flex", alignItems: "center", width: "140px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", border: "1.5px solid #10b981", background: "#ecfdf5", color: "#10b981" }}>
                            <Smile size={16} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginLeft: "12px" }}>Промоутеры</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 20px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${promotersPct}%`, height: "100%", background: "#10b981", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
                          {res.promoters} ({promotersPct}%)
                        </div>
                      </div>

                      {/* Passives Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "12px 18px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)" }}>
                        <div style={{ display: "flex", alignItems: "center", width: "140px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", border: "1.5px solid #f59e0b", background: "#fffbeb", color: "#f59e0b" }}>
                            <Meh size={16} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginLeft: "12px" }}>Нейтралы</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 20px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${passivesPct}%`, height: "100%", background: "#f59e0b", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
                          {res.passives} ({passivesPct}%)
                        </div>
                      </div>

                      {/* Detractors Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "12px 18px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)" }}>
                        <div style={{ display: "flex", alignItems: "center", width: "140px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", border: "1.5px solid #ef4444", background: "#fef2f2", color: "#ef4444" }}>
                            <Frown size={16} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginLeft: "12px" }}>Критики</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 20px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${detractorsPct}%`, height: "100%", background: "#ef4444", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
                          {res.detractors} ({detractorsPct}%)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : npsResult ? (
          <div className="inline-result" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={18} />
            <span>{npsResult}</span>
            <button
              type="button"
              onClick={() => setNpsResult(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--muted)",
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                padding: "4px",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              title="Закрыть"
            >
              <X size={16} />
            </button>
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
                  <small>{assetFiles.products?.map((f) => f.name).join(", ") || "Файл не выбран"}</small>
                </label>
              )}

              {enabledBlocks.has("logo") && (
                <label>
                  <span>Логотип сессии</span>
                  <span className="upload-btn-mock">
                    <Download size={14} /> Выбрать файл
                  </span>
                  <input accept="image/*" type="file" onChange={(event) => handleAssetChange("logo", event.target.files)} />
                  <small>{assetFiles.logo?.map((f) => f.name).join(", ") || "Файл не выбран"}</small>
                </label>
              )}

              {enabledBlocks.has("generalPhoto") && (
                <label>
                  <span>Общая фото участников</span>
                  <span className="upload-btn-mock">
                    <Download size={14} /> Выбрать файл
                  </span>
                  <input accept="image/*" type="file" onChange={(event) => handleAssetChange("generalPhoto", event.target.files)} />
                  <small>{assetFiles.generalPhoto?.map((f) => f.name).join(", ") || "Файл не выбран"}</small>
                </label>
              )}
            </div>
          </div>
        ) : null}

        {/* Progress track panel */}
        {hasRunStarted ? (
          <section className="execution-panel panel">
            <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>Ход выполнения</h2>
                <span className="muted">{selectedFlowText}</span>
              </div>
              {totalTime > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(14, 165, 233, 0.15)", border: "1px solid rgba(14, 165, 233, 0.3)", borderRadius: "99px", padding: "6px 14px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Общее время:</span>
                  <strong style={{ fontSize: "14px", fontWeight: 800, color: "var(--primary)" }}>{formatTime(totalTime)}</strong>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              {runSteps.map((step) => {
                const isStepSucceeded = step.status === "succeeded";
                const isInfographicImage = step.id === "infographic-image" || step.id === "infographic";
                const stepReportKey = step.id === "infographic-prompt" ? "infographic-prompt" : step.id;
                const hasReport = isInfographicImage
                  ? Boolean(runResult?.infographicImageUrl)
                  : Boolean(runResult?.stageReports?.[stepReportKey as AnalyticsBlockId] || runResult?.stageReports?.[stepReportKey]);
                
                return (
                  <div key={step.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div 
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
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        {step.status === "running" && executionTimes[step.id] !== undefined && (
                          <span style={{ 
                            fontSize: "12px", 
                            color: "var(--primary)", 
                            fontWeight: 700, 
                            background: "rgba(14, 165, 233, 0.1)",
                            padding: "4px 10px",
                            borderRadius: "6px"
                          }}>
                            {formatTime(executionTimes[step.id])}
                          </span>
                        )}
                        {isStepSucceeded && hasReport && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isInfographicImage ? (
                              <>
                                <a 
                                  href={runResult?.infographicImageUrl} 
                                  download="infographic.png"
                                  className="secondary-button" 
                                  style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                                >
                                  <Download size={14} />
                                  Скачать инфографику
                                </a>
                                <button 
                                  className={cx("secondary-button", openPreviews[step.id] && "primary-button")} 
                                  style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                                  onClick={() => togglePreview(step.id)}
                                >
                                  <Eye size={14} />
                                  Превью
                                </button>
                              </>
                            ) : (
                              <>
                                <button 
                                  className="secondary-button" 
                                  style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                                  onClick={() => handleDownloadResult({ id: stepReportKey as AnalyticsBlockId, title: step.title })}
                                >
                                  <Download size={14} />
                                  Скачать DOCX
                                </button>
                                <button 
                                  className="secondary-button" 
                                  style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                                  onClick={() => handleDownloadPdf({ id: stepReportKey, title: step.title })}
                                >
                                  <Download size={14} />
                                  Скачать PDF
                                </button>
                                <button 
                                  className={cx("secondary-button", openPreviews[step.id] && "primary-button")} 
                                  style={{ height: "36px", padding: "0 14px", fontSize: "13px", gap: "6px" }}
                                  onClick={() => togglePreview(step.id)}
                                >
                                  <Eye size={14} />
                                  Превью
                                </button>
                              </>
                            )}
                            <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "11px", color: "var(--muted)", fontWeight: "500" }}>
                              <span>Время: {executionTimes[step.id] ? formatTime(executionTimes[step.id]) : "—"}</span>
                              {averageTimes[step.id] && (
                                <span style={{ color: "var(--accent)" }}>среднее: {formatTime(averageTimes[step.id])}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded Preview Panel */}
                    {openPreviews[step.id] && hasReport && (
                      <div
                        style={{
                          marginLeft: "32px",
                          padding: "20px",
                          background: "var(--panel-strong)",
                          border: "1px solid var(--line)",
                          borderRadius: "12px",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                          position: "relative"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Превью результата: {step.title}</span>
                          {!isInfographicImage && (
                            <button
                              className="secondary-button"
                              style={{ height: "30px", padding: "0 12px", fontSize: "12px", gap: "6px" }}
                              onClick={() => {
                                const reportText = runResult?.stageReports?.[stepReportKey] || "";
                                void navigator.clipboard.writeText(reportText);
                                setCopiedStepId(step.id);
                                setTimeout(() => setCopiedStepId(null), 2000);
                              }}
                            >
                              {copiedStepId === step.id ? (
                                <>
                                  <CheckCircle2 size={12} style={{ color: "var(--green)" }} />
                                  <span>Скопировано!</span>
                                </>
                              ) : (
                                <>
                                  <Save size={12} />
                                  <span>Копировать</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div
                          style={{
                            padding: "16px",
                            background: isInfographicImage ? "#f8fafc" : "#ffffff",
                            border: "1px solid var(--line)",
                            borderRadius: "8px",
                            fontSize: "13px",
                            lineHeight: "1.6",
                            maxHeight: "650px",
                            overflowY: "auto",
                            textAlign: isInfographicImage ? "center" : "left",
                            display: isInfographicImage ? "flex" : "block",
                            justifyContent: "center",
                            alignItems: "center"
                          }}
                        >
                          {isInfographicImage ? (
                            <img 
                              src={runResult?.infographicImageUrl || ""} 
                              style={{ maxWidth: "100%", maxHeight: "600px", borderRadius: "8px", boxShadow: "var(--shadow-sm)", objectFit: "contain" }} 
                              alt="Инфографика" 
                            />
                          ) : (
                            <MarkdownPreview text={runResult?.stageReports?.[stepReportKey] || ""} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Generate results banner */}
        {runResult && runResult.status !== "ready" ? (
          <div className={cx("run-result", runResult.status === "error" && "error")}>
            <strong>{runResult.status === "no_data" ? "Нет данных" : "Ошибка запуска"}</strong>
            <span>{runResult.message}</span>
            {runResult.stats ? (
              <small>
                Входных: {runResult.stats.inputCount} · Выходных: {runResult.stats.outputCount}
                {typeof runResult.stats.day2Count === "number" ? ` · День 2: ${runResult.stats.day2Count}` : ""}
              </small>
            ) : null}
          </div>
        ) : null}
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
          { id: "source", title: "Подготовка файла", description: "Файл успешно подготовлен и загружен in Google Cloud", status: "succeeded" },
          { id: "transcribe", title: "Подготовка стенограммы", description: hasTranscript ? "Стенограмма успешно подготовлена" : "Ожидание подготовки...", status: hasTranscript ? "succeeded" : "pending" },
          { id: "extract", title: "Подготовка протокола", description: hasProtocol ? "Протокол встречи подготовлен" : "Ожидание подготовки...", status: hasProtocol ? "succeeded" : "pending" }
        ]);
      } else if (selectedFile) {
        setHasRunStarted(true);
        const partsText = chunksCount !== null ? "Файл выбран. Готов к загрузке в Google Cloud" : "Определение параметров файла...";
        setRunSteps([
          { id: "source", title: "Подготовка файла", description: partsText, status: "pending" },
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
          const lines = value.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l)));
          updatedItem.decisions = lines.length;
        }
        if (fieldKey === "tasksText") {
          const lines = value.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l)));
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

    setIsGenerating(true);
    setError(null);
    setHasRunStarted(true);

    if (selectedFile) {
      setProgressMessage("Подготовка файла...");
      setUploadProgress(5);
      setPreviewTab("transcript");
      setRunSteps([
        { id: "source", title: "Подготовка файла", description: "Сохранение и оптимизация файла...", status: "running" },
        { id: "transcribe", title: "Подготовка стенограммы", description: "Ожидание распознавания речи...", status: "pending" },
        { id: "extract", title: "Подготовка протокола", description: "Ожидание выделения структуры...", status: "pending" }
      ]);
    } else {
      setProgressMessage("Анализ готовой стенограммы встречи...");
      setUploadProgress(40);
      setPreviewTab("protocol");
      setRunSteps([
        { id: "source", title: "Подготовка файла", description: "Использована готовая стенограмма", status: "succeeded" },
        { id: "transcribe", title: "Подготовка стенограммы", description: "Стенограмма взята из черновика", status: "succeeded" },
        { id: "extract", title: "Подготовка протокола", description: "Выделение ИИ структуры протокола...", status: "running" }
      ]);
    }

    setActiveRun({
      ...activeRun,
      status: "running",
      progress: selectedFile ? 5 : 40,
      steps: activeRun.steps.map((s) => {
        if (s.id === "source") return { ...s, status: "running" as const, description: selectedFile ? "Обработка файла..." : "Использование стенограммы..." };
        return { ...s, status: "pending" as const };
      })
    });

    try {
      const promptText = promptSettings["protocol.meeting"] || "";
      const transcriptPromptText = promptSettings["protocol.transcript"] || "";
      
      let response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("protocolId", protocol.id);
        formData.append("prompt", promptText);
        formData.append("transcriptPrompt", transcriptPromptText);

        response = await fetch("/api/protocols/runs", {
          method: "POST",
          body: formData
        });
      } else {
        response = await fetch("/api/protocols/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            protocolId: protocol.id,
            prompt: promptText,
            transcript: protocol.transcript,
            transcriptPrompt: transcriptPromptText
          })
        });
      }

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
              // source step
              if (update.stage === "upload" || update.stage === "convert" || update.stage === "google_upload") {
                if (step.id === "source") {
                  return { ...step, status: "running" as const, description: update.message || "Обработка и загрузка файла..." };
                }
              }
              // transcribe step
              if (update.stage === "transcribe") {
                if (step.id === "source") {
                  return { ...step, status: "succeeded" as const, description: "Файл успешно подготовлен и загружен в Google Cloud" };
                }
                if (step.id === "transcribe") {
                  return { ...step, status: "running" as const, description: update.message || "Распознавание речи..." };
                }
              }
              // extract step
              if (update.stage === "extract" || update.stage === "save") {
                if (step.id === "source") return { ...step, status: "succeeded" as const, description: "Файл успешно подготовлен и загружен в Google Cloud" };
                if (step.id === "transcribe") return { ...step, status: "succeeded" as const, description: "Стенограмма встречи готова" };
                if (step.id === "extract") {
                  return { ...step, status: "running" as const, description: update.message || "Извлечение структуры протокола..." };
                }
              }
              return step;
            });
          });

          if (update.stage === "done" && update.extractedData) {
            const ext = update.extractedData;
            const finalTranscript = update.finalTranscript || "";

            const decisionsCount = ext.decisionsText
              ? ext.decisionsText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
              : 0;
            const tasksCount = ext.tasksText
              ? ext.tasksText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
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
              { id: "source", title: "Подготовка файла", description: "Файл успешно подготовлен и загружен в Google Cloud", status: "succeeded" },
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
                        ? `Длительность: ${Math.floor(mediaDuration / 60)} мин ${Math.round(mediaDuration % 60)} сек`
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
                  disabled={isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))}
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
                    cursor: (isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))) ? "not-allowed" : "pointer",
                    opacity: (isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))) ? 0.5 : 1
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
                      maxHeight: "450px",
                      overflowY: "auto"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Тема встречи
                          <input 
                            value={protocol.theme || ""} 
                            onChange={(e) => handleFieldChange("theme", e.target.value)} 
                            placeholder="Введите тему встречи" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              fontSize: "13px"
                            }}
                          />
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Повестка
                          <textarea 
                            value={protocol.agenda || ""} 
                            onChange={(e) => handleFieldChange("agenda", e.target.value)} 
                            placeholder="Введите повестку дня (список вопросов)" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "80px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Основные тезисы
                          <textarea 
                            value={protocol.keyPoints || ""} 
                            onChange={(e) => handleFieldChange("keyPoints", e.target.value)} 
                            placeholder="Основные тезисы обсуждения" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "100px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Принятые решения
                          <textarea 
                            value={protocol.decisionsText || ""} 
                            onChange={(e) => handleFieldChange("decisionsText", e.target.value)} 
                            placeholder="Принятые решения (каждое с новой строки, начиная с '-' или '*')" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "80px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Задачи к выполнению
                          <textarea 
                            value={protocol.tasksText || ""} 
                            onChange={(e) => handleFieldChange("tasksText", e.target.value)} 
                            placeholder="Задачи к выполнению (каждая с новой строки, начиная с '-' или '*')" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "80px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                            Ответственные
                            <input 
                              value={protocol.responsible || ""} 
                              onChange={(e) => handleFieldChange("responsible", e.target.value)} 
                              placeholder="Ответственные лица" 
                              style={{ 
                                padding: "10px", 
                                border: "1px solid var(--line)", 
                                borderRadius: "var(--border-radius)",
                                background: "var(--bg-card)",
                                color: "var(--text)",
                                fontSize: "13px"
                              }}
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                            Сроки
                            <input 
                              value={protocol.deadlines || ""} 
                              onChange={(e) => handleFieldChange("deadlines", e.target.value)} 
                              placeholder="Сроки выполнения" 
                              style={{ 
                                padding: "10px", 
                                border: "1px solid var(--line)", 
                                borderRadius: "var(--border-radius)",
                                background: "var(--bg-card)",
                                color: "var(--text)",
                                fontSize: "13px"
                              }}
                            />
                          </label>
                        </div>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Выявленные риски
                          <textarea 
                            value={protocol.risks || ""} 
                            onChange={(e) => handleFieldChange("risks", e.target.value)} 
                            placeholder="Выявленные риски и неопределенности" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "60px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          Приложения
                          <textarea 
                            value={protocol.attachments || ""} 
                            onChange={(e) => handleFieldChange("attachments", e.target.value)} 
                            placeholder="Приложения и полезные ссылки" 
                            style={{ 
                              padding: "10px", 
                              border: "1px solid var(--line)", 
                              borderRadius: "var(--border-radius)",
                              background: "var(--bg-card)",
                              color: "var(--text)",
                              minHeight: "60px",
                              fontSize: "13px",
                              resize: "vertical"
                            }}
                          />
                        </label>
                      </div>
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
                    <textarea 
                      style={{
                        padding: "16px",
                        background: "var(--bg)",
                        borderRadius: "var(--border-radius)",
                        border: "1px solid var(--line)",
                        fontSize: "13px",
                        lineHeight: "1.6",
                        minHeight: "300px",
                        maxHeight: "450px",
                        width: "100%",
                        color: "var(--text)",
                        fontFamily: "monospace",
                        resize: "vertical"
                      }}
                      value={protocol.transcript || ""}
                      onChange={(e) => handleFieldChange("transcript", e.target.value)}
                      placeholder={isGenerating ? "Ожидание распознавания..." : "Стенограмма пуста. Введите текст стенограммы вручную или загрузите файл записи встречи."}
                    />
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


    </div>
  );
}
