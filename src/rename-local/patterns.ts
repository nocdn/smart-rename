import { formatSeasonEpisode, toTitleCase } from "../rename-sanitize";
import type { RenameCandidate } from "./types";

function candidate(
  baseName: string,
  confidence: number,
  source: RenameCandidate["source"],
): RenameCandidate | undefined {
  const trimmed = baseName.trim();
  if (!trimmed) {
    return undefined;
  }

  return { baseName: toTitleCase(trimmed), confidence, source };
}

export function candidatesFromTvRegex(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];
  const normalized = baseName.replace(/[._]+/g, " ");

  const patterns: Array<{ regex: RegExp; build: (match: RegExpMatchArray) => string }> = [
    {
      regex: /^(.+?)[.\s-]+S(\d{1,2})E(\d{1,2})[.\s-]+(.+)$/i,
      build: (m) => `${m[1]} ${formatSeasonEpisode(Number(m[2]), Number(m[3]))} ${m[4]}`,
    },
    {
      regex: /^(.+?)[.\s-]+(\d{1,2})x(\d{1,2})[.\s-]*(.+)?$/i,
      build: (m) => `${m[1]} ${formatSeasonEpisode(Number(m[2]), Number(m[3]))}${m[4] ? ` ${m[4]}` : ""}`,
    },
    {
      regex: /^(.+?)[.\s-]+Season[.\s-]*(\d{1,2})[.\s-]+Episode[.\s-]*(\d{1,2})[.\s-]*(.+)?$/i,
      build: (m) => `${m[1]} ${formatSeasonEpisode(Number(m[2]), Number(m[3]))}${m[4] ? ` ${m[4]}` : ""}`,
    },
    {
      regex: /^(.+?)[.\s-]+S(\d{1,2})[.\s-]+E(\d{1,2})[.\s-]*(.+)?$/i,
      build: (m) => `${m[1]} ${formatSeasonEpisode(Number(m[2]), Number(m[3]))}${m[4] ? ` ${m[4]}` : ""}`,
    },
  ];

  for (const { regex, build } of patterns) {
    const match = normalized.match(regex);
    if (match) {
      const built = candidate(build(match), 72, "tv-regex");
      if (built) {
        candidates.push(built);
      }
    }
  }

  return candidates;
}

export function candidatesFromMovieRegex(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];
  const normalized = baseName.replace(/[._]+/g, " ");

  const patterns = [/^(.+?)[.\s(]+((?:19|20)\d{2})[)\s].*$/i, /^(.+?)[.\s-]+((?:19|20)\d{2})$/i];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (match) {
      const built = candidate(`${match[1]} (${match[2]})`, 68, "movie-regex");
      if (built) {
        candidates.push(built);
      }
    }
  }

  return candidates;
}

export function candidatesFromMusicRegex(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];
  const normalized = baseName.replace(/[._]+/g, " ");

  const trackMatch = normalized.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d{1,3})\s*[-.]?\s*(.+)$/i);
  if (trackMatch) {
    const built = candidate(
      `${trackMatch[1]} - ${trackMatch[4]} (${trackMatch[2]} ${trackMatch[3].padStart(2, "0")})`,
      66,
      "music-regex",
    );
    if (built) {
      candidates.push(built);
    }
  }

  const simpleMatch = normalized.match(/^(.+?)\s*-\s*(.+)$/);
  if (simpleMatch) {
    const built = candidate(`${simpleMatch[1]} - ${simpleMatch[2]}`, 58, "music-regex");
    if (built) {
      candidates.push(built);
    }
  }

  return candidates;
}

export function candidatesFromAnimeRegex(baseName: string): RenameCandidate[] {
  const candidates: RenameCandidate[] = [];
  const normalized = baseName.replace(/[._]+/g, " ");

  const bracketMatch = normalized.match(/^\[([^\]]+)\]\s*(.+?)\s*-\s*(\d{1,3})(?:\s*|\(|$)/i);
  if (bracketMatch) {
    const built = candidate(
      `${bracketMatch[2]} - ${bracketMatch[3].padStart(2, "0")} [${bracketMatch[1]}]`,
      64,
      "anime-regex",
    );
    if (built) {
      candidates.push(built);
    }
  }

  const episodeMatch = normalized.match(/^(.+?)\s*-\s*(\d{1,3})(?:\s+v\d+)?$/i);
  if (episodeMatch) {
    const built = candidate(`${episodeMatch[1]} - ${episodeMatch[2].padStart(2, "0")}`, 60, "anime-regex");
    if (built) {
      candidates.push(built);
    }
  }

  return candidates;
}
