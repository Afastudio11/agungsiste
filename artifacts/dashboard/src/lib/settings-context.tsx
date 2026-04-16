import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const STORAGE_KEY = "ktp_dashboard_settings";

export type MenuLabels = {
  dashboard: string;
  events: string;
  participants: string;
  officers: string;
  scan: string;
  prizes: string;
  pemetaan: string;
  settings: string;
};

export type AppSettings = {
  orgName: string;
  defaultEventId: string;
  autoResetForm: boolean;
  showTotalOnSuccess: boolean;
  primaryColor: string;
  menuLabels: MenuLabels;
};

export const defaultMenuLabels: MenuLabels = {
  dashboard: "Dashboard",
  events: "Event",
  participants: "Peserta",
  officers: "Petugas",
  scan: "Scan KTP",
  prizes: "Hadiah",
  pemetaan: "Pemetaan",
  settings: "Pengaturan",
};

export const defaultSettings: AppSettings = {
  orgName: "Panitia Nasional",
  defaultEventId: "",
  autoResetForm: false,
  showTotalOnSuccess: true,
  primaryColor: "blue",
  menuLabels: defaultMenuLabels,
};

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      menuLabels: { ...defaultMenuLabels, ...(parsed.menuLabels ?? {}) },
    };
  } catch {
    return defaultSettings;
  }
}

function saveToStorage(s: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  saveSettings: () => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  updateSettings: () => {},
  saveSettings: () => {},
  resetSettings: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadFromStorage);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.menuLabels) {
        next.menuLabels = { ...prev.menuLabels, ...patch.menuLabels };
      }
      return next;
    });
  };

  const saveSettings = () => {
    setSettings((prev) => {
      saveToStorage(prev);
      return prev;
    });
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    saveToStorage(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, saveSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
