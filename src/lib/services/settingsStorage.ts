export interface AppSettings {
  theme: string;
  systemPrompt: string;
}

const SETTINGS_KEY = "gemini_app_settings";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark", // Default to dark
  systemPrompt: "",
};

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    
    // Apply theme immediately if it changed
    if (settings.theme) {
      applyTheme(settings.theme);
    }
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

export function loadSettings(): AppSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function applyTheme(theme: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

// Initialize theme from storage
export function initTheme(): void {
  const settings = loadSettings();
  applyTheme(settings.theme);
}

