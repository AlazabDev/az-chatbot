export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
}

export const DEFAULT_AZURE_CONFIG: AzureOpenAIConfig = {
  endpoint: "",
  apiKey: "",
  deployment: "",
  apiVersion: "2024-08-01-preview",
  temperature: 0.7,
  maxTokens: 800,
  systemPrompt:
    "أنت مساعد ذكي ومحترف يجيب باللغة العربية بشكل واضح ومختصر، وتساعد المستخدم في استفساراته حول المنتج والخدمات.",
  enabled: false,
};

const LS_KEY = "azab.admin.azure";

export function loadAzureConfig(): AzureOpenAIConfig {
  if (typeof window === "undefined") return DEFAULT_AZURE_CONFIG;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_AZURE_CONFIG;
    return { ...DEFAULT_AZURE_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AZURE_CONFIG;
  }
}

export function saveAzureConfig(cfg: AzureOpenAIConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export interface TrainingExample {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
}

const LS_TRAINING = "azab.admin.training";

export function loadTrainingExamples(): TrainingExample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_TRAINING);
    return raw ? (JSON.parse(raw) as TrainingExample[]) : [];
  } catch {
    return [];
  }
}

export function saveTrainingExamples(items: TrainingExample[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_TRAINING, JSON.stringify(items));
}
