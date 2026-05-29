export type CandidateSource =
  | "guessit-js"
  | "parse-torrent-title"
  | "tv-regex"
  | "movie-regex"
  | "music-regex"
  | "anime-regex"
  | "strip-rules"
  | "extension-preset"
  | "batch-context"
  | "user-rules";

export interface RenameCandidate {
  baseName: string;
  confidence: number;
  source: CandidateSource;
}

export interface LocalRenameContext {
  filePath: string;
  extension: string;
  currentBaseName: string;
  folderPath: string;
  siblingBaseNames: string[];
  inferredSeriesTitle?: string;
}
