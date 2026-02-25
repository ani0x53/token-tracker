import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  anthropic_key: string;
  openai_key: string;
  poll_interval_secs: string;
  alert_daily_usd: string;
  alert_monthly_usd: string;
}

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  save: (updates: Partial<Settings>) => Promise<void>;
}

const defaults: Settings = {
  anthropic_key: "",
  openai_key: "",
  poll_interval_secs: "300",
  alert_daily_usd: "",
  alert_monthly_usd: "",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaults,
  loaded: false,

  load: async () => {
    try {
      const raw = await invoke<Record<string, string>>("get_settings");
      set({ settings: { ...defaults, ...raw }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  save: async (updates) => {
    const merged = { ...get().settings, ...updates };
    set({ settings: merged });
    await invoke("save_settings", {
      settings: Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== ""),
      ),
    });
  },
}));
