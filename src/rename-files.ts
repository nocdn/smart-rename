import { basename } from "path";

import { isCloudModelEnabled, type RenamePreferences } from "./rename-preferences";
import { renameFilesLocally } from "./rename-local";
import { renameFilesWithAI } from "./rename-with-ai";
import type { RenameProgressHandler, RenameResult } from "./rename-types";

export type { RenameProgressHandler, RenameProgressPhase, RenameProgressUpdate, RenameResult } from "./rename-types";

export async function renameFiles(
  paths: string[],
  preferences: RenamePreferences,
  onProgress?: RenameProgressHandler,
): Promise<RenameResult[]> {
  if (isCloudModelEnabled(preferences)) {
    return renameFilesWithAI(paths, preferences, onProgress);
  }

  return renameFilesLocally(paths, preferences, onProgress);
}

function formatRenameDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatRenamedSuccessToast(
  results: RenameResult[],
  durationMs: number,
): { title: string; message: string } {
  const renamed = results.filter((result) => result.newPath);
  const duration = formatRenameDuration(durationMs);

  if (renamed.length === 0) {
    return { title: "Renamed", message: "" };
  }

  if (renamed.length === 1) {
    return {
      title: "Renamed",
      message: `${basename(renamed[0].newPath!)} · ${duration}`,
    };
  }

  return {
    title: "Renamed Batch",
    message: duration,
  };
}
