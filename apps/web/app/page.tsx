"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  Download,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Sun,
  User,
  Settings
} from "lucide-react";
import { latestAnalyticsRun } from "@tools/analytics";
import { latestProtocolRun } from "@tools/protocols";
import type { ProcessRun } from "@tools/core";

import { cx, promptDefaults, type Section } from "../lib/utils";
import AnalyticsView from "./components/AnalyticsView";
import ProtocolsView from "./components/ProtocolsView";
import PromptsView from "./components/PromptsView";
import SettingsView from "./components/SettingsView";

export default function Home() {
  const [workspace, setWorkspace] = useState<"analytics" | "protocols">("analytics");
  const [section, setSection] = useState<Section>("analytics");
  const [promptSettings, setPromptSettings] = useState<Record<string, string>>(promptDefaults);
  const [activeAnalyticsRun, setActiveAnalyticsRun] = useState<ProcessRun>(latestAnalyticsRun);
  const [activeProtocolRun, setActiveProtocolRun] = useState<ProcessRun>(latestProtocolRun);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Register Service Worker and listen to PWA install prompt
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => console.log("SW registered:", reg.scope))
        .catch((err) => console.error("SW registration failed:", err));
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to PWA install: ${outcome}`);
    setDeferredPrompt(null);
  };

  // Sync session cookie auth on startup
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/check");
        if (response.ok) {
          setIsAuthenticated(true);
          localStorage.setItem("authenticated", "true");
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem("authenticated");
        }
      } catch (err) {
        setIsAuthenticated(false);
        localStorage.removeItem("authenticated");
      }
    }
    void checkAuth();
  }, []);

  // Sync workspace and section from localStorage
  useEffect(() => {
    const savedWorkspace = localStorage.getItem("selected_workspace") as "analytics" | "protocols" | null;
    const savedSection = localStorage.getItem("selected_section") as Section | null;
    if (savedWorkspace) {
      setWorkspace(savedWorkspace);
    }
    if (savedSection) {
      setSection(savedSection);
    }
  }, []);

  // Handle dark mode class on document element
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      if (response.ok) {
        localStorage.setItem("authenticated", "true");
        setIsAuthenticated(true);
        setLoginError("");
      } else {
        const errData = await response.json();
        setLoginError(errData.message || "Неверный логин или пароль");
      }
    } catch (err) {
      setLoginError("Ошибка сети при попытке авторизации");
    }
  };

  // Load custom saved prompts on start
  useEffect(() => {
    let mounted = true;
    async function loadPrompts() {
      try {
        const response = await fetch("/api/settings/prompts");
        if (response.ok) {
          const data = (await response.json()) as { prompts?: Record<string, string> };
          if (mounted && data.prompts) {
            setPromptSettings({
              ...promptDefaults,
              ...data.prompts
            });
          }
        }
      } catch (err) {
        console.error("Failed to load prompts on start:", err);
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
      return <SettingsView workspace={workspace} />;
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
      localStorage.setItem("selected_workspace", "protocols");
      localStorage.setItem("selected_section", "protocols");
    } else {
      setWorkspace("analytics");
      setSection("analytics");
      localStorage.setItem("selected_workspace", "analytics");
      localStorage.setItem("selected_section", "analytics");
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
    <div className="app-shell rail-collapsed">
      <aside className="left-rail">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Логотип РСК" />
        </div>

        {/* Brand Area Switcher Workspace */}
        <div className="brand" onClick={toggleWorkspace} style={{ cursor: "pointer" }} title="Нажмите для переключения воркспейса">
          {workspace === "analytics" ? (
            <LayoutDashboard size={18} style={{ color: "#38bdf8", flexShrink: 0 }} />
          ) : (
            <ClipboardList size={18} style={{ color: "#38bdf8", flexShrink: 0 }} />
          )}
          <div className="brand-copy">
            <strong>{workspace === "analytics" ? "Аналитика" : "Протоколы"}</strong>
            <span>платформа инструментов</span>
          </div>
        </div>

        <nav>
          {workspace === "analytics" ? (
            <>
              <button className={cx(section === "analytics" && "active")} onClick={() => { setSection("analytics"); localStorage.setItem("selected_section", "analytics"); }} title="Конструктор сценария">
                <LayoutDashboard size={18} />
                <span>Конструктор сценария</span>
              </button>
              <button className={cx(section === "prompts" && "active")} onClick={() => { setSection("prompts"); localStorage.setItem("selected_section", "prompts"); }} title="Настройки промптов">
                <Sparkles size={18} />
                <span>Настройки промптов</span>
              </button>
            </>
          ) : (
            <>
              <button className={cx(section === "protocols" && "active")} onClick={() => { setSection("protocols"); localStorage.setItem("selected_section", "protocols"); }} title="Протоколы">
                <ClipboardList size={18} />
                <span>Протоколы</span>
              </button>
              <button className={cx(section === "prompts" && "active")} onClick={() => { setSection("prompts"); localStorage.setItem("selected_section", "prompts"); }} title="Настройки промптов">
                <Sparkles size={18} />
                <span>Настройки промптов</span>
              </button>
            </>
          )}
          <button className={cx(section === "settings" && "active")} onClick={() => { setSection("settings"); localStorage.setItem("selected_section", "settings"); }} title="Настройки платформы" style={{ marginTop: "12px" }}>
            <Settings size={18} />
            <span>Настройки</span>
          </button>
        </nav>
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
