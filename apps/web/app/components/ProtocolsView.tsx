"use client";

import React, { useEffect, useMemo, useState, useRef, type Dispatch, type SetStateAction } from "react";
import {
  Download,
  Eye,
  Loader2,
  Play,
  Save,
  X,
  CheckCircle2
} from "lucide-react";
import { latestProtocolRun, type ProtocolRecord } from "@tools/protocols";
import type { ProcessRun } from "@tools/core";
import {
  formatTime,
  cx,
  StepIcon,
  MarkdownPreview,
  markdownToHtml,
  type RunStep
} from "../../lib/utils";

export default function ProtocolsView({
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [openPreviews, setOpenPreviews] = useState<Record<string, boolean>>({});
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const togglePreview = (stepId: string) => {
    setOpenPreviews((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };
  const [meetingFormat, setMeetingFormat] = useState<"regular" | "free">("regular");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [protocolTotalTime, setProtocolTotalTime] = useState(0);
  const [protocolExecutionTimes, setProtocolExecutionTimes] = useState<Record<string, number>>({});
  const protocolStageRef = useRef("");

  const dbParticipants = useMemo(() => ["Антон Актуганов", "Андрей Лебедев", "Софья Колесникова"], []);

  const [regularContexts, setRegularContexts] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("protocol_regular_contexts");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return {
      "Антон Актуганов": "Руководитель проекта",
      "Андрей Лебедев": "Ведущий архитектор",
      "Софья Колесникова": "Аналитик"
    };
  });

  const handleContextChange = (name: string, value: string) => {
    const next = { ...regularContexts, [name]: value };
    setRegularContexts(next);
    localStorage.setItem("protocol_regular_contexts", JSON.stringify(next));
  };

  const [customRoles, setCustomRoles] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("protocol_custom_roles");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return {};
  });

  const handleCustomRoleChange = (name: string, role: string) => {
    const next = { ...customRoles, [name]: role };
    setCustomRoles(next);
    localStorage.setItem("protocol_custom_roles", JSON.stringify(next));
  };

  const changeMeetingFormat = (format: "regular" | "free") => {
    setMeetingFormat(format);
    if (protocol) {
      const currentParts = protocol.participants || [];
      let nextParts = [...currentParts];
      if (format === "regular") {
        const missing = dbParticipants.filter(p => !currentParts.includes(p));
        nextParts = [...currentParts, ...missing];
      }
      const updated = protocols.map((item) => {
        if (item.id === selectedProtocolId) {
          return {
            ...item,
            meetingFormat: format,
            participants: nextParts
          };
        }
        return item;
      });
      setProtocols(updated);
      void saveProtocols(updated);
    }
  };

  const [chunksCount, setChunksCount] = useState<number | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState<string>("");
  const [extractingProgressText, setExtractingProgressText] = useState("Инициализация анализа текста...");

  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);

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
            participants: ["Антон Актуганов", "Андрей Лебедев", "Софья Колесникова"],
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

  const handlePublishToOpenNotebook = async () => {
    if (!protocol) return;
    
    setIsPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/protocols/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: protocol.id })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Не удалось опубликовать протокол.");
      }
      
      const resData = await response.json();
      
      // Update local status to published
      const updated = protocols.map((item) => {
        if (item.id === protocol.id) {
          return {
            ...item,
            status: "published" as const
          };
        }
        return item;
      });
      setProtocols(updated);
      
      // Update run steps to make "publish" succeeded
      setRunSteps((prevSteps) => {
        return prevSteps.map((step) => {
          if (step.id === "publish") {
            return {
              ...step,
              status: "succeeded" as const,
              description: `Протокол опубликован в Open Notebook`
            };
          }
          return step;
        });
      });
      
      alert(resData.message || "Протокол успешно опубликован!");
    } catch (err: any) {
      setError(err.message || String(err));
      alert(`Ошибка при публикации: ${err.message || String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const protocol = protocols.find((item) => item.id === selectedProtocolId);

  useEffect(() => {
    if (protocol) {
      if (protocol.meetingFormat) {
        setMeetingFormat(protocol.meetingFormat);
      } else {
        const parts = protocol.participants || [];
        const containsAll = dbParticipants.every(p => parts.includes(p));
        setMeetingFormat(containsAll ? "regular" : "free");
      }
    }
  }, [selectedProtocolId]);

  const handleReset = () => {
    setSelectedFile(null);
    setChunksCount(null);
    setMediaDuration(null);
    setError(null);
    setProgressMessage("");
    setUploadProgress(null);
    setHasRunStarted(false);
    setProtocolTotalTime(0);
    setProtocolExecutionTimes({});
    
    if (protocol) {
      const updated = protocols.map((item) => {
        if (item.id === selectedProtocolId) {
          return {
            ...item,
            title: "Новый протокол встречи",
            date: new Date().toISOString().substring(0, 10),
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
            status: "draft" as const,
            participants: meetingFormat === "regular" ? dbParticipants : []
          };
        }
        return item;
      });
      setProtocols(updated);
      void saveProtocols(updated);
    }
  };

  const parseFileNameMetadata = (fileName: string) => {
    const dotDmyRegex = /(\d{2})\.(\d{2})\.(\d{4})/;
    const dashDmyRegex = /(\d{2})-(\d{2})-(\d{4})/;
    const ymdRegex = /(\d{4})-(\d{2})-(\d{2})/;
    
    let dateStr = "";
    let displayDateStr = "";
    
    let match = fileName.match(dotDmyRegex);
    if (match) {
      dateStr = `${match[3]}-${match[2]}-${match[1]}`;
      displayDateStr = `${match[1]}.${match[2]}.${match[3]}`;
    } else {
      match = fileName.match(dashDmyRegex);
      if (match) {
        dateStr = `${match[3]}-${match[2]}-${match[1]}`;
        displayDateStr = `${match[1]}.${match[2]}.${match[3]}`;
      } else {
        match = fileName.match(ymdRegex);
        if (match) {
          dateStr = match[0];
          displayDateStr = `${match[3]}.${match[2]}.${match[1]}`;
        }
      }
    }
    
    if (!dateStr) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      dateStr = `${yyyy}-${mm}-${dd}`;
      displayDateStr = `${dd}.${mm}.${yyyy}`;
    }
    
    const autoTitle = `Протокол встречи от ${displayDateStr}`;
    return { dateStr, autoTitle };
  };

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
          { id: "source", title: "Подготовка файла", description: "Файл успешно подготовлен и загружен в Google Cloud", status: "succeeded" },
          { id: "transcribe", title: "Подготовка стенограммы", description: hasTranscript ? "Стенограмма успешно подготовлена" : "Ожидание подготовки...", status: hasTranscript ? "succeeded" : "pending" },
          { id: "extract", title: "Подготовка протокола", description: hasProtocol ? "Протокол встречи подготовлен" : "Ожидание подготовки...", status: hasProtocol ? "succeeded" : "pending" },
          { 
            id: "publish", 
            title: "Публикация в Open Notebook", 
            description: protocol.status === "published" ? "Протокол опубликован в Open Notebook" : "Ожидает публикации", 
            status: protocol.status === "published" ? "succeeded" as const : "pending" as const
          }
        ]);
      } else if (selectedFile) {
        setHasRunStarted(true);
        const partsText = chunksCount !== null ? "Файл выбран. Готов к загрузке в Google Cloud" : "Определение параметров файла...";
        setRunSteps([
          { id: "source", title: "Подготовка файла", description: partsText, status: "pending" },
          { id: "transcribe", title: "Подготовка стенограммы", description: "Ожидание запуска", status: "pending" },
          { id: "extract", title: "Подготовка протокола", description: "Ожидание запуска", status: "pending" },
          { id: "publish", title: "Публикация в Open Notebook", description: "Ожидание запуска", status: "pending" }
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

    const { dateStr, autoTitle } = parseFileNameMetadata(file.name);
    if (protocol) {
      const updated = protocols.map((item) => {
        if (item.id === selectedProtocolId) {
          return {
            ...item,
            date: dateStr,
            title: autoTitle
          };
        }
        return item;
      });
      setProtocols(updated);
      void saveProtocols(updated);
    }

    const objectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video");
    const media = document.createElement(isVideo ? "video" : "audio");
    media.src = objectUrl;

    media.onloadedmetadata = () => {
      const duration = media.duration;
      if (duration && !isNaN(duration)) {
        setMediaDuration(duration);
        const count = Math.ceil(duration / 900); // 15 минут = 900 секунд
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

  const cleanupLocalStorage = (targetProtocolId: string) => {
    localStorage.removeItem(`active_protocol_job_id_${targetProtocolId}`);
    localStorage.removeItem(`active_protocol_start_time_${targetProtocolId}`);
    localStorage.removeItem(`active_protocol_has_file_${targetProtocolId}`);
  };

  const pollProtocolJob = async (jobId: number, targetProtocolId: string) => {
    const savedStart = localStorage.getItem(`active_protocol_start_time_${targetProtocolId}`);
    const startTime = savedStart ? parseInt(savedStart, 10) : Date.now();
    const hasFile = localStorage.getItem(`active_protocol_has_file_${targetProtocolId}`) === "true";

    setIsGenerating(true);
    setHasRunStarted(true);
    setError(null);

    const timerInterval = setInterval(() => {
      const now = Date.now();
      const secs = Math.max(1, Math.round((now - startTime) / 1000));
      setProtocolTotalTime(secs);

      setProtocolExecutionTimes((prev) => {
        let activeStep = "";
        const stage = protocolStageRef.current;
        if (!stage) {
          activeStep = hasFile ? "source" : "extract";
        } else if (stage === "upload" || stage === "convert" || stage === "google_upload") {
          activeStep = "source";
        } else if (stage === "transcribe") {
          activeStep = "transcribe";
        } else if (stage === "extract" || stage === "save") {
          activeStep = "extract";
        }
        
        if (activeStep) {
          return {
            ...prev,
            [activeStep]: (prev[activeStep] || 0) + 1
          };
        }
        return prev;
      });
    }, 1000);

    try {
      let isDone = false;
      let lastTranscript = "";
      while (!isDone) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const checkRes = await fetch(`/api/jobs?id=${jobId}`);
        if (!checkRes.ok) {
          throw new Error(`Ошибка опроса статуса задачи ${jobId}`);
        }
        const job = await checkRes.json();

        if (job.status === "failed") {
          throw new Error(job.message || job.error || "Ошибка генерации протокола.");
        }

        if (job.message) {
          setProgressMessage(job.message);
        }
        if (typeof job.progress === "number") {
          setUploadProgress(job.progress);
        }

        let stage = "queued";
        if (job.progress >= 85) stage = "extract";
        else if (job.progress >= 80) stage = "transcribe";
        else if (job.progress >= 50) stage = "google_upload";
        else if (job.progress >= 15) stage = "convert";
        else if (job.progress >= 10) stage = "upload";

        setCurrentStage(stage);
        protocolStageRef.current = stage;

        if (job.result) {
          try {
            const resData = JSON.parse(job.result);
            const currentTranscript = resData.currentTranscript || resData.finalTranscript;
            if (currentTranscript && currentTranscript !== lastTranscript) {
              lastTranscript = currentTranscript;
              setProtocols((prevProtocols) => prevProtocols.map((item) => {
                if (item.id === targetProtocolId) {
                  return { ...item, transcript: currentTranscript };
                }
                return item;
              }));
            }
          } catch {}
        }

        setRunSteps((prevSteps) => {
          const steps = prevSteps.length > 0 ? prevSteps : [
            { id: "source", title: "Подготовка файла", description: hasFile ? "Обработка файла..." : "Использована готовая стенограмма", status: hasFile ? "pending" as const : "succeeded" as const },
            { id: "transcribe", title: "Подготовка стенограммы", description: hasFile ? "Ожидание распознавания речи..." : "Стенограмма взята из черновика", status: hasFile ? "pending" as const : "succeeded" as const },
            { id: "extract", title: "Подготовка протокола", description: "Ожидание выделения структуры...", status: "pending" as const },
            { id: "publish", title: "Публикация в Open Notebook", description: "Ожидание завершения генерации...", status: "pending" as const }
          ];

          return steps.map((step) => {
            if (stage === "upload" || stage === "convert" || stage === "google_upload") {
              if (step.id === "source") return { ...step, status: "running" as const, description: job.message || "Обработка и загрузка файла..." };
            }
            if (stage === "transcribe") {
              if (step.id === "source") return { ...step, status: "succeeded" as const, description: "Файл успешно подготовлен и загружен в Google Cloud" };
              if (step.id === "transcribe") return { ...step, status: "running" as const, description: job.message || "Распознавание речи..." };
            }
            if (stage === "extract" || stage === "save" || job.status === "succeeded") {
              if (step.id === "source") return { ...step, status: "succeeded" as const, description: "Файл успешно подготовлен и загружен в Google Cloud" };
              if (step.id === "transcribe") return { ...step, status: "succeeded" as const, description: "Стенограмма встречи готова" };
              if (step.id === "extract") {
                if (job.status === "succeeded") return { ...step, status: "succeeded" as const, description: "Протокол встречи подготовлен" };
                return { ...step, status: "running" as const, description: job.message || "Извлечение структуры протокола..." };
              }
            }
            return step;
          });
        });

        if (job.status === "succeeded") {
          const resData = JSON.parse(job.result);
          const ext = resData.extractedData;
          const finalTranscript = resData.finalTranscript || "";

          const decisionsCount = ext.decisionsText
            ? ext.decisionsText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
            : 0;
          const tasksCount = ext.tasksText
            ? ext.tasksText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))).length
            : 0;

          setProtocols((currentProtocols) => {
            const updated = currentProtocols.map((item) => {
              if (item.id === targetProtocolId) {
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
            void saveProtocols(updated);
            return updated;
          });

          setRunSteps([
            { id: "source", title: "Подготовка файла", description: "Файл успешно подготовлен и загружен в Google Cloud", status: "succeeded" },
            { id: "transcribe", title: "Подготовка стенограммы", description: "Стенограмма успешно подготовлена", status: "succeeded" },
            { id: "extract", title: "Подготовка протокола", description: "Протокол встречи подготовлен", status: "succeeded" },
            { id: "publish", title: "Публикация в Open Notebook", description: "Ожидает публикации", status: "pending" }
          ]);

          setSelectedFile(null);
          isDone = true;
          cleanupLocalStorage(targetProtocolId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Не удалось сгенерировать протокол.";
      setError(errorMessage);
      setProgressMessage("Ошибка генерации");
      setRunSteps((prevSteps) => prevSteps.map((s) => s.status === "running" ? { ...s, status: "failed" as const, description: "Сбой операции" } : s));
      cleanupLocalStorage(targetProtocolId);
    } finally {
      clearInterval(timerInterval);
      setIsGenerating(false);
      setUploadProgress(null);
      setCurrentStage("");
      protocolStageRef.current = "";
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && protocol) {
      const activeJobIdStr = localStorage.getItem(`active_protocol_job_id_${protocol.id}`);
      if (activeJobIdStr) {
        const jobId = parseInt(activeJobIdStr, 10);
        if (!isNaN(jobId) && !isGenerating) {
          void pollProtocolJob(jobId, protocol.id);
        }
      }
    }
  }, [selectedProtocolId, protocol]);

  const handleRegenerate = async () => {
    if (!protocol) return;

    setProtocols((prev) =>
      prev.map((item) => {
        if (item.id === selectedProtocolId) {
          return {
            ...item,
            theme: "",
            transcript: "",
            decisions: 0,
            actionItems: 0,
            status: "draft" as const
          };
        }
        return item;
      })
    );

    setIsGenerating(true);
    setError(null);
    setHasRunStarted(true);
    setProtocolTotalTime(0);
    setProtocolExecutionTimes({});
    protocolStageRef.current = "";

    if (selectedFile) {
      setProgressMessage("Подготовка файла...");
      setUploadProgress(5);
      setOpenPreviews({ transcribe: true });
      setRunSteps([
        { id: "source", title: "Подготовка файла", description: "Сохранение и оптимизация файла...", status: "running" },
        { id: "transcribe", title: "Подготовка стенограммы", description: "Ожидание распознавания речи...", status: "pending" },
        { id: "extract", title: "Подготовка протокола", description: "Ожидание выделения структуры...", status: "pending" },
        { id: "publish", title: "Публикация в Open Notebook", description: "Ожидание завершения генерации...", status: "pending" }
      ]);
    } else {
      setProgressMessage("Анализ готовой стенограммы встречи...");
      setUploadProgress(40);
      setOpenPreviews({ extract: true });
      setRunSteps([
        { id: "source", title: "Подготовка файла", description: "Использована готовая стенограмма", status: "succeeded" },
        { id: "transcribe", title: "Подготовка стенограммы", description: "Стенограмма взята из черновика", status: "succeeded" },
        { id: "extract", title: "Подготовка протокола", description: "Выделение ИИ структуры протокола...", status: "running" },
        { id: "publish", title: "Публикация в Open Notebook", description: "Ожидание завершения генерации...", status: "pending" }
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
      const promptKey = meetingFormat === "regular" ? "protocol.regular.meeting" : "protocol.meeting";
      const promptText = promptSettings[promptKey] || "";
      const transcriptPromptText = promptSettings["protocol.transcript"] || "";
      
      const dateInfo = protocol.date 
        ? `\nДата встречи: ${protocol.date}.` 
        : "";
      
      let participantsInfo = "";
      if (protocol.participants && protocol.participants.length > 0) {
        const partsWithContext = protocol.participants.map(p => {
          let context = "";
          if (meetingFormat === "regular") {
            context = regularContexts[p] || customRoles[p] || "";
          } else {
            context = customRoles[p] || "";
          }
          return context ? `${p} (${context})` : p;
        });
        participantsInfo = `\nПрисутствовали на встрече: ${partsWithContext.join(", ")}.`;
      }
      
      const metadataAddon = `\n\n[Метаданные встречи для включения в протокол]:${dateInfo}${participantsInfo}\nОбязательно укажи эту дату и точный состав участников в начале сгенерированного протокола. Также учти контекст/роль каждого участника при распределении задач и описании тезисов.`;
        
      const fullPromptText = promptText + metadataAddon;
      const fullTranscriptPromptText = transcriptPromptText + (protocol.participants && protocol.participants.length > 0 
        ? `\n\nСписок участников встречи для сопоставления спикеров: ${protocol.participants.join(", ")}.`
        : "");
      
      let response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("protocolId", protocol.id);
        formData.append("prompt", fullPromptText);
        formData.append("transcriptPrompt", fullTranscriptPromptText);

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
            prompt: fullPromptText,
            transcript: protocol.transcript,
            transcriptPrompt: fullTranscriptPromptText
          })
        });
      }

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const runInit = await response.json();
      const { jobId } = runInit;

      localStorage.setItem(`active_protocol_job_id_${protocol.id}`, String(jobId));
      localStorage.setItem(`active_protocol_start_time_${protocol.id}`, String(Date.now()));
      localStorage.setItem(`active_protocol_has_file_${protocol.id}`, selectedFile ? "true" : "false");

      void pollProtocolJob(jobId, protocol.id);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Не удалось сгенерировать протокол.";
      setError(errorMessage);
      setProgressMessage("Ошибка генерации");
      setIsGenerating(false);
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

  const handleDownloadProtocolPdfFallback = (p: ProtocolRecord) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Пожалуйста, разрешите всплывающие окна для экспорта PDF.");
      return;
    }

    const title = p.title || "Протокол встречи";
    const date = p.date ? new Date(p.date).toLocaleDateString("ru-RU") : "";
    const participants = p.participants?.join(", ") || "";
    const htmlContent = markdownToHtml(p.theme || "");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
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
            table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; color:#1e293b; border:1px solid #e2e8f0; }
            th { padding:10px 12px; text-align:left; font-weight:700; border:1px solid #e2e8f0; background-color:#f8fafc; }
            td { padding:8px 12px; border:1px solid #e2e8f0; }
            @media print { body { padding: 20px; } button { display: none; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p><strong>Дата встречи:</strong> ${date}</p>
          <p><strong>Участники:</strong> ${participants}</p>
          <hr />
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
  };

  const handleDownloadTranscriptPdfFallback = (p: ProtocolRecord) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Пожалуйста, разрешите всплывающие окна для экспорта PDF.");
      return;
    }

    const title = `Стенограмма встречи: ${p.title || "Новый протокол"}`;
    const contentHtml = p.transcript ? p.transcript.replace(/\n/g, "<br />") : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; background: #ffffff; }
            h1 { font-size: 24px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; color: #0f172a; }
            body { font-size: 14px; color: #334155; }
            @media print { body { padding: 20px; } button { display: none; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div>${contentHtml}</div>
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
  };

  const handleDownloadProtocolPdf = async () => {
    if (!protocol) return;

    try {
      const response = await fetch("/api/protocols/download-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(protocol)
      });

      if (!response.ok) {
        if (response.status === 412) {
          const errData = await response.json();
          if (errData.code === "LIBREOFFICE_NOT_FOUND") {
            console.warn("LibreOffice not found on server/local. Using print fallback...");
            handleDownloadProtocolPdfFallback(protocol);
            return;
          }
        }
        throw new Error("Не удалось сгенерировать PDF файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeFilename = (protocol.title || "protocol").toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_");
      link.download = `${safeFilename}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании PDF.");
    }
  };

  const handleDownloadTranscriptPdf = async () => {
    if (!protocol?.transcript) return;

    try {
      const response = await fetch("/api/analytics/download-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Стенограмма встречи: ${protocol.title || "Новый протокол"}`,
          markdown: protocol.transcript
        })
      });

      if (!response.ok) {
        if (response.status === 412) {
          const errData = await response.json();
          if (errData.code === "LIBREOFFICE_NOT_FOUND") {
            console.warn("LibreOffice not found on server/local. Using print fallback...");
            handleDownloadTranscriptPdfFallback(protocol);
            return;
          }
        }
        throw new Error("Не удалось сгенерировать PDF файл.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeFilename = (protocol.title || "protocol").toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "_");
      link.download = `${safeFilename}-transcript.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка при скачивании PDF.");
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
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                  Название встречи
                  <input
                    value={protocol.title || ""}
                    onChange={(e) => handleFieldChange("title", e.target.value)}
                    placeholder="Заполнить название"
                    style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", background: "var(--bg-card)", color: "var(--text)" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                  Дата встречи
                  <input
                    type="date"
                    value={protocol.date || ""}
                    onChange={(e) => handleFieldChange("date", e.target.value)}
                    style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", background: "var(--bg-card)", color: "var(--text)" }}
                  />
                </label>
              </div>

              {/* Двухколоночный макет для участников и загрузки */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", marginBottom: "16px" }}>
                {/* Левая колонка: Участники встречи */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--panel-strong, #f8fafc)", border: "1px solid var(--line, #e2e8f0)", borderRadius: "12px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text, #0f172a)", display: "flex", alignItems: "center", gap: "6px" }}>
                    👤 Участники встречи
                  </span>

                  {/* Вкладки формата встреч */}
                  <div style={{ display: "flex", borderBottom: "1px solid var(--line)", paddingBottom: "8px", marginBottom: "4px" }}>
                    <button
                      type="button"
                      onClick={() => changeMeetingFormat("regular")}
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: meetingFormat === "regular" ? "var(--accent)" : "var(--muted)",
                        borderBottom: meetingFormat === "regular" ? "2px solid var(--accent)" : "none",
                        background: "none",
                        cursor: "pointer"
                      }}
                    >
                      Регулярная встреча
                    </button>
                    <button
                      type="button"
                      onClick={() => changeMeetingFormat("free")}
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: meetingFormat === "free" ? "var(--accent)" : "var(--muted)",
                        borderBottom: meetingFormat === "free" ? "2px solid var(--accent)" : "none",
                        background: "none",
                        cursor: "pointer"
                      }}
                    >
                      Обычная встреча
                    </button>
                  </div>
                  
                  {meetingFormat === "regular" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted, #64748b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Участники регулярной встречи и их контекст/роль:
                      </span>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dbParticipants.map((p) => {
                          const isSelected = (protocol?.participants || []).includes(p);
                          return (
                            <div key={p} style={{ display: "grid", gridTemplateColumns: "160px 1fr", alignItems: "center", gap: "12px", padding: "8px", background: isSelected ? "#e6f4ea" : "#ffffff", border: "1px solid var(--line)", borderRadius: "8px" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    const next = (protocol?.participants || []).filter(item => item !== p);
                                    handleFieldChange("participants", next.join(", "));
                                  } else {
                                    const next = [...(protocol?.participants || []), p];
                                    handleFieldChange("participants", next.join(", "));
                                  }
                                }}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "6px 12px",
                                  borderRadius: "99px",
                                  border: isSelected ? "1.5px solid #10b981" : "1.5px solid var(--line, #cbd5e1)",
                                  background: isSelected ? "#ffffff" : "#f1f5f9",
                                  color: isSelected ? "#137333" : "var(--text, #334155)",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  textAlign: "left"
                                }}
                              >
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isSelected ? "#10b981" : "#94a3b8" }} />
                                {p}
                              </button>
                              
                              <input
                                type="text"
                                value={regularContexts[p] || ""}
                                onChange={(e) => handleContextChange(p, e.target.value)}
                                placeholder="Роль (например: Ведущий, Разработчик)"
                                disabled={!isSelected}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: "12.5px",
                                  border: "1px solid var(--line, #cbd5e1)",
                                  borderRadius: "6px",
                                  background: isSelected ? "#ffffff" : "#f8fafc",
                                  color: isSelected ? "var(--text)" : "var(--muted)",
                                  opacity: isSelected ? 1 : 0.6
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Возможность добавить другого участника (дополнительного к регулярной встрече) */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px dashed var(--line, #e2e8f0)", paddingTop: "10px" }}>
                        <span style={{ fontSize: "11px", color: "var(--muted, #64748b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Добавить другого участника:</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input 
                            type="text"
                            placeholder="Введите ФИО и нажмите Enter..."
                            value={newParticipantName}
                            onChange={(e) => setNewParticipantName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const name = newParticipantName.trim();
                                if (name && protocol) {
                                  const current = protocol.participants || [];
                                  if (!current.includes(name)) {
                                    const next = [...current, name];
                                    handleFieldChange("participants", next.join(", "));
                                  }
                                  setNewParticipantName("");
                                }
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              fontSize: "13px",
                              border: "1px solid var(--line, #cbd5e1)",
                              borderRadius: "8px",
                              background: "#ffffff",
                              color: "var(--text, #0f172a)"
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const name = newParticipantName.trim();
                              if (name && protocol) {
                                const current = protocol.participants || [];
                                if (!current.includes(name)) {
                                  const next = [...current, name];
                                  handleFieldChange("participants", next.join(", "));
                                }
                                setNewParticipantName("");
                              }
                            }}
                            style={{
                              padding: "0 14px",
                              background: "#10b981",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: 700
                            }}
                          >
                            Добавить
                          </button>
                        </div>
                      </div>

                      {/* Дополнительные участники с ролями */}
                      {protocol.participants.filter(p => !dbParticipants.includes(p)).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px", borderTop: "1px dashed var(--line, #e2e8f0)", paddingTop: "8px" }}>
                          <span style={{ fontSize: "11px", color: "var(--muted, #64748b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Дополнительные участники и их роли:
                          </span>
                          {protocol.participants.filter(p => !dbParticipants.includes(p)).map((p) => (
                            <div key={p} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", alignItems: "center", gap: "12px", padding: "8px", background: "#f1f5f9", border: "1px solid var(--line)", borderRadius: "8px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", paddingLeft: "12px" }}>
                                👤 {p}
                              </span>
                              <input
                                type="text"
                                value={customRoles[p] || ""}
                                onChange={(e) => handleCustomRoleChange(p, e.target.value)}
                                placeholder="Роль (например: Разработчик)"
                                style={{
                                  padding: "6px 10px",
                                  fontSize: "12.5px",
                                  border: "1px solid var(--line, #cbd5e1)",
                                  borderRadius: "6px",
                                  background: "#ffffff",
                                  color: "var(--text)"
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (protocol?.participants || []).filter(item => item !== p);
                                  handleFieldChange("participants", next.join(", "));
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--red)",
                                  fontWeight: "bold",
                                  padding: "0 8px"
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted, #64748b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Обычная встреча (нет закрепленных участников):
                      </span>
                      
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input 
                          type="text"
                          placeholder="Введите ФИО участника и нажмите Enter..."
                          value={newParticipantName}
                          onChange={(e) => setNewParticipantName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const name = newParticipantName.trim();
                              if (name && protocol) {
                                const current = protocol.participants || [];
                                if (!current.includes(name)) {
                                  const next = [...current, name];
                                  handleFieldChange("participants", next.join(", "));
                                }
                                setNewParticipantName("");
                              }
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            fontSize: "13px",
                            border: "1px solid var(--line, #cbd5e1)",
                            borderRadius: "8px",
                            background: "#ffffff",
                            color: "var(--text, #0f172a)"
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const name = newParticipantName.trim();
                            if (name && protocol) {
                              const current = protocol.participants || [];
                              if (!current.includes(name)) {
                                  const next = [...current, name];
                                  handleFieldChange("participants", next.join(", "));
                              }
                              setNewParticipantName("");
                            }
                          }}
                          style={{
                            padding: "0 14px",
                            background: "#10b981",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 700
                          }}
                        >
                          Добавить
                        </button>
                      </div>

                      {/* Список участников с полями ввода ролей */}
                      {(protocol?.participants || []).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                          {protocol.participants.map((p) => (
                            <div key={p} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", alignItems: "center", gap: "12px", padding: "8px", background: "#f1f5f9", border: "1px solid var(--line)", borderRadius: "8px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", paddingLeft: "12px" }}>
                                👤 {p}
                              </span>
                              <input
                                type="text"
                                value={customRoles[p] || ""}
                                onChange={(e) => handleCustomRoleChange(p, e.target.value)}
                                placeholder="Роль (например: Аналитик, Заказчик)"
                                style={{
                                  padding: "6px 10px",
                                  fontSize: "12.5px",
                                  border: "1px solid var(--line, #cbd5e1)",
                                  borderRadius: "6px",
                                  background: "#ffffff",
                                  color: "var(--text)"
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (protocol?.participants || []).filter(item => item !== p);
                                  handleFieldChange("participants", next.join(", "));
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--red)",
                                  fontWeight: "bold",
                                  padding: "0 8px"
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Список всех выбранных на эту встречу */}
                  {(protocol?.participants || []).length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px dashed var(--line, #e2e8f0)", paddingTop: "10px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted, #64748b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Выбрано для протокола ({protocol.participants.length}):</span>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {protocol.participants.map((p) => {
                          let context = "";
                          if (meetingFormat === "regular") {
                            context = regularContexts[p] || customRoles[p] || "";
                          } else {
                            context = customRoles[p] || "";
                          }
                          const displayText = context ? `${p} (${context})` : p;
                          return (
                            <span 
                              key={p} 
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 10px",
                                background: "#f1f5f9",
                                border: "1px solid #e2e8f0",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 500,
                                color: "#334155"
                              }}
                            >
                              {displayText}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (protocol?.participants || []).filter(item => item !== p);
                                  handleFieldChange("participants", next.join(", "));
                                }}
                                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", color: "#94a3b8", fontSize: "12px", fontWeight: "bold" }}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Правая колонка: компактный блок загрузки файла */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--panel-strong, #f8fafc)", border: "1px solid var(--line, #e2e8f0)", borderRadius: "12px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text, #0f172a)", display: "flex", alignItems: "center", gap: "6px" }}>
                    🎙️ Запись встречи
                  </span>
                  <div 
                    style={{ 
                      border: "1.5px dashed var(--line, #cbd5e1)", 
                      borderRadius: "10px",
                      padding: "16px",
                      textAlign: "center",
                      background: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      cursor: "pointer",
                      height: "100%",
                      minHeight: "120px",
                      transition: "border-color 0.2s, background-color 0.2s"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.backgroundColor = "#f0fdf4"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line, #cbd5e1)"; e.currentTarget.style.backgroundColor = "#ffffff"; }}
                    onClick={() => document.getElementById("audio-video-upload")?.click()}
                  >
                    <div style={{ background: "#e6f4ea", borderRadius: "50%", width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Download size={20} style={{ color: "#10b981" }} />
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text, #334155)" }}>
                      {selectedFile ? selectedFile.name : <>Перетащите файл или <span style={{ color: "#10b981", textDecoration: "underline" }}>выберите</span></>}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--muted, #64748b)" }}>
                      {selectedFile 
                        ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Заменить` 
                        : "MP4, MP3, WAV, M4A и др."
                      }
                    </span>
                    
                    {selectedFile && mediaDuration && (
                      <span style={{ fontSize: "11.5px", color: "#137333", fontWeight: 600, background: "#e6f4ea", padding: "2px 8px", borderRadius: "4px" }}>
                        {`⏱️ ${Math.floor(mediaDuration / 60)} мин ${Math.round(mediaDuration % 60)} сек`}
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
                </div>
              </div>

              {/* Кнопки управления */}
              <div style={{ display: "flex", gap: "16px", marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
                <button
                  type="button"
                  className="primary-button"
                  disabled={isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))}
                  onClick={handleRegenerate}
                  style={{ 
                    flex: 1,
                    height: "46px", 
                    fontSize: "14px", 
                    fontWeight: 600,
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px",
                    borderRadius: "8px",
                    background: "#10b981",
                    borderColor: "#10b981",
                    color: "#ffffff",
                    cursor: (isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))) ? "not-allowed" : "pointer",
                    opacity: (isGenerating || (!selectedFile && !(protocol?.transcript && protocol.transcript.trim()))) ? 0.5 : 1
                  }}
                >
                  <Play size={16} />
                  Запустить
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{ 
                    height: "46px", 
                    padding: "0 28px",
                    fontSize: "14px", 
                    fontWeight: 600,
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--line)",
                    background: "#ffffff",
                    color: "var(--text)",
                    cursor: "pointer"
                  }}
                >
                  Сбросить
                </button>
              </div>
                
              {isGenerating && progressMessage && (
                <div style={{ 
                  background: "var(--bg)", 
                  border: "1px solid var(--line)", 
                  borderRadius: "var(--border-radius)", 
                  padding: "12px 16px",
                  marginTop: "4px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 600 }}>
                      {currentStage === "extract" ? extractingProgressText : progressMessage}
                    </span>
                    {uploadProgress !== null && <span>{uploadProgress}%</span>}
                  </div>
                  {uploadProgress !== null && (
                    <div style={{ height: "6px", background: "var(--line)", borderRadius: "99px", overflow: "hidden" }}>
                      <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--green)", transition: "width 0.3s ease" }} />
                    </div>
                  )}
                </div>
              )}

              {/* Ход выполнения */}
              {(() => {
                if (!hasRunStarted) return null;
                const visibleSteps = (isGenerating || selectedFile)
                  ? runSteps
                  : runSteps.filter((step) => step.status === "succeeded");
                if (visibleSteps.length === 0) return null;
                return (
                  <section className="execution-panel panel" style={{ marginTop: "8px", padding: "16px 20px" }}>
                    <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <h2 style={{ fontSize: "15px", fontWeight: 700 }}>Ход выполнения</h2>
                      </div>
                      {protocolTotalTime > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(14, 165, 233, 0.15)", border: "1px solid rgba(14, 165, 233, 0.3)", borderRadius: "99px", padding: "6px 14px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Общее время:</span>
                          <strong style={{ fontSize: "14px", fontWeight: 800, color: "var(--primary)" }}>{formatTime(protocolTotalTime)}</strong>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {visibleSteps.map((step) => {
                        const isStepSucceeded = step.status === "succeeded";
                        const hasPreviewContent = step.id === "transcribe" ? Boolean(protocol.transcript) : step.id === "extract" ? Boolean(protocol.theme) : false;
                        return (
                          <div key={step.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div 
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
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                {step.status === "running" && protocolExecutionTimes[step.id] !== undefined && (
                                  <span style={{ 
                                    fontSize: "11px", 
                                    color: "var(--primary)", 
                                    fontWeight: 700, 
                                    background: "rgba(14, 165, 233, 0.1)",
                                    padding: "4px 10px",
                                    borderRadius: "6px"
                                  }}>
                                    {formatTime(protocolExecutionTimes[step.id])}
                                  </span>
                                )}
                                {isStepSucceeded && (
                                  step.id === "transcribe" ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      <button 
                                        type="button"
                                        className="secondary-button" 
                                        style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                        onClick={handleDownloadTranscriptDocx}
                                      >
                                        <Download size={12} />
                                        Скачать DOCX
                                      </button>
                                      <button 
                                        type="button"
                                        className="secondary-button" 
                                        style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                        onClick={handleDownloadTranscriptPdf}
                                      >
                                        <Download size={12} />
                                        Скачать PDF
                                      </button>
                                      {hasPreviewContent && (
                                        <button 
                                          type="button"
                                          className={cx("secondary-button", openPreviews[step.id] && "primary-button")} 
                                          style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                          onClick={() => togglePreview(step.id)}
                                        >
                                          <Eye size={12} />
                                          Превью
                                        </button>
                                      )}
                                    </div>
                                  ) : step.id === "extract" ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      <button 
                                        type="button"
                                        className="secondary-button" 
                                        style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                        onClick={handleDownloadDocx}
                                      >
                                        <Download size={12} />
                                        Скачать DOCX
                                      </button>
                                      <button 
                                        type="button"
                                        className="secondary-button" 
                                        style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                        onClick={handleDownloadProtocolPdf}
                                      >
                                        <Download size={12} />
                                        Скачать PDF
                                      </button>
                                      <button 
                                        type="button"
                                        disabled={isPublishing || protocol.status === "published"}
                                        className={cx("secondary-button", protocol.status === "published" && "succeeded")}
                                        style={{ 
                                          height: "32px", 
                                          padding: "0 12px", 
                                          fontSize: "12px", 
                                          gap: "6px", 
                                          cursor: (isPublishing || protocol.status === "published") ? "not-allowed" : "pointer",
                                          background: protocol.status === "published" ? "#e6f4ea" : undefined,
                                          color: protocol.status === "published" ? "#137333" : undefined,
                                          borderColor: protocol.status === "published" ? "#10b981" : undefined
                                        }}
                                        onClick={handlePublishToOpenNotebook}
                                      >
                                        {isPublishing ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <CheckCircle2 size={12} />
                                        )}
                                        {protocol.status === "published" ? "Опубликовано" : "Опубликовать"}
                                      </button>
                                      {hasPreviewContent && (
                                        <button 
                                          type="button"
                                          className={cx("secondary-button", openPreviews[step.id] && "primary-button")} 
                                          style={{ height: "32px", padding: "0 12px", fontSize: "12px", gap: "6px", cursor: "pointer" }}
                                          onClick={() => togglePreview(step.id)}
                                        >
                                          <Eye size={12} />
                                          Превью
                                        </button>
                                      )}
                                    </div>
                                  ) : null
                                )}
                              </div>
                            </div>

                            {/* Expanded Preview Panel */}
                            {openPreviews[step.id] && hasPreviewContent && (
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
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Превью результата: {step.title}
                                  </span>
                                  <button
                                    className="secondary-button"
                                    style={{ height: "30px", padding: "0 12px", fontSize: "12px", gap: "6px" }}
                                    onClick={() => {
                                      const textToCopy = step.id === "transcribe" ? (protocol.transcript || "") : (protocol.theme || "");
                                      void navigator.clipboard.writeText(textToCopy);
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
                                </div>
                                
                                {step.id === "transcribe" ? (
                                  <textarea
                                    style={{
                                      padding: "16px",
                                      background: "#ffffff",
                                      borderRadius: "8px",
                                      border: "1px solid var(--line)",
                                      fontSize: "13px",
                                      lineHeight: "1.6",
                                      minHeight: "400px",
                                      maxHeight: "600px",
                                      width: "100%",
                                      color: "var(--text)",
                                      fontFamily: "monospace",
                                      resize: "vertical"
                                    }}
                                    value={protocol.transcript || ""}
                                    onChange={(e) => handleFieldChange("transcript", e.target.value)}
                                    placeholder="Стенограмма пуста. Введите текст стенограммы вручную или загрузите файл записи встречи."
                                  />
                                ) : (
                                  <div
                                    style={{
                                      padding: "20px",
                                      background: "#ffffff",
                                      border: "1px solid var(--line)",
                                      borderRadius: "8px",
                                      fontSize: "13.5px",
                                      lineHeight: "1.6",
                                      minHeight: "450px",
                                      maxHeight: "650px",
                                      overflowY: "auto",
                                      width: "100%",
                                      color: "var(--text)"
                                    }}
                                  >
                                    <MarkdownPreview text={protocol.theme || ""} />
                                  </div>
                                )}
                              </div>
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
