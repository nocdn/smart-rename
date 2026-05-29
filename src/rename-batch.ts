import { rename, stat } from "fs/promises";
import { basename, dirname, extname, join } from "path";

import { createLogger } from "./logger";
import { sanitizeBaseName } from "./rename-sanitize";
import type { RenameProgressHandler, RenameProgressUpdate, RenameResult } from "./rename-types";

const log = createLogger("rename-batch");

export function reportProgress(onProgress: RenameProgressHandler | undefined, update: RenameProgressUpdate): void {
  onProgress?.(update);
}

export async function uniquePath(path: string): Promise<string> {
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

export type SuggestBaseNameFn = (
  filePath: string,
  fileIndex: number,
  fileCount: number,
  onProgress?: RenameProgressHandler,
) => Promise<string | undefined>;

export async function renameFilesBatch(
  paths: string[],
  suggestBaseName: SuggestBaseNameFn,
  options: {
    modeLabel: string;
    onProgress?: RenameProgressHandler;
    formatError: (error: unknown) => string;
  },
): Promise<RenameResult[]> {
  const startedAt = Date.now();
  const results: RenameResult[] = [];

  log.step(`Starting ${options.modeLabel} rename batch`, { fileCount: paths.length, paths });

  for (const [index, path] of paths.entries()) {
    const fileStartedAt = Date.now();

    try {
      const newBaseName = await suggestBaseName(path, index, paths.length, options.onProgress);
      const extension = extname(path);

      if (!newBaseName) {
        const result = { path, skipped: true, reason: "Name already looks good" };
        results.push(result);
        log.info("File skipped", { ...result, durationMs: Date.now() - fileStartedAt });
        continue;
      }

      const directory = dirname(path);
      const proposedPath = join(directory, `${newBaseName}${extension}`);
      const targetPath = await uniquePath(proposedPath);

      options.onProgress?.({
        phase: "renaming",
        filePath: path,
        fileIndex: index,
        fileCount: paths.length,
        suggestedName: basename(targetPath),
      });

      await rename(path, targetPath);

      const result = { path, newPath: targetPath };
      results.push(result);
      log.info("File renamed successfully", { ...result, durationMs: Date.now() - fileStartedAt });
    } catch (error) {
      const result = {
        path,
        skipped: true,
        reason: options.formatError(error),
      };
      results.push(result);
      log.error("File rename failed", { ...result, error, durationMs: Date.now() - fileStartedAt });
    }
  }

  const renamed = results.filter((result) => result.newPath).length;
  const skipped = results.filter((result) => result.skipped && result.reason === "Name already looks good").length;
  const failed = results.filter((result) => result.skipped && result.reason !== "Name already looks good").length;

  log.duration(`${options.modeLabel} rename batch`, startedAt, {
    fileCount: paths.length,
    renamed,
    skipped,
    failed,
    results,
  });

  return results;
}

export function finalizeSuggestedBaseName(suggested: string, currentBaseName: string): string | undefined {
  const sanitized = sanitizeBaseName(suggested);

  if (!sanitized || sanitized === currentBaseName) {
    return undefined;
  }

  return sanitized;
}
