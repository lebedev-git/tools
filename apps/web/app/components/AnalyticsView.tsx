"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef, type Dispatch, type SetStateAction } from "react";
import {
  BarChart3,
  Boxes,
  Calendar,
  Camera,
  ChevronDown,
  Compass,
  Download,
  Copy,
  FileCheck,
  Gauge,
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
  X,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { analyticsBlocks, latestAnalyticsRun } from "@tools/analytics";
import type { ProcessRun } from "@tools/core";
import {
  getNow,
  formatDate,
  cx,
  StepIcon,
  formatTime,
  MarkdownPreview,
  markdownToHtml,
  type Section,
  type AnalyticsBlockId,
  type AvailabilityOption,
  type Day2AvailabilityOption,
  type AnalyticsRunResult,
  type NpsBucketResult,
  type RunStep
} from "../../lib/utils";

interface SavedAnalyticsRun {
  sessionId: string;
  day2SessionId?: string;
  stepsToRun: string[];
  currentStepIndex: number;
  currentJobId: number;
  accumulatedReports: Record<string, string>;
  accumulatedImageUrl: string;
  customReportName: string;
  promptSettings: Record<string, string>;
  enabledBlocks: AnalyticsBlockId[];
  assetFiles: Record<string, any>;
  customAnswers: any;
  startTime: number;
  stepDurations: Record<string, number>;
  useDay1Input: boolean;
  useDay1Output: boolean;
  useDay2: boolean;
  notebookId?: string;
  notebookUrl?: string;
}

interface AnalyticsViewProps {
  promptSettings: Record<AnalyticsBlockId, string>;
  activeRun: ProcessRun;
  setActiveRun: Dispatch<SetStateAction<ProcessRun>>;
}

export default function AnalyticsView({ promptSettings, activeRun, setActiveRun }: AnalyticsViewProps) {
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
  const [customReportName, setCustomReportName] = useState("");


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
  const [copiedNpsId, setCopiedNpsId] = useState<number | null>(null);
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
  const [useDay2, setUseDay2] = useState(true);
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
    if (hasDay1Block && useDay1Input) {
      setScenarioActiveTab("day1Input");
    } else if (hasDay1Block && useDay1Output) {
      setScenarioActiveTab("day1Output");
    } else if (hasDay2Block && useDay2) {
      setScenarioActiveTab("day2");
    }
  }, [hasDay1Block, hasDay2Block, useDay1Input, useDay1Output, useDay2]);

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

  async function handleAssetChange(assetId: "products" | "logo" | "generalPhoto", files: FileList | null) {
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const pollAnalyticsJob = async (savedRun: SavedAnalyticsRun) => {
    setIsRunning(true);
    setHasRunStarted(true);

    const initialRunSteps = savedRun.stepsToRun.map(stepId => {
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
        title = "Публикация в Open Notebook";
        description = "Сохранение и выгрузка отчетов в Open Notebook";
      }

      let status: "pending" | "running" | "succeeded" | "failed" = "pending";
      const idx = savedRun.stepsToRun.indexOf(stepId);
      if (idx < savedRun.currentStepIndex) {
        status = "succeeded";
      } else if (idx === savedRun.currentStepIndex) {
        status = "running";
      }

      return { id: stepId, title, description, status };
    });

    setRunSteps(initialRunSteps);
    setExecutionTimes(savedRun.stepDurations);

    const hasAnyReport = Object.keys(savedRun.accumulatedReports).length > 0;
    if (hasAnyReport || savedRun.accumulatedImageUrl || savedRun.notebookUrl) {
      setRunResult({
        status: "ready",
        message: "Идет обработка шагов...",
        stageReports: savedRun.accumulatedReports,
        infographicImageUrl: savedRun.accumulatedImageUrl,
        notebookId: savedRun.notebookId,
        notebookUrl: savedRun.notebookUrl
      });
    }

    if (timerRef.current) clearInterval(timerRef.current);

    let currentStepStart = Date.now();
    const stepId = savedRun.stepsToRun[savedRun.currentStepIndex];

    timerRef.current = setInterval(() => {
      const now = Date.now();
      setTotalTime(Math.max(1, Math.round((now - savedRun.startTime) / 1000)));
      if (stepId) {
        const secs = Math.max(1, Math.round((now - currentStepStart) / 1000));
        setExecutionTimes(prev => ({
          ...prev,
          [stepId]: secs
        }));
      }
    }, 1000);

    try {
      let jobResult = null;
      const jobId = savedRun.currentJobId;

      while (true) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const checkRes = await fetch(`/api/jobs?id=${jobId}`);
        if (!checkRes.ok) {
          throw new Error(`Ошибка опроса статуса задачи ${jobId}`);
        }
        const job = await checkRes.json();
        if (job.status === "succeeded") {
          jobResult = JSON.parse(job.result);
          break;
        } else if (job.status === "failed") {
          throw new Error(job.message || job.error || "Ошибка фоновой аналитики");
        }
        if (job.message) {
          setRunSteps(prev => prev.map(s => s.id === stepId ? { ...s, description: job.message } : s));
        }
      }

      const data = jobResult;

      if (data.stageReports) {
        Object.assign(savedRun.accumulatedReports, data.stageReports);
      }
      if (data.infographicImageUrl) {
        savedRun.accumulatedImageUrl = data.infographicImageUrl;
      }
      if (data.notebookId) {
        savedRun.notebookId = data.notebookId;
        savedRun.notebookUrl = data.notebookUrl || `https://notebook.3321616.ru/notebooks/${encodeURIComponent(data.notebookId)}`;
      }

      const duration = Math.max(1, Math.round((Date.now() - currentStepStart) / 1000));
      savedRun.stepDurations[stepId] = duration;
      setExecutionTimes(prev => ({ ...prev, [stepId]: duration }));

      setRunSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: "succeeded" as const } : s));

      savedRun.currentStepIndex += 1;

      if (savedRun.currentStepIndex < savedRun.stepsToRun.length) {
        const nextStepId = savedRun.stepsToRun[savedRun.currentStepIndex];

        const response = await fetch("/api/analytics/runs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            reportType: "day1",
            day1Date: savedRun.sessionId,
            day2Date: savedRun.day2SessionId,
            selectedBlocks: [nextStepId],
            customReportName: savedRun.customReportName,
            stagePrompts: {
              [nextStepId === "infographic-prompt" ? "infographic-prompt" : nextStepId === "infographic-image" ? "infographic-image" : nextStepId]: 
                savedRun.promptSettings[(nextStepId === "infographic-prompt" || nextStepId === "infographic-image" ? "infographic" : nextStepId) as AnalyticsBlockId]
            },
            stageReports: savedRun.accumulatedReports,
            assetFiles: savedRun.assetFiles,
            customAnswers: savedRun.customAnswers ?? undefined
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || `Ошибка выполнения этапа ${nextStepId}`);
        }

        const runInit = await response.json();
        savedRun.currentJobId = runInit.jobId;

        localStorage.setItem("active_analytics_run", JSON.stringify(savedRun));

        void pollAnalyticsJob(savedRun);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);

        const finalReportMarkdown = [
          savedRun.accumulatedReports.day1,
          savedRun.accumulatedReports.day2,
          savedRun.accumulatedReports.overall,
          savedRun.accumulatedReports.products,
          savedRun.accumulatedReports["infographic-prompt"] ? `# Подготовка промта для инфографики\n\n${savedRun.accumulatedReports["infographic-prompt"]}` : null,
          savedRun.accumulatedReports["infographic-image"] ? `# Инфографика\n\n${savedRun.accumulatedReports["infographic-image"]}` : null
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");

        const finalResult: AnalyticsRunResult = {
          status: "ready",
          message: "Данные обработаны успешно.",
          reportMarkdown: finalReportMarkdown,
          infographicImageUrl: savedRun.accumulatedImageUrl,
          stageReports: savedRun.accumulatedReports,
          stats: data.stats || undefined,
          notebookId: savedRun.notebookId,
          notebookUrl: savedRun.notebookUrl
        };

        setRunResult(finalResult);

        try {
          const historyStr = localStorage.getItem("analytics_runs_history") || "[]";
          const history = JSON.parse(historyStr);
          history.push({
            timestamp: Date.now(),
            durations: savedRun.stepDurations
          });
          localStorage.setItem("analytics_runs_history", JSON.stringify(history));
        } catch (err) {
          console.error("Failed to save run history to localStorage:", err);
        }

        setActiveRun({
          id: `analytics-day1-${savedRun.sessionId}`,
          toolType: "analytics",
          title: `Аналитика ${formatDate(savedRun.sessionId)}`,
          status: "succeeded",
          progress: 100,
          startedAt: new Date(savedRun.startTime).toISOString(),
          steps: initialRunSteps.map(s => ({ id: s.id, title: s.title, description: s.description, status: "succeeded" as const }))
        });

        localStorage.removeItem("active_analytics_run");
        setIsRunning(false);
      }
    } catch (error) {
      console.error(error);
      if (timerRef.current) clearInterval(timerRef.current);

      const errorMessage = error instanceof Error ? error.message : "Ошибка при генерации отчетов.";
      setRunResult({
        status: "error",
        message: errorMessage
      });

      setRunSteps(prev => prev.map(s => {
        if (s.id === stepId) return { ...s, status: "failed" as const };
        return s;
      }));

      setActiveRun(prev => ({ ...prev, status: "failed", progress: 100 }));

      localStorage.removeItem("active_analytics_run");
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRunStr = localStorage.getItem("active_analytics_run");
      if (savedRunStr) {
        try {
          const savedRun = JSON.parse(savedRunStr) as SavedAnalyticsRun;
          if (savedRun && !isRunning) {
            setSelectedSession(savedRun.sessionId);
            if (savedRun.day2SessionId) setSelectedDay2Date(savedRun.day2SessionId);
            setCustomReportName(savedRun.customReportName);
            setEnabledBlocks(new Set(savedRun.enabledBlocks));
            setUseDay1Input(savedRun.useDay1Input);
            setUseDay1Output(savedRun.useDay1Output);
            setUseDay2(savedRun.useDay2);

            void pollAnalyticsJob(savedRun);
          }
        } catch (e) {
          console.error("Failed to restore active analytics run:", e);
        }
      }
    }
  }, []);

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
        title = "Публикация в Open Notebook";
        description = "Сохранение и выгрузка отчетов в Open Notebook";
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

    const startTime = Date.now();
    const runAnswersContext = useScenarioBuilder ? scenarioData : null;

    try {
      const stepId = stepsToRun[0];

      let customAnswersPayload = runAnswersContext;
      if (runAnswersContext) {
        customAnswersPayload = {
          ...runAnswersContext,
          day1Input: useDay1Input ? runAnswersContext.day1Input : { questionList: [], answers: [] },
          day1Output: useDay1Output ? runAnswersContext.day1Output : { questionList: [], answers: [] },
          day2: useDay2 ? runAnswersContext.day2 : { questionList: [], answers: [] }
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
          day2Date: (enabledBlocks.has("day2") || enabledBlocks.has("overall")) ? currentDay2Session?.date : undefined,
          selectedBlocks: [stepId],
          customReportName: customReportName,
          stagePrompts: {
            [stepId === "infographic-prompt" ? "infographic-prompt" : stepId === "infographic-image" ? "infographic-image" : stepId]: 
              promptSettings[(stepId === "infographic-prompt" || stepId === "infographic-image" ? "infographic" : stepId) as AnalyticsBlockId]
          },
          stageReports: {},
          assetFiles,
          customAnswers: customAnswersPayload ?? undefined
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || `Ошибка выполнения этапа ${stepId}`);
      }

      const runInit = await response.json();
      const { jobId } = runInit;

      const savedRun: SavedAnalyticsRun = {
        sessionId: currentSession.id,
        day2SessionId: (enabledBlocks.has("day2") || enabledBlocks.has("overall")) ? currentDay2Session?.date : undefined,
        stepsToRun,
        currentStepIndex: 0,
        currentJobId: jobId,
        accumulatedReports: {},
        accumulatedImageUrl: "",
        customReportName,
        promptSettings,
        enabledBlocks: Array.from(enabledBlocks),
        assetFiles,
        customAnswers: customAnswersPayload,
        startTime,
        stepDurations: {},
        useDay1Input,
        useDay1Output,
        useDay2
      };

      localStorage.setItem("active_analytics_run", JSON.stringify(savedRun));

      void pollAnalyticsJob(savedRun);

    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при генерации отчетов.";
      setRunResult({
        status: "error",
        message: errorMessage
      });
      setIsRunning(false);
    }
  }

  const copyNpsToClipboard = (res: NpsBucketResult, idx: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const promotersPct = res.total > 0 ? Math.round((res.promoters / res.total) * 100) : 0;
    const passivesPct = res.total > 0 ? Math.round((res.passives / res.total) * 100) : 0;
    const detractorsPct = res.total > 0 ? Math.round((res.detractors / res.total) * 100) : 0;

    // 1. Draw background gradient
    const grad = ctx.createLinearGradient(0, 0, 960, 540);
    grad.addColorStop(0, "#f8fafc");
    grad.addColorStop(1, "#f1f5f9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 960, 540);

    // 2. Draw border
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 958, 538);

    // 3. Draw Header
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${res.label} (${formatDate(res.date)})`, 40, 55);

    // Draw "Расчет выполнен" badge
    ctx.fillStyle = "#ecfdf5";
    ctx.beginPath();
    ctx.roundRect(750, 25, 170, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Расчет выполнен", 835, 48);
    ctx.textAlign = "left"; // reset

    // Draw horizontal separator line
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 85);
    ctx.lineTo(920, 85);
    ctx.stroke();

    // 4. Left Column: NPS Score
    // Draw background card for NPS
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(40, 120, 290, 380, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // NPS Score Text
    ctx.textAlign = "center";
    ctx.font = "bold 86px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = res.nps >= 0 ? "#10b981" : "#ef4444";
    const npsText = res.nps >= 0 ? `+${res.nps}` : `${res.nps}`;
    ctx.fillText(npsText, 185, 260);

    // NPS label
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
    ctx.fillText("Индекс лояльности (NPS)", 185, 305);

    // Answers count badge
    ctx.fillStyle = "#eceaff";
    ctx.beginPath();
    ctx.roundRect(105, 345, 160, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#6c5ce7";
    ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${res.total} ответов`, 185, 370);

    // 5. Right Column: Progress Rows (Promoters, Passives, Detractors)
    ctx.textAlign = "left"; // reset

    const drawRow = (y: number, title: string, count: number, pct: number, color: string, bgBadge: string, iconDraw: (c: CanvasRenderingContext2D, px: number, py: number) => void) => {
      // Row container background
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(370, y, 550, 116, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(241, 245, 249, 1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Icon circle
      ctx.fillStyle = bgBadge;
      ctx.beginPath();
      ctx.arc(420, y + 58, 24, 0, Math.PI * 2);
      ctx.fill();

      // Draw Icon
      iconDraw(ctx, 420, y + 58);

      // Title
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
      ctx.fillText(title, 465, y + 64);

      // Progress bar background
      ctx.fillStyle = "#f1f5f9";
      ctx.beginPath();
      ctx.roundRect(610, y + 54, 180, 8, 4);
      ctx.fill();

      // Progress bar active fill
      if (pct > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(610, y + 54, Math.round(180 * (pct / 100)), 8, 4);
        ctx.fill();
      }

      // Percentages and count
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${count} (${pct}%)`, 900, y + 64);
      ctx.textAlign = "left";
    };

    // Promoters Row (y = 120)
    drawRow(120, "Промоутеры", res.promoters, promotersPct, "#10b981", "#ecfdf5", (c, px, py) => {
      c.strokeStyle = "#10b981";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(px, py, 11, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#10b981";
      c.beginPath();
      c.arc(px - 4, py - 3, 1.5, 0, Math.PI * 2);
      c.arc(px + 4, py - 3, 1.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(px, py + 1, 6, 0, Math.PI);
      c.stroke();
    });

    // Passives Row (y = 252)
    drawRow(252, "Нейтралы", res.passives, passivesPct, "#f59e0b", "#fffbeb", (c, px, py) => {
      c.strokeStyle = "#f59e0b";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(px, py, 11, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#f59e0b";
      c.beginPath();
      c.arc(px - 4, py - 3, 1.5, 0, Math.PI * 2);
      c.arc(px + 4, py - 3, 1.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(px - 5, py + 3);
      c.lineTo(px + 5, py + 3);
      c.stroke();
    });

    // Detractors Row (y = 384)
    drawRow(384, "Критики", res.detractors, detractorsPct, "#ef4444", "#fef2f2", (c, px, py) => {
      c.strokeStyle = "#ef4444";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(px, py, 11, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#ef4444";
      c.beginPath();
      c.arc(px - 4, py - 3, 1.5, 0, Math.PI * 2);
      c.arc(px + 4, py - 3, 1.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(px, py + 7, 5, Math.PI, 0);
      c.stroke();
    });

    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
          setCopiedNpsId(idx);
          setTimeout(() => setCopiedNpsId(null), 2000);
        } catch (err) {
          console.error("Clipboard write error:", err);
          alert("Не удалось скопировать изображение в буфер обмена. Пожалуйста, сделайте скриншот.");
        }
      }
    }, "image/png");
  };

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
          customAnswers: (useScenarioBuilder && scenarioData) ? {
            ...scenarioData,
            day1Input: useDay1Input ? scenarioData.day1Input : { questionList: [], answers: [] },
            day1Output: useDay1Output ? scenarioData.day1Output : { questionList: [], answers: [] },
            day2: useDay2 ? scenarioData.day2 : { questionList: [], answers: [] }
          } : undefined
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
      const datePart = currentSession?.date || new Date().toISOString().split('T')[0];
      const filename = `${customReportName.trim() || block.title}_${datePart}`.replace(/[\\/:*?"<>|]/g, "_");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании файла.");
    }
  }

  function loadHtml2Pdf(): Promise<any> {
    return new Promise((resolve, reject) => {
      if ((window as any).html2pdf) {
        resolve((window as any).html2pdf);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => {
        resolve((window as any).html2pdf);
      };
      script.onerror = () => {
        reject(new Error("Не удалось загрузить библиотеку для генерации PDF."));
      };
      document.body.appendChild(script);
    });
  }

  async function handleDownloadPdfFallback(block: { id: string; title: string }, content: string) {
    const datePart = currentSession?.date || new Date().toISOString().split('T')[0];
    const filename = `${customReportName.trim() || block.title}_${datePart}`.replace(/[\\/:*?"<>|]/g, "_");

    const htmlContent = markdownToHtml(content);

    const element = document.createElement("div");
    element.innerHTML = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; background: #ffffff;">
        <style>
          h1 { font-size: 26px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; color: #0f172a; }
          h2 { font-size: 20px; font-weight: 700; margin-top: 28px; margin-bottom: 12px; color: #1e293b; }
          h3 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #334155; }
          ul { margin: 8px 0 16px 0; padding-left: 24px; }
          li { margin-bottom: 6px; list-style-type: disc; }
          p { margin: 8px 0; }
          strong { font-weight: 700; }
          hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
          table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; color:#1e293b; border:1px solid #e2e8f0; page-break-inside: avoid; }
          th { padding:10px 12px; text-align:left; font-weight:700; border:1px solid #e2e8f0; background-color:#f8fafc; }
          td { padding:8px 12px; border:1px solid #e2e8f0; }
        </style>
        ${htmlContent}
      </div>
    `;

    try {
      const html2pdf = await loadHtml2Pdf();
      const opt = {
        margin:       15,
        filename:     `${filename}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, logging: false, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при сохранении PDF через fallback.");
    }
  }

  async function handleDownloadPdf(block: { id: string; title: string }) {
    const content = runResult?.stageReports?.[block.id] ?? runResult?.reportMarkdown;
    if (!content) return;

    try {
      const response = await fetch("/api/analytics/download-pdf", {
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
        if (response.status === 412) {
          const errData = await response.json();
          if (errData.code === "LIBREOFFICE_NOT_FOUND") {
            console.warn("LibreOffice not found on server/local. Using client-side fallback...");
            await handleDownloadPdfFallback(block, content);
            return;
          }
        }
        throw new Error("Не удалось сгенерировать PDF файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const datePart = currentSession?.date || new Date().toISOString().split('T')[0];
      const filename = `${customReportName.trim() || block.title}_${datePart}`.replace(/[\\/:*?"<>|]/g, "_");

      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании PDF.");
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
        <div className="date-controls" style={{ marginBottom: "16px" }}>
          <div className="session-select-area" style={{ maxWidth: "260px" }}>
            <div className="session-select-trigger" style={{ cursor: "text", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "1px" }}>
              <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", lineHeight: "1.1" }}>Название</span>
              <input 
                type="text" 
                placeholder="Введи название..."
                value={customReportName}
                onChange={(e) => setCustomReportName(e.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  width: "100%",
                  fontSize: "14px",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontFamily: "inherit"
                }}
              />
            </div>
          </div>

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
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={useDay2}
                  onChange={(e) => setUseDay2(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
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
                  {hasDay2Block && useDay2 && scenarioData.day2 && (
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
                            {activeTable.answers.map((ans, idx: number) => {
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
                <div key={idx} className="panel" style={{ margin: "0 auto", padding: "24px", background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1px solid var(--line)", borderRadius: "16px", aspectRatio: "16 / 9", maxWidth: "800px", width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "40px", borderBottom: "1px solid rgba(226, 232, 240, 0.8)", paddingBottom: "12px", flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />
                      {res.label} ({formatDate(res.date)})
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="status-pill tone-success" style={{ fontSize: "11px", padding: "4px 12px", fontWeight: 700, borderRadius: "99px" }}>Расчет выполнен</span>
                      <button
                        type="button"
                        onClick={() => copyNpsToClipboard(res, idx)}
                        className="secondary-button"
                        style={{
                          height: "28px",
                          padding: "0 10px",
                          fontSize: "11px",
                          gap: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                          borderColor: copiedNpsId === idx ? "#10b981" : "var(--line)",
                          background: copiedNpsId === idx ? "#ecfdf5" : "#ffffff",
                          color: copiedNpsId === idx ? "#10b981" : "var(--text)",
                          transition: "all 0.2s"
                        }}
                        title="Скопировать изображение в буфер обмена"
                      >
                        {copiedNpsId === idx ? (
                          <>
                            <Check size={12} />
                            <span>Скопировано!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Копировать</span>
                          </>
                        )}
                      </button>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: "24px", alignItems: "stretch", flex: 1, marginTop: "20px", minHeight: 0 }}>
                    {/* Left Column: NPS Score */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", background: "#ffffff", border: "1px solid rgba(226, 232, 240, 0.8)", borderRadius: "16px", padding: "16px", boxSizing: "border-box" }}>
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
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", minHeight: 0, height: "100%" }}>
                      {/* Promoters Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "10px 16px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)", flex: 1, minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", width: "130px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", border: "1.5px solid #10b981", background: "#ecfdf5", color: "#10b981" }}>
                            <Smile size={14} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginLeft: "10px" }}>Промоутеры</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 16px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${promotersPct}%`, height: "100%", background: "#10b981", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
                          {res.promoters} ({promotersPct}%)
                        </div>
                      </div>

                      {/* Passives Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "10px 16px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)", flex: 1, minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", width: "130px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", border: "1.5px solid #f59e0b", background: "#fffbeb", color: "#f59e0b" }}>
                            <Meh size={14} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginLeft: "10px" }}>Нейтралы</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 16px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${passivesPct}%`, height: "100%", background: "#f59e0b", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
                          {res.passives} ({passivesPct}%)
                        </div>
                      </div>

                      {/* Detractors Row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid #f1f5f9", borderRadius: "12px", padding: "10px 16px", boxShadow: "0 2px 4px rgba(0,0,0,0.01)", flex: 1, minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", width: "130px", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", border: "1.5px solid #ef4444", background: "#fef2f2", color: "#ef4444" }}>
                            <Frown size={14} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginLeft: "10px" }}>Критики</span>
                        </div>
                        <div style={{ flex: 1, margin: "0 16px", height: "6px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${detractorsPct}%`, height: "100%", background: "#ef4444", borderRadius: "99px" }} />
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", width: "65px", textAlign: "right" }}>
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
                        {isStepSucceeded && (hasReport || step.id === "publish") && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {step.id === "publish" ? (
                              <>
                                {runResult?.notebookUrl && (
                                  <a 
                                    href={runResult.notebookUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="secondary-button" 
                                    style={{ 
                                      height: "36px", 
                                      padding: "0 14px", 
                                      fontSize: "13px", 
                                      gap: "6px", 
                                      display: "inline-flex", 
                                      alignItems: "center", 
                                      textDecoration: "none", 
                                      background: "#e6f4ea", 
                                      color: "#137333", 
                                      borderColor: "#10b981" 
                                    }}
                                  >
                                    <ExternalLink size={14} />
                                    Открыть блокнот
                                  </a>
                                )}
                              </>
                            ) : isInfographicImage ? (
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
                            background: runResult?.infographicImageUrl && isInfographicImage ? "#f8fafc" : "#ffffff",
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
