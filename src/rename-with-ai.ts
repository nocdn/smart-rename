import { streamText } from "ai";
import { rename, stat } from "fs/promises";
import { basename, dirname, extname, join } from "path";

import { buildRenamePrompt, parseSuggestedBaseName } from "./default-prompt";
import { createLogger, maskApiKey } from "./logger";
import {
  formatRenameAiError,
  getActiveApiKey,
  getActiveProvider,
  getRenameProviderOptions,
  getRenameLanguageModel,
  isFireworksReasoningEnabled,
  resolveActiveModel,
  resolveOpenAIReasoningEffort,
  type RenamePreferences,
} from "./rename-preferences";

const log = createLogger("rename-ai");

export type { RenamePreferences } from "./rename-preferences";

export type RenameProgressPhase = "sending" | "reasoning" | "renaming";

export interface RenameProgressUpdate {
  phase: RenameProgressPhase;
  filePath: string;
  fileIndex: number;
  fileCount: number;
  suggestedName?: string;
}

export type RenameProgressHandler = (update: RenameProgressUpdate) => void;

export interface RenameResult {
  path: string;
  newPath?: string;
  skipped?: boolean;
  reason?: string;
}

export function formatFileNamedMessage(filename: string): string {
  return `File named ${filename}`;
}

function sanitizeBaseName(name: string): string {
  return name
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function uniquePath(path: string): Promise<string> {
  const directory = dirname(path);
  const extension = extname(path);
  const baseName = basename(path, extension);
  let candidate = path;
  let counter = 2;

  log.debug("Resolving unique target path", { originalPath: path });

  while (true) {
    try {
      await stat(candidate);
      log.debug("Target path already exists; trying next suffix", { candidate, counter });
      candidate = join(directory, `${baseName} ${counter}${extension}`);
      counter += 1;
    } catch {
      if (candidate !== path) {
        log.info("Resolved unique target path", { originalPath: path, uniquePath: candidate });
      }
      return candidate;
    }
  }
}

function reportProgress(onProgress: RenameProgressHandler | undefined, update: RenameProgressUpdate): void {
  onProgress?.(update);
}

async function suggestBaseName(
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
    phase: "sending",
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
      reportProgress(onProgress, {
        phase: "reasoning",
        filePath,
        fileIndex,
        fileCount,
      });
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

  const sanitized = sanitizeBaseName(rawSuggestedBaseName);

  log.debug("Sanitized AI suggestion", {
    filePath,
    sanitizedBaseName: sanitized,
    currentBaseName,
  });

  if (!sanitized || sanitized === currentBaseName) {
    log.info("Skipping file because suggested name is unchanged or empty", {
      filePath,
      sanitizedBaseName: sanitized,
      currentBaseName,
    });
    return undefined;
  }

  return sanitized;
}

export async function renameFilesWithAI(
  paths: string[],
  preferences: RenamePreferences,
  onProgress?: RenameProgressHandler,
): Promise<RenameResult[]> {
  const startedAt = Date.now();
  const provider = getActiveProvider(preferences);
  const model = resolveActiveModel(preferences);

  log.step("Starting AI rename batch", {
    fileCount: paths.length,
    paths,
    provider,
    model,
    apiKey: maskApiKey(getActiveApiKey(preferences)),
    usingCustomPrompt: Boolean(preferences.renamePrompt.trim()),
    responseMode: "plain-text-stream",
  });

  const results: RenameResult[] = [];

  for (const [index, path] of paths.entries()) {
    const fileStartedAt = Date.now();
    log.step(`Processing file ${index + 1}/${paths.length}`, { path });

    try {
      const newBaseName = await suggestBaseName(path, preferences, onProgress, index, paths.length);
      if (!newBaseName) {
        const result = { path, skipped: true, reason: "Name already looks good" };
        results.push(result);
        log.info("File skipped", { ...result, durationMs: Date.now() - fileStartedAt });
        continue;
      }

      const extension = extname(path);
      const directory = dirname(path);
      const proposedPath = join(directory, `${newBaseName}${extension}`);
      const targetPath = await uniquePath(proposedPath);

      reportProgress(onProgress, {
        phase: "renaming",
        filePath: path,
        fileIndex: index,
        fileCount: paths.length,
        suggestedName: basename(targetPath),
      });

      log.info("Renaming file on disk", {
        from: path,
        to: targetPath,
        proposedPath,
        collisionAvoided: proposedPath !== targetPath,
      });

      await rename(path, targetPath);

      const result = { path, newPath: targetPath };
      results.push(result);
      log.info("File renamed successfully", { ...result, durationMs: Date.now() - fileStartedAt });
    } catch (error) {
      const result = {
        path,
        skipped: true,
        reason: formatRenameAiError(error, provider, model),
      };
      results.push(result);
      log.error("File rename failed", {
        ...result,
        error,
        durationMs: Date.now() - fileStartedAt,
      });
    }
  }

  const renamed = results.filter((result) => result.newPath).length;
  const skipped = results.filter((result) => result.skipped && result.reason === "Name already looks good").length;
  const failed = results.filter((result) => result.skipped && result.reason !== "Name already looks good").length;

  log.duration("AI rename batch", startedAt, {
    provider,
    model,
    fileCount: paths.length,
    renamed,
    skipped,
    failed,
    results,
  });

  return results;
}

export function formatRenamedSuccessMessage(results: RenameResult[]): string {
  const renamedPaths = results.filter((result) => result.newPath).map((result) => basename(result.newPath!));

  if (renamedPaths.length === 0) {
    return "";
  }

  if (renamedPaths.length === 1) {
    return formatFileNamedMessage(renamedPaths[0]);
  }

  return renamedPaths.map((filename) => formatFileNamedMessage(filename)).join("\n");
}
