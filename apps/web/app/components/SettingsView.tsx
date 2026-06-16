"use client";

import React, { useState, useEffect } from "react";
import { cx, platformLayers, type IntegrationStatus } from "../../lib/utils";
import { Save, Key, Sparkles, Image, Settings } from "lucide-react";

interface KeySettings {
  systemSettings: {
    llmApiKeyMasked: string;
    llmModelDefault: string;
    geminiApiKeyMasked: string;
    deepgramApiKeyMasked: string;
    deepgramModelDefault: string;
    imageServiceUrlDefault: string;
    imageServiceApiKeyMasked: string;
  };
  customSettings: {
    extraLlmKeys: string;
    llmModel: string;
    extraGeminiKeys: string;
    extraDeepgramKeys: string;
    deepgramModel: string;
    extraImageServiceKey: string;
    imageServiceUrl: string;
    imageModel: string;
  };
}

export default function SettingsView() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [keys, setKeys] = useState<KeySettings | null>(null);
  const [form, setForm] = useState<KeySettings["customSettings"] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load status
  useEffect(() => {
    let mounted = true;
    async function loadStatus() {
      try {
        const response = await fetch("/api/integrations/status");
        if (response.ok) {
          const nextStatus = (await response.json()) as IntegrationStatus;
          if (mounted) setStatus(nextStatus);
        }
      } catch (err) {
        console.error("Failed to load status:", err);
      }
    }
    void loadStatus();
    return () => {
      mounted = false;
    };
  }, [isSaved]); // Reload status when settings change

  // Load keys
  useEffect(() => {
    let mounted = true;
    async function loadKeys() {
      try {
        const response = await fetch("/api/settings/keys");
        if (response.ok) {
          const data = (await response.json()) as KeySettings;
          if (mounted) {
            setKeys(data);
            setForm(data.customSettings);
          }
        }
      } catch (err) {
        console.error("Failed to load keys:", err);
      }
    }
    void loadKeys();
    return () => {
      mounted = false;
    };
  }, []);

  const handleInputChange = (field: keyof KeySettings["customSettings"], value: string) => {
    if (!form) return;
    setForm({
      ...form,
      [field]: value
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (response.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } else {
        const errData = await response.json();
        setSaveError(errData.message || "Ошибка при сохранении настроек.");
      }
    } catch (err) {
      setSaveError("Сетевая ошибка при попытке сохранить настройки.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="workspace" style={{ paddingBottom: "60px" }}>
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

      <section className="panel settings-panel" style={{ marginBottom: "24px" }}>
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

      {form && keys && (
        <form onSubmit={handleSave} style={{ display: "grid", gap: "24px" }}>
          {/* 1. ANALYTICS BLOCK */}
          <section className="panel settings-panel">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Sparkles size={20} style={{ color: "var(--brand)" }} />
              <h2 style={{ margin: 0 }}>Настройки Аналитики (LLM)</h2>
            </div>
            
            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системная модель (по умолчанию)</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={keys.systemSettings.llmModelDefault} 
                      disabled 
                      style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                    />
                  </label>
                </div>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Используемая модель (переопределение)</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={form.llmModel} 
                      onChange={(e) => handleInputChange("llmModel", e.target.value)} 
                      placeholder="Например, llama-3.3-70b-versatile"
                      style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системные ключи (в файле .env)</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={keys.systemSettings.llmApiKeyMasked} 
                    disabled 
                    style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                  />
                </label>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Дополнительные API-ключи Groq / LLM (для обхода Rate Limits)</span>
                  <textarea 
                    className="form-input" 
                    value={form.extraLlmKeys} 
                    onChange={(e) => handleInputChange("extraLlmKeys", e.target.value)} 
                    placeholder="Введите дополнительные ключи через запятую (например, gsk_Key1, gsk_Key2)"
                    style={{ minHeight: "60px", width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", resize: "vertical" }}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 2. PROTOCOLS BLOCK */}
          <section className="panel settings-panel">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Key size={20} style={{ color: "var(--brand)" }} />
              <h2 style={{ margin: 0 }}>Настройки Протоколов (Gemini & Deepgram)</h2>
            </div>
            
            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Модель Deepgram по умолчанию</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={keys.systemSettings.deepgramModelDefault} 
                      disabled 
                      style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                    />
                  </label>
                </div>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Модель Deepgram (переопределение)</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={form.deepgramModel} 
                      onChange={(e) => handleInputChange("deepgramModel", e.target.value)} 
                      placeholder="Например, nova-2"
                      style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системные ключи Gemini (в .env)</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={keys.systemSettings.geminiApiKeyMasked} 
                    disabled 
                    style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                  />
                </label>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Дополнительные API-ключи Gemini (через запятую)</span>
                  <textarea 
                    className="form-input" 
                    value={form.extraGeminiKeys} 
                    onChange={(e) => handleInputChange("extraGeminiKeys", e.target.value)} 
                    placeholder="Введите дополнительные ключи Gemini через запятую"
                    style={{ minHeight: "60px", width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", resize: "vertical" }}
                  />
                </label>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px", marginTop: "8px" }}>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системные ключи Deepgram (в .env)</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={keys.systemSettings.deepgramApiKeyMasked} 
                    disabled 
                    style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                  />
                </label>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Дополнительные API-ключи Deepgram (через запятую)</span>
                  <textarea 
                    className="form-input" 
                    value={form.extraDeepgramKeys} 
                    onChange={(e) => handleInputChange("extraDeepgramKeys", e.target.value)} 
                    placeholder="Введите дополнительные ключи Deepgram через запятую"
                    style={{ minHeight: "60px", width: "100%", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", resize: "vertical" }}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 3. IMAGES / INFOGRAPHIC BLOCK */}
          <section className="panel settings-panel">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Image size={20} style={{ color: "var(--brand)" }} />
              <h2 style={{ margin: 0 }}>Настройки Инфографики (Генератор изображений)</h2>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системный адрес Image Service</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={keys.systemSettings.imageServiceUrlDefault} 
                      disabled 
                      style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                    />
                  </label>
                </div>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Адрес Image Service (переопределение)</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={form.imageServiceUrl} 
                      onChange={(e) => handleInputChange("imageServiceUrl", e.target.value)} 
                      placeholder="Например, http://localhost:8081/v1"
                      style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--muted)" }}>Системный API-ключ</span>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={keys.systemSettings.imageServiceApiKeyMasked} 
                      disabled 
                      style={{ opacity: 0.6, cursor: "not-allowed", padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)", backgroundColor: "var(--panel)" }}
                    />
                  </label>
                </div>
                <div>
                  <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Новый API-ключ (переопределение)</span>
                    <input 
                      type="password" 
                      className="form-input" 
                      value={form.extraImageServiceKey} 
                      onChange={(e) => handleInputChange("extraImageServiceKey", e.target.value)} 
                      placeholder="Введите новый API-ключ для Image Service"
                      style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text)" }}>Модель генерации изображений (переопределение)</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={form.imageModel} 
                    onChange={(e) => handleInputChange("imageModel", e.target.value)} 
                    placeholder="Например, gpt-image-2 или dall-e-3"
                    style={{ padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--border-radius)" }}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* ACTION BUTTONS */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
            {saveError && <div style={{ color: "var(--red)", fontSize: "14px" }}>{saveError}</div>}
            <button 
              type="submit" 
              className="primary-button" 
              disabled={isSaving}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px" }}
            >
              <Save size={18} />
              {isSaving ? "Сохранение..." : isSaved ? "Сохранено!" : "Сохранить все настройки"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
