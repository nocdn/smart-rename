import { basename, extname } from "path";

import { createLogger } from "../logger";
import type { RenamePreferences } from "../rename-preferences";
import { applyBatchContextBoost, buildLocalRenameContext } from "./batch-context";
import { candidateFromExtensionPreset } from "./extension-preset";
import {
  candidatesFromAnimeRegex,
  candidatesFromMovieRegex,
  candidatesFromMusicRegex,
  candidatesFromTvRegex,
} from "./patterns";
import { candidatesFromGuessit, candidatesFromTorrentTitle } from "./parsers";
import { pickBestLocalCandidate } from "./pick-best";
import { toTitleCase } from "../rename-sanitize";
import { applyStripRules } from "./strip-rules";
import type { LocalRenameContext, RenameCandidate } from "./types";
import { candidatesFromUserRules } from "./user-rules";

const log = createLogger("rename-local");

function collectCandidates(context: LocalRenameContext, preferences: RenamePreferences): RenameCandidate[] {
  const { currentBaseName, extension } = context;
  const candidates: RenameCandidate[] = [];

  candidates.push(...candidatesFromGuessit(currentBaseName));
  candidates.push(...candidatesFromTorrentTitle(currentBaseName));
  candidates.push(...candidatesFromTvRegex(currentBaseName));
  candidates.push(...candidatesFromMovieRegex(currentBaseName));
  candidates.push(...candidatesFromMusicRegex(currentBaseName));
  candidates.push(...candidatesFromAnimeRegex(currentBaseName));
  candidates.push(...candidatesFromUserRules(currentBaseName, preferences.renamePrompt));

  const extensionCandidate = candidateFromExtensionPreset(extension, currentBaseName);
  if (extensionCandidate) {
    candidates.push(extensionCandidate);
  }

  const stripped = applyStripRules(currentBaseName);
  if (stripped && stripped !== currentBaseName) {
    candidates.push({ baseName: toTitleCase(stripped), confidence: 50, source: "strip-rules" });
  }

  return candidates.map((candidate) => applyBatchContextBoost(candidate, context));
}

export function suggestLocalBaseName(
  filePath: string,
  preferences: RenamePreferences,
  allPaths: string[],
): { baseName?: string; context: LocalRenameContext; candidateCount: number; winnerSource?: string } {
  const extension = extname(filePath);
  const currentBaseName = basename(filePath, extension);
  const context = buildLocalRenameContext(filePath, extension, currentBaseName, allPaths);
  const candidates = collectCandidates(context, preferences);
  const winner = pickBestLocalCandidate(candidates, context);

  log.debug("Local rename candidates evaluated", {
    filePath,
    currentBaseName,
    candidateCount: candidates.length,
    winner: winner?.baseName,
    winnerSource: winner?.source,
    winnerConfidence: winner?.confidence,
    inferredSeriesTitle: context.inferredSeriesTitle,
  });

  return {
    baseName: winner?.baseName,
    context,
    candidateCount: candidates.length,
    winnerSource: winner?.source,
  };
}
