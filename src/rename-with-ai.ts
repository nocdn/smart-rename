import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { rename, stat } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { z } from "zod";

import { DEFAULT_RENAME_PROMPT } from "./default-prompt";

const MODEL = "gpt-5.5";

export interface RenamePreferences {
  openaiApiKey: string;
  renamePrompt: string;
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

  while (true) {
    try {
      await stat(candidate);
      candidate = join(directory, `${baseName} ${counter}${extension}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

async function suggestBaseName(filePath: string, preferences: RenamePreferences): Promise<string | undefined> {
  const extension = extname(filePath);
  const currentBaseName = basename(filePath, extension);
  const prompt = preferences.renamePrompt.trim() || DEFAULT_RENAME_PROMPT;
  const openai = createOpenAI({ apiKey: preferences.openaiApiKey.trim() });

  const { output } = await generateText({
    model: openai(MODEL),
    output: Output.object({
      schema: z.object({
        newBaseName: z.string().describe("The new filename without extension"),
      }),
    }),
    prompt: `${prompt}\n\nCurrent filename: ${basename(filePath)}`,
  });

  const sanitized = sanitizeBaseName(output.newBaseName);
  if (!sanitized || sanitized === currentBaseName) {
    return undefined;
  }

  return sanitized;
}

export async function renameFilesWithAI(paths: string[], preferences: RenamePreferences): Promise<RenameResult[]> {
  const results: RenameResult[] = [];

  for (const path of paths) {
    try {
      const newBaseName = await suggestBaseName(path, preferences);
      if (!newBaseName) {
        results.push({ path, skipped: true, reason: "Name already looks good" });
        continue;
      }

      const extension = extname(path);
      const directory = dirname(path);
      const targetPath = await uniquePath(join(directory, `${newBaseName}${extension}`));

      await rename(path, targetPath);
      results.push({ path, newPath: targetPath });
    } catch (error) {
      results.push({
        path,
        skipped: true,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
