export type RenameProgressPhase = "sending" | "reasoning" | "renaming";

export interface RenameProgressUpdate {
  phase: RenameProgressPhase;
  filePath: string;
  fileIndex: number;
  fileCount: number;
  suggestedName?: string;
}

export type RenameProgressHandler = (update: RenameProgressUpdate) => void;

export interface RenameResult {
  path: string;
  newPath?: string;
  skipped?: boolean;
  reason?: string;
}
