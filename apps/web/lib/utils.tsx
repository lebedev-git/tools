import React from "react";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  LayoutDashboard,
  Workflow,
  Database,
  Sparkles,
  FileText
} from "lucide-react";
import { analyticsBlocks } from "@tools/analytics";
import type { ProcessStep } from "@tools/core";

export type Section =
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

export type AnalyticsBlockId = (typeof analyticsBlocks)[number]["id"];

export interface IntegrationStatus {
  yandexForms: boolean;
  llm: boolean;
  outline: boolean;
  imageService: boolean;
  storage: boolean;
  openNotebook: boolean;
}

export interface AvailabilityOption {
  date: string;
  inputCount: number;
  outputCount: number;
}

export interface Day2AvailabilityOption {
  date: string;
  count: number;
}

export interface AnalyticsRunResult {
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

export interface NpsBucketResult {
  label: string;
  date: string;
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number;
}

export interface RunStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "succeeded" | "failed";
}

export const promptDefaults: Record<string, string> = {
  day1: "Проанализируй анкеты обратной связи участников за День 1. Сделай структурированный отчет на русском языке.\nВыдели:\n1. Количество ответов, общий уровень удовлетворенности и индекс NPS.\n2. Топ-3 освоенных инструментов (например: Perplexity, Gamma, Suno).\n3. Качественные показатели изменения отношения к ИИ (в процентах и долях).\n4. Качественные эффекты: преодоление страха (уверенность на входе/выходе), формирование единого понятийного поля, практические результаты внедрения (планы внедрения, автоматизация отчетности).",
  day2: "Проанализируй анкеты обратной связи участников за День 2.\nСфокусируйся на динамике по сравнению с Днем 1:\n1. Сравнительные метрики NPS и удовлетворенности.\n2. Изменение уверенности при работе с ИИ, командная согласованность.\n3. Новые изученные сценарии и продвинутые инструменты.",
  overall: "Синтезируй результаты первого и второго дня стратегической сессии в единую аналитическую справку на русском языке.\nСобери все ключевые метрики (NPS по дням, командная согласованность, рост числа освоенных инструментов).\nОпиши качественные эффекты (преодоление барьеров, командная синергия, практические планы).",
  products: "Проанализируй предложенные на сессии концепции цифровых продуктов.\nДля каждого продукта опиши:\n- Название и суть концепции (например: ИИ-генератор контента, Система ИИ-модерации, Бот-тренажер).\n- Решаемую проблему и практическую ценность.\n- Как продукт автоматизирует работу и повышает эффективность.",
  infographic: "Собери итоговую разметку для дашборда-инфографики формата 16:9 на основе аналитики сессии.\nРазметка должна строго соответствовать следующей структуре:\n\nЗАГОЛОВОК (ВЕРХНИЙ КОЛОНТИТУЛ):\nТренажёр «МАЯК» | ИИ-грамотность для органов власти [Даты сессии, Город]\n\nЛЕВАЯ КОЛОНКА: ЗАДАЧИ И МЕТРИКИ\nЭффективность программы:\n• NPS День 1: [Значение]\n• NPS День 2: [Значение]\n• Командная согласованность: [Оценка]/10\n• Рост числа инструментов: [На входе] → [На выходе] (+[Разница] за день)\n\nПРАВАЯ КОЛОНКА (ИЛИ НИЖНИЙ БЛОК): КОМПЕТЕНЦИИ И ИНСАЙТЫ\nКОМПЕТЕНЦИИ И НАВЫКИ (Уровень владения ИИ):\n• На входе: [Оценка]/10\n• На выходе: [Оценка]/10 (Рост уверенности в [Коэффициент] раза)\n\nТоп-3 инструментария (Лидеры освоения):\n1. Аналитика и Данные: [Инструмент 1]\n2. Визуал и Презентации: [Инструмент 2]\n3. Креатив и Аудио: [Инструмент 3]\n\nКАЧЕСТВЕННЫЕ ПОКАЗАТЕЛИ (Изменение отношения к ИИ):\n• Кардинально изменилось (Увидели огромный потенциал): [Процент]% ([Доля])\n• Дополнилось (Увидели новые сценарии): [Процент]% ([Доля])\n\nКачественные эффекты:\n• Преодоление страха: [Краткое описание эффекта и количества инструментов].\n• Командная синергия: [Описание формирования единого понятийного поля].\n• Практический результат: [Описание конкретных планов внедрения и автоматизации отчетов].\n\nВизуальное оформление: указать место для логотипа и общего фото участников, цветовой стиль адаптировать под цвета логотипа.",
  logo: "",
  generalPhoto: "",
  publish: "",
  "protocol.regular.meeting": "Проанализируй стенограмму или заметки регулярной встречи (синк/статус проекта). Сформируй структурированный протокол на русском языке.\nВыдели и подробно распиши следующие разделы:\n- Тема (Краткое резюме сути обсуждения)\n- Повестка (Список обсуждавшихся вопросов)\n- Основные тезисы (Ключевые аргументы, идеи, обсуждения и текущие статусы по задачам)\n- Решения (Список утвержденных решений)\n- Задачи (Список конкретных поручений)\n- Ответственные (Кто выполняет задачи)\n- Сроки (Дедлайны для каждой задачи)\n- Риски (Выявленные угрозы или неопределенности)\n- Приложения (Документы, ссылки или дополнительные материалы)",
  "protocol.meeting": "Проанализируй стенограмму или заметки встречи. Сформируй структурированный протокол на русском языке.\nВыдели и подробно распиши следующие разделы:\n- Тема (Краткое резюме сути обсуждения)\n- Повестка (Список обсуждавшихся вопросов)\n- Основные тезисы (Ключевые аргументы, идеи и обсуждения)\n- Решения (Список утвержденных решений)\n- Задачи (Список конкретных поручений)\n- Ответственные (Кто выполняет задачи)\n- Сроки (Дедлайны для каждой задачи)\n- Риски (Выявленные угрозы или неопределенности)\n- Приложения (Документы, ссылки или дополнительные материалы)",
  "protocol.transcript": "Сделай дословную и максимально точную транскрибацию этого аудиофайла на русском языке, обязательно разделяя текст по спикерам (диаризация по голосам). Форматируй текст в виде диалога, указывая спикеров, например:\nСпикер 1: [реплика спикера]\nСпикер 2: [реплика спикера]\nИ так далее. Внимательно следи за сменой голосов. Запиши только произнесенный text встречи, не добавляй от себя никаких комментариев, резюме или вводных фраз."
};

export function getNow(): number {
  return Date.now();
}

export function formatDate(value?: string) {
  if (!value) {
    return "";
  }
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export const platformLayers = [
  { title: "Интерфейс", text: "Единая навигация и дизайн-система", icon: LayoutDashboard },
  { title: "Очередь задач", text: "Graphile Worker без Docker и Redis", icon: Workflow },
  { title: "База данных", text: "PostgreSQL, версии и аудит изменений", icon: Database },
  { title: "ИИ-адаптер", text: "Запросы к моделям и структурированный вывод", icon: Sparkles },
  { title: "Публикация", text: "Публикация и версии документов в Open Notebook", icon: FileText }
];

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function StepIcon({ status }: { status: ProcessStep["status"] | "pending" | "running" | "succeeded" | "failed" }) {
  if (status === "succeeded") {
    return <CheckCircle2 size={16} />;
  }
  if (status === "running" || status === "retrying") {
    return <Loader2 className="spin" size={16} />;
  }
  return <CircleDashed size={16} />;
}

export function formatTime(seconds?: number) {
  if (seconds === undefined || seconds === null) return "";
  if (seconds < 60) {
    return `${seconds} сек`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}м ${secs}с`;
}

export function renderInlineMarkdown(text: string) {
  const parts = text.split(/\*\*(.*?)\*\//g); // Note: handles both **bold** syntax safely
  const partsBold = text.split(/\*\*(.*?)\*\*/g);
  return partsBold.map((part, idx) => {
    if (idx % 2 === 1) {
      return <strong key={idx}>{part}</strong>;
    }
    return part;
  });
}

function inlineMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inList = false;
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      let html = '<table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; color:#1e293b; border:1px solid #e2e8f0;">';
      tableRows.forEach((row, rowIndex) => {
        if (rowIndex === 0) {
          html += '<thead><tr style="background-color:#f8fafc; border-bottom:2px solid #e2e8f0;">';
          row.forEach(cell => {
            html += `<th style="padding:10px 12px; text-align:left; font-weight:700; border:1px solid #e2e8f0;">${inlineMarkdown(cell)}</th>`;
          });
          html += '</tr></thead><tbody>';
        } else {
          if (row.every(cell => cell.startsWith('-') || cell.trim() === '')) {
            return;
          }
          const bg = rowIndex % 2 === 0 ? 'background-color:#f8fafc;' : '';
          html += `<tr style="border-bottom:1px solid #e2e8f0; ${bg}">`;
          row.forEach(cell => {
            html += `<td style="padding:8px 12px; border:1px solid #e2e8f0;">${inlineMarkdown(cell)}</td>`;
          });
          html += '</tr>';
        }
      });
      html += '</tbody></table>';
      result.push(html);
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (line.startsWith("|")) {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      inTable = true;
      const cells = line
        .split("|")
        .map(c => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        result.push('<ul style="margin:8px 0; padding-left:24px;">');
        inList = true;
      }
      const itemText = line.substring(2);
      result.push(`<li style="margin-bottom:4px; list-style-type:disc;">${inlineMarkdown(itemText)}</li>`);
      continue;
    } else if (inList) {
      result.push("</ul>");
      inList = false;
    }

    if (line.startsWith("# ")) {
      result.push(`<h1 style="font-size:20px; font-weight:800; border-bottom:1px solid var(--line); padding-bottom:4px; margin:12px 0 6px 0; color:var(--text);">${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      result.push(`<h2 style="font-size:16px; font-weight:700; margin:10px 0 4px 0; color:var(--text);">${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      result.push(`<h3 style="font-size:14px; font-weight:600; margin:8px 0 4px 0; color:var(--text);">${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line === "---") {
      result.push('<hr style="border:none; border-top:1px solid var(--line); margin:12px 0;" />');
    } else if (line === "") {
      result.push('<div style="height:4px;"></div>');
    } else {
      result.push(`<p style="margin:2px 0; color:var(--text);">${inlineMarkdown(rawLine)}</p>`);
    }
  }

  if (inTable) flushTable();
  if (inList) result.push("</ul>");

  return result.join("\n");
}

export function MarkdownPreview({ text }: { text: string }) {
  if (!text) return <p style={{ color: "var(--muted)", margin: 0 }}>Превью пусто.</p>;
  return (
    <div 
      className="markdown-preview-container" 
      dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} 
    />
  );
}
