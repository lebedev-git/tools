"use client";

import React, { useMemo, useState, useEffect, type SetStateAction, type Dispatch } from "react";
import { Save, RefreshCw } from "lucide-react";
import { cx, promptDefaults } from "../../lib/utils";

export default function PromptsView({
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
        { id: "protocol.regular.meeting", title: "Шаблон регулярной встречи", description: "Анализ стенограммы регулярной встречи (синка/статуса) с учетом ролей" },
        { id: "protocol.meeting", title: "Шаблон обычной встречи", description: "Анализ стенограммы обычной встречи и формирование протокола" },
        { id: "protocol.transcript", title: "Шаблон стенограммы", description: "Транскрибация аудиофайла и разделение по спикерам" }
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
