import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { rename, stat } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { z } from "zod";

import { DEFAULT_RENAME_PROMPT } from "./default-prompt";
import { createLogger, maskApiKey } from "./logger";

const log = createLogger("rename-ai");

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export interface RenamePreferences {
  openaiApiKey: string;
  openaiModel: string;
  renamePrompt: string;
}

function resolveModel(preferences: RenamePreferences): string {
  return preferences.openaiModel?.trim() || DEFAULT_OPENAI_MODEL;
}

export interface RenameResult {
  path: string;
  newPath?: string;
  skipped?: boolean;
  reason?: string;
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

async function suggestBaseName(filePath: string, preferences: RenamePreferences): Promise<string | undefined> {
  const startedAt = Date.now();
  const extension = extname(filePath);
  const currentBaseName = basename(filePath, extension);
  const prompt = preferences.renamePrompt.trim() || DEFAULT_RENAME_PROMPT;
  const usingDefaultPrompt = !preferences.renamePrompt.trim();
  const model = resolveModel(preferences);

  log.step("Requesting AI rename suggestion", {
    filePath,
    currentFilename: basename(filePath),
    currentBaseName,
    extension,
    model,
    usingDefaultPrompt,
    promptLength: prompt.length,
    apiKey: maskApiKey(preferences.openaiApiKey),
  });

  const openai = createOpenAI({ apiKey: preferences.openaiApiKey.trim() });

  const { output } = await generateText({
    model: openai(model),
    output: Output.object({
      schema: z.object({
        newBaseName: z.string().describe("The new filename without extension"),
      }),
    }),
    prompt: `${prompt}\n\nCurrent filename: ${basename(filePath)}`,
  });

  log.info("Received AI rename suggestion", {
    filePath,
    rawSuggestedBaseName: output.newBaseName,
    durationMs: Date.now() - startedAt,
  });

  const sanitized = sanitizeBaseName(output.newBaseName);

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

export async function renameFilesWithAI(paths: string[], preferences: RenamePreferences): Promise<RenameResult[]> {
  const startedAt = Date.now();

  log.step("Starting AI rename batch", {
    fileCount: paths.length,
    paths,
    model: resolveModel(preferences),
    apiKey: maskApiKey(preferences.openaiApiKey),
    usingCustomPrompt: Boolean(preferences.renamePrompt.trim()),
  });

  const results: RenameResult[] = [];

  for (const [index, path] of paths.entries()) {
    const fileStartedAt = Date.now();
    log.step(`Processing file ${index + 1}/${paths.length}`, { path });

    try {
      const newBaseName = await suggestBaseName(path, preferences);
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
        reason: error instanceof Error ? error.message : String(error),
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
    fileCount: paths.length,
    renamed,
    skipped,
    failed,
    results,
  });

  return results;
}
