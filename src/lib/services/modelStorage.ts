const STORAGE_KEY = "gemini_custom_models";

export const DEFAULT_MODELS = [
  "models/gemini-flash-latest",
  "models/gemini-pro-latest",
];

export function getCustomModels(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load custom models", e);
    return [];
  }
}

export function saveCustomModels(models: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch (e) {
    console.error("Failed to save custom models", e);
  }
}

export function addCustomModel(model: string): void {
  const models = getCustomModels();
  if (!models.includes(model) && !DEFAULT_MODELS.includes(model)) {
    models.push(model);
    saveCustomModels(models);
  }
}

export function removeCustomModel(model: string): void {
  const models = getCustomModels();
  const filtered = models.filter((m) => m !== model);
  saveCustomModels(filtered);
}

export function getAllModels(): string[] {
  return [...DEFAULT_MODELS, ...getCustomModels()];
}

export function isDefaultModel(model: string): boolean {
  return DEFAULT_MODELS.includes(model);
}

