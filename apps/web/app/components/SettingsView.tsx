"use client";

import React, { useState, useEffect } from "react";
import { cx, platformLayers, type IntegrationStatus } from "../../lib/utils";

export default function SettingsView() {
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
            ["Сервис Open Notebook", status?.openNotebook],
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
        </div>
      </section>
    </main>
  );
}
