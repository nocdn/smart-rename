import { createFireworks, type FireworksLanguageModelOptions } from "@ai-sdk/fireworks";
import { createOpenAI, type OpenAILanguageModelChatOptions } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type RenameProvider = "openai" | "fireworks";

export type OpenAIReasoningEffort = NonNullable<OpenAILanguageModelChatOptions["reasoningEffort"]>;

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const DEFAULT_FIREWORKS_MODEL = "accounts/fireworks/models/kimi-k2p6";
export const DEFAULT_OPENAI_REASONING_EFFORT: OpenAIReasoningEffort = "medium";

const OPENAI_REASONING_EFFORTS: OpenAIReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

export interface RenamePreferences {
  provider: RenameProvider;
  openaiApiKey: string;
  openaiModel: string;
  openaiReasoningEffort: OpenAIReasoningEffort;
  fireworksApiKey: string;
  fireworksModel: string;
  fireworksEnableReasoning: boolean;
  renamePrompt: string;
  useCloudModel: boolean;
}

export function isCloudModelEnabled(preferences: RenamePreferences): boolean {
  return preferences.useCloudModel !== false;
}

export interface ProviderValidationResult {
  valid: boolean;
  errorTitle?: string;
  errorMessage?: string;
}

export function getActiveProvider(preferences: RenamePreferences): RenameProvider {
  return preferences.provider === "fireworks" ? "fireworks" : "openai";
}

export function resolveOpenAIModel(preferences: RenamePreferences): string {
  return preferences.openaiModel?.trim() || DEFAULT_OPENAI_MODEL;
}

export function resolveOpenAIReasoningEffort(preferences: RenamePreferences): OpenAIReasoningEffort {
  const effort = preferences.openaiReasoningEffort;

  if (OPENAI_REASONING_EFFORTS.includes(effort)) {
    return effort;
  }

  return DEFAULT_OPENAI_REASONING_EFFORT;
}

export function getOpenAIProviderOptions(
  preferences: RenamePreferences,
): { openai: OpenAILanguageModelChatOptions } | undefined {
  if (getActiveProvider(preferences) !== "openai") {
    return undefined;
  }

  return {
    openai: {
      reasoningEffort: resolveOpenAIReasoningEffort(preferences),
    },
  };
}

export function isFireworksReasoningEnabled(preferences: RenamePreferences): boolean {
  return preferences.fireworksEnableReasoning !== false;
}

export function isRenameReasoningEnabled(preferences: RenamePreferences): boolean {
  if (getActiveProvider(preferences) === "fireworks") {
    return isFireworksReasoningEnabled(preferences);
  }

  return resolveOpenAIReasoningEffort(preferences) !== "none";
}

export function getFireworksProviderOptions(
  preferences: RenamePreferences,
): { fireworks: FireworksLanguageModelOptions } | undefined {
  if (getActiveProvider(preferences) !== "fireworks" || isFireworksReasoningEnabled(preferences)) {
    return undefined;
  }

  return {
    fireworks: {
      thinking: { type: "disabled" },
    },
  };
}

export function getRenameProviderOptions(
  preferences: RenamePreferences,
): { openai?: OpenAILanguageModelChatOptions; fireworks?: FireworksLanguageModelOptions } | undefined {
  const openaiOptions = getOpenAIProviderOptions(preferences);
  const fireworksOptions = getFireworksProviderOptions(preferences);

  if (!openaiOptions && !fireworksOptions) {
    return undefined;
  }

  return {
    ...openaiOptions,
    ...fireworksOptions,
  };
}

export function resolveFireworksModel(preferences: RenamePreferences): string {
  return preferences.fireworksModel?.trim() || DEFAULT_FIREWORKS_MODEL;
}

export function resolveActiveModel(preferences: RenamePreferences): string {
  return getActiveProvider(preferences) === "fireworks"
    ? resolveFireworksModel(preferences)
    : resolveOpenAIModel(preferences);
}

export function validateRenamePreferences(preferences: RenamePreferences): ProviderValidationResult {
  if (!isCloudModelEnabled(preferences)) {
    return { valid: true };
  }

  if (getActiveProvider(preferences) === "fireworks") {
    if (!preferences.fireworksApiKey?.trim()) {
      return {
        valid: false,
        errorTitle: "Fireworks API key required",
        errorMessage: "Add your Fireworks API key in extension preferences",
      };
    }

    return { valid: true };
  }

  if (!preferences.openaiApiKey?.trim()) {
    return {
      valid: false,
      errorTitle: "OpenAI API key required",
      errorMessage: "Add your OpenAI API key in extension preferences",
    };
  }

  return { valid: true };
}

export function getRenameLanguageModel(preferences: RenamePreferences): LanguageModel {
  if (getActiveProvider(preferences) === "fireworks") {
    const fireworks = createFireworks({
      apiKey: preferences.fireworksApiKey.trim(),
    });

    return fireworks(resolveFireworksModel(preferences));
  }

  const openai = createOpenAI({
    apiKey: preferences.openaiApiKey.trim(),
  });

  return openai(resolveOpenAIModel(preferences));
}

export function getActiveApiKey(preferences: RenamePreferences): string {
  return getActiveProvider(preferences) === "fireworks" ? preferences.fireworksApiKey : preferences.openaiApiKey;
}

export function formatRenameAiError(error: unknown, provider: RenameProvider, model: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (provider === "fireworks" && /model not found|unknown model|does not exist/i.test(message)) {
    return `Fireworks model "${model}" is not available on your account. Check the model ID in Fireworks AI Studio.`;
  }

  return message;
}
