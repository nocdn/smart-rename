import { basename, dirname, extname } from "path";

import { guessit } from "guessit-js";

import { toTitleCase } from "../rename-sanitize";
import type { LocalRenameContext, RenameCandidate } from "./types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function buildLocalRenameContext(
  filePath: string,
  extension: string,
  currentBaseName: string,
  allPaths: string[],
): LocalRenameContext {
  const folderPath = dirname(filePath);
  const siblingBaseNames = allPaths
    .filter((path) => dirname(path) === folderPath && path !== filePath)
    .map((path) => basename(path, extname(path)));

  const seriesVotes = new Map<string, number>();

  for (const sibling of siblingBaseNames) {
    try {
      const parsed = guessit(sibling);
      const title = asString(parsed.title);
      if (title) {
        seriesVotes.set(title, (seriesVotes.get(title) ?? 0) + 1);
      }
    } catch {
      // ignore sibling parse failures
    }
  }

  const inferredSeriesTitle = [...seriesVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    filePath,
    extension,
    currentBaseName,
    folderPath,
    siblingBaseNames,
    inferredSeriesTitle,
  };
}

export function applyBatchContextBoost(candidate: RenameCandidate, context: LocalRenameContext): RenameCandidate {
  if (!context.inferredSeriesTitle) {
    return candidate;
  }

  const series = toTitleCase(context.inferredSeriesTitle);
  if (candidate.baseName.toLowerCase().includes(series.toLowerCase())) {
    return { ...candidate, confidence: candidate.confidence + 6 };
  }

  return candidate;
}
