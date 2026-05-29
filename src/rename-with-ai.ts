import { streamText } from "ai";
import { basename, extname } from "path";

import { buildRenamePrompt, parseSuggestedBaseName } from "./default-prompt";
import { createLogger, maskApiKey } from "./logger";
import { finalizeSuggestedBaseName, renameFilesBatch, reportProgress } from "./rename-batch";
import { sanitizeBaseName } from "./rename-sanitize";
import {
  formatRenameAiError,
  getActiveApiKey,
  getActiveProvider,
  getRenameProviderOptions,
  getRenameLanguageModel,
  isFireworksReasoningEnabled,
  isRenameReasoningEnabled,
  resolveActiveModel,
  resolveOpenAIReasoningEffort,
  type RenamePreferences,
} from "./rename-preferences";
import type { RenameProgressHandler, RenameResult } from "./rename-types";

const log = createLogger("rename-ai");

export type { RenamePreferences } from "./rename-preferences";

async function suggestBaseNameWithAI(
  filePath: string,
  preferences: RenamePreferences,
  onProgress: RenameProgressHandler | undefined,
  fileIndex: number,
  fileCount: number,
): Promise<string | undefined> {
  const startedAt = Date.now();
  const extension = extname(filePath);
  const currentBaseName = basename(filePath, extension);
  const currentFilename = basename(filePath);
  const usingDefaultPrompt = !preferences.renamePrompt.trim();
  const provider = getActiveProvider(preferences);
  const model = resolveActiveModel(preferences);
  const prompt = buildRenamePrompt(preferences.renamePrompt, currentFilename);
  const reasoningEnabled = isRenameReasoningEnabled(preferences);

  log.step("Requesting AI rename suggestion", {
    filePath,
    currentFilename,
    currentBaseName,
    extension,
    provider,
    model,
    reasoningEffort: provider === "openai" ? resolveOpenAIReasoningEffort(preferences) : undefined,
    reasoningEnabled: provider === "fireworks" ? isFireworksReasoningEnabled(preferences) : undefined,
    usingDefaultPrompt,
    promptLength: prompt.length,
    apiKey: maskApiKey(getActiveApiKey(preferences)),
    responseMode: "plain-text-stream",
  });

  reportProgress(onProgress, {
    phase: reasoningEnabled ? "sending" : "renaming",
    filePath,
    fileIndex,
    fileCount,
  });

  const result = streamText({
    model: getRenameLanguageModel(preferences),
    prompt,
    providerOptions: getRenameProviderOptions(preferences),
  });

  let streamedText = "";

  for await (const chunk of result.fullStream) {
    if (chunk.type === "reasoning-start" || chunk.type === "reasoning-delta") {
      if (reasoningEnabled) {
        reportProgress(onProgress, {
          phase: "reasoning",
          filePath,
          fileIndex,
          fileCount,
        });
      }
      continue;
    }

    if (chunk.type === "text-delta") {
      streamedText += chunk.text;
      const partialName = sanitizeBaseName(parseSuggestedBaseName(streamedText));

      reportProgress(onProgress, {
        phase: "renaming",
        filePath,
        fileIndex,
        fileCount,
        suggestedName: partialName || undefined,
      });
    }
  }

  const text = streamedText || (await result.text);
  const rawSuggestedBaseName = parseSuggestedBaseName(text);

  log.info("Received AI rename suggestion", {
    filePath,
    provider,
    model,
    rawResponse: text,
    rawSuggestedBaseName,
    durationMs: Date.now() - startedAt,
  });

  return finalizeSuggestedBaseName(sanitizeBaseName(rawSuggestedBaseName), currentBaseName);
}

export async function renameFilesWithAI(
  paths: string[],
  preferences: RenamePreferences,
  onProgress?: RenameProgressHandler,
): Promise<RenameResult[]> {
  const provider = getActiveProvider(preferences);
  const model = resolveActiveModel(preferences);

  return renameFilesBatch(
    paths,
    (filePath, fileIndex, fileCount, progress) =>
      suggestBaseNameWithAI(filePath, preferences, progress, fileIndex, fileCount),
    {
      modeLabel: "AI",
      onProgress,
      formatError: (error) => formatRenameAiError(error, provider, model),
    },
  );
}
