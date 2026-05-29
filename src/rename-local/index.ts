import { basename, extname } from "path";

import { createLogger } from "../logger";
import { finalizeSuggestedBaseName, renameFilesBatch, reportProgress } from "../rename-batch";
import type { RenamePreferences } from "../rename-preferences";
import type { RenameProgressHandler, RenameResult } from "../rename-types";
import { suggestLocalBaseName } from "./pipeline";

const log = createLogger("rename-local");

export async function renameFilesLocally(
  paths: string[],
  preferences: RenamePreferences,
  onProgress?: RenameProgressHandler,
): Promise<RenameResult[]> {
  log.step("Starting offline rename batch", {
    fileCount: paths.length,
    techniques: [
      "guessit-js",
      "parse-torrent-title",
      "tv-regex",
      "movie-regex",
      "music-regex",
      "anime-regex",
      "strip-rules",
      "extension-preset",
      "batch-context",
      "user-rules",
    ],
  });

  return renameFilesBatch(
    paths,
    async (filePath, fileIndex, fileCount, progress) => {
      reportProgress(progress, {
        phase: "renaming",
        filePath,
        fileIndex,
        fileCount,
      });

      const startedAt = Date.now();
      const extension = extname(filePath);
      const currentBaseName = basename(filePath, extension);
      const { baseName, winnerSource, candidateCount } = suggestLocalBaseName(filePath, preferences, paths);

      if (baseName) {
        reportProgress(progress, {
          phase: "renaming",
          filePath,
          fileIndex,
          fileCount,
          suggestedName: `${baseName}${extension}`,
        });
      }

      log.info("Offline rename suggestion", {
        filePath,
        currentBaseName,
        suggestedBaseName: baseName,
        winnerSource,
        candidateCount,
        durationMs: Date.now() - startedAt,
      });

      return finalizeSuggestedBaseName(baseName ?? "", currentBaseName);
    },
    {
      modeLabel: "offline",
      onProgress,
      formatError: (error) => (error instanceof Error ? error.message : String(error)),
    },
  );
}
