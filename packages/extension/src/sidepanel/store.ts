// ============================================================
// Zustand store — single source of truth for sidepanel UI
// ============================================================

import { create } from "zustand";
import type { TeachingStep, ExecResultItem } from "../shared/messages";
import type { LogEntry, EngineStatus } from "../engine/types";
import type { Action } from "../dsl/types";

const DARK_MODE_KEY = "geogebra-copilot-dark-mode";

function getInitialDarkMode(): boolean {
  try {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    if (stored !== null) return stored === "true";
  } catch { /* localStorage unavailable */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

// ============================================================
// Message types
// ============================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  /** Whether this message is still being streamed */
  streaming: boolean;
  /** Associated teaching steps (for AI responses) */
  steps?: TeachingStep[];
}

// ============================================================
// Store state
// ============================================================

export interface SidepanelState {
  // ── Chat ──
  messages: ChatMessage[];
  streamingId: string | null;
  streamBuffer: string;

  // ── Timeline ──
  steps: TeachingStep[];
  currentStep: number;

  // ── Logs ──
  logEntries: LogEntry[];

  // ── Engine status ──
  engineStatus: EngineStatus | null;
  isRunning: boolean;

  // ── Engine execution state (from SW push events) ──
  execState: {
    engineState: string;
    currentStep: number;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    isPaused: boolean;
  } | null;

  // ── Active question (ASK_OBSERVATION from engine) ──
  activeQuestion: {
    actionId: string;
    question: string;
    answerType: string;
    options?: string[];
  } | null;

  // ── UI ──
  darkMode: boolean;
  activePanel: "chat" | "settings";
  inputLength: number;

  // ── Actions ──
  addUserMessage: (content: string) => void;
  startStreaming: () => string;
  appendStreamChunk: (chunk: string) => void;
  setStreamContent: (text: string) => void;
  finishStreaming: (steps?: TeachingStep[]) => void;
  addSystemMessage: (content: string) => void;

  setSteps: (steps: TeachingStep[]) => void;
  advanceStep: () => void;

  addLogEntry: (entry: LogEntry) => void;
  clearLogs: () => void;

  setEngineStatus: (status: EngineStatus) => void;
  setIsRunning: (v: boolean) => void;

  setExecState: (s: SidepanelState["execState"]) => void;
  setActiveQuestion: (q: SidepanelState["activeQuestion"]) => void;
  clearActiveQuestion: () => void;

  toggleDarkMode: () => void;
  setActivePanel: (panel: "chat" | "settings") => void;
  setInputLength: (len: number) => void;

  clearMessages: () => void;
  clearAll: () => void;
}

// ============================================================
// Helpers
// ============================================================

function mid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// Store
// ============================================================

export const useStore = create<SidepanelState>((set, get) => ({
  // ── Initial state ──
  messages: [],
  streamingId: null,
  streamBuffer: "",
  steps: [],
  currentStep: 0,
  logEntries: [],
  engineStatus: null,
  isRunning: false,
  execState: null,
  activeQuestion: null,
  darkMode: getInitialDarkMode(),
  activePanel: "chat",
  inputLength: 0,

  // ── Chat actions ──

  addUserMessage: (content: string) => {
    const msg: ChatMessage = {
      id: mid(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      streaming: false,
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  startStreaming: () => {
    const id = mid();
    const msg: ChatMessage = {
      id,
      role: "assistant",
      content: "指令已接收，思考中",
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    set({ streamingId: id, streamBuffer: "", messages: [...get().messages, msg] });
    return id;
  },

  setStreamContent: (text: string) => {
    const { streamingId, messages } = get();
    if (!streamingId) return;
    set({
      streamBuffer: text,
      messages: messages.map((m) =>
        m.id === streamingId ? { ...m, content: text } : m
      ),
    });
  },

  appendStreamChunk: (chunk: string) => {
    const { streamingId, messages } = get();
    if (!streamingId) return;

    const buffer = get().streamBuffer + chunk;
    set({
      streamBuffer: buffer,
      messages: messages.map((m) =>
        m.id === streamingId ? { ...m, content: buffer } : m
      ),
    });
  },

  finishStreaming: (steps?: TeachingStep[]) => {
    const { streamingId, messages, streamBuffer } = get();
    if (!streamingId) return;

    set({
      streamingId: null,
      streamBuffer: "",
      messages: messages.map((m) =>
        m.id === streamingId
          ? { ...m, streaming: false, content: streamBuffer || m.content, steps }
          : m
      ),
    });
    if (steps) set({ steps, currentStep: 0 });
  },

  addSystemMessage: (content: string) => {
    const msg: ChatMessage = {
      id: mid(),
      role: "system",
      content: content.trim(),
      timestamp: new Date().toISOString(),
      streaming: false,
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  // ── Timeline ──

  setSteps: (steps: TeachingStep[]) => set({ steps, currentStep: 0 }),
  advanceStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.steps.length) })),

  // ── Logs ──

  addLogEntry: (entry: LogEntry) => {
    set((s) => ({ logEntries: [...s.logEntries, entry].slice(-200) }));
  },
  clearLogs: () => set({ logEntries: [] }),

  // ── Engine ──

  setEngineStatus: (status: EngineStatus) => set({ engineStatus: status }),
  setIsRunning: (v: boolean) => set({ isRunning: v }),
  setExecState: (s) => set({ execState: s }),
  setActiveQuestion: (q) => set({ activeQuestion: q }),
  clearActiveQuestion: () => set({ activeQuestion: null }),

  // ── UI ──

  toggleDarkMode: () => {
    const next = !get().darkMode;
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem(DARK_MODE_KEY, String(next)); } catch { /* noop */ }
    set({ darkMode: next });
    setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 250);
  },

  setActivePanel: (panel) => set({ activePanel: panel }),
  setInputLength: (len) => set({ inputLength: len }),

  clearMessages: () => set({ messages: [], streamingId: null, streamBuffer: "" }),
  clearAll: () =>
    set({
      messages: [],
      streamingId: null,
      streamBuffer: "",
      steps: [],
      currentStep: 0,
      logEntries: [],
      engineStatus: null,
      isRunning: false,
    }),
}));

// Apply dark mode on module load (before first render)
const initialDark = getInitialDarkMode();
if (initialDark) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}