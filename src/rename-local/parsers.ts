import { guessit } from "guessit-js";
import parseTorrentTitle from "parse-torrent-title";

import { formatSeasonEpisode, toTitleCase } from "../rename-sanitize";
import type { RenameCandidate } from "./types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildEpisodeTitle(
  title: string,
  season?: number,
  episode?: number,
  episodeTitle?: string,
): string | undefined {
  if (!title) {
    return undefined;
  }

  const parts = [title];

  if (season !== undefined && episode !== undefined) {
    parts.push(formatSeasonEpisode(season, episode));
  }

  if (episodeTitle) {
    parts.push(episodeTitle);
  }

  return toTitleCase(parts.join(" "));
}

export function candidatesFromGuessit(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];

  try {
    const parsed = guessit(baseName);
    const title = asString(parsed.title);
    const type = asString(parsed.type);
    const season = asNumber(parsed.season);
    const episode = asNumber(parsed.episode);
    const episodeTitle = asString(parsed.episode_title) ?? asString(parsed.alternative_title);
    const year = asNumber(parsed.year);

    if (type === "episode" && title) {
      const built = buildEpisodeTitle(title, season, episode, episodeTitle);
      if (built) {
        candidates.push({ baseName: built, confidence: episodeTitle ? 92 : 88, source: "guessit-js" });
      }
      return candidates;
    }

    if (title && year) {
      candidates.push({
        baseName: toTitleCase(`${title} (${year})`),
        confidence: 84,
        source: "guessit-js",
      });
      return candidates;
    }

    if (title) {
      candidates.push({ baseName: toTitleCase(title), confidence: 78, source: "guessit-js" });
    }
  } catch {
    // guessit-js failed on this input; other techniques may still match.
  }

  return candidates;
}

export function candidatesFromTorrentTitle(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];

  try {
    const parsed = parseTorrentTitle.parse(baseName) as Record<string, unknown>;
    const title = asString(parsed.title) ?? asString(parsed.show);
    const season = asNumber(parsed.season);
    const episode = asNumber(parsed.episode);
    const year = asNumber(parsed.year);

    if (title && season !== undefined && episode !== undefined) {
      const built = buildEpisodeTitle(title, season, episode);
      if (built) {
        candidates.push({ baseName: built, confidence: 80, source: "parse-torrent-title" });
      }
      return candidates;
    }

    if (title && year) {
      candidates.push({
        baseName: toTitleCase(`${title} (${year})`),
        confidence: 74,
        source: "parse-torrent-title",
      });
      return candidates;
    }

    if (title) {
      candidates.push({ baseName: toTitleCase(title), confidence: 70, source: "parse-torrent-title" });
    }
  } catch {
    // parse-torrent-title failed on this input.
  }

  return candidates;
}
