import { toTitleCase } from "../rename-sanitize";
import { applyStripRules, normalizeSeparators } from "./strip-rules";
import type { RenameCandidate } from "./types";

type FileCategory = "video" | "audio" | "image" | "document" | "archive" | "other";

const EXTENSION_CATEGORIES: Record<FileCategory, Set<string>> = {
  video: new Set(["mkv", "mp4", "avi", "mov", "wmv", "m4v", "webm", "mpg", "mpeg", "ts", "m2ts", "flv", "3gp"]),
  audio: new Set(["mp3", "flac", "wav", "aac", "m4a", "ogg", "opus", "wma", "alac", "aiff"]),
  image: new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "tif", "tiff", "bmp", "avif", "raw", "cr2", "nef"]),
  document: new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "csv", "epub"]),
  archive: new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"]),
  other: new Set(),
};

function getFileCategory(extension: string): FileCategory {
  const ext = extension.replace(/^\./, "").toLowerCase();

  for (const [category, extensions] of Object.entries(EXTENSION_CATEGORIES) as [FileCategory, Set<string>][]) {
    if (category !== "other" && extensions.has(ext)) {
      return category;
    }
  }

  return "other";
}

function cleanImageBaseName(baseName: string): string {
  let value = normalizeSeparators(baseName);
  value = value
    .replace(/^IMG[_-]?\d+/i, "")
    .replace(/^DSC[_-]?\d+/i, "")
    .replace(/^P\d{7,}/i, "");
  return applyStripRules(value);
}

function cleanDocumentBaseName(baseName: string): string {
  let value = normalizeSeparators(baseName);
  value = value.replace(/\b(?:v|ver|version|rev|draft|final|copy)\s*\d+\b/gi, "");
  value = value.replace(/\b\d{8,}\b/g, "");
  return applyStripRules(value);
}

function cleanArchiveBaseName(baseName: string): string {
  return applyStripRules(normalizeSeparators(baseName));
}

function cleanGenericBaseName(baseName: string): string {
  return applyStripRules(normalizeSeparators(baseName));
}

export function candidateFromExtensionPreset(extension: string, baseName: string): RenameCandidate | undefined {
  const category = getFileCategory(extension);
  let cleaned = baseName;

  switch (category) {
    case "image":
      cleaned = cleanImageBaseName(baseName);
      break;
    case "document":
      cleaned = cleanDocumentBaseName(baseName);
      break;
    case "archive":
      cleaned = cleanArchiveBaseName(baseName);
      break;
    default:
      cleaned = cleanGenericBaseName(baseName);
      break;
  }

  const formatted = toTitleCase(cleaned);
  if (!formatted) {
    return undefined;
  }

  const confidenceByCategory: Record<FileCategory, number> = {
    video: 52,
    audio: 54,
    image: 56,
    document: 55,
    archive: 50,
    other: 48,
  };

  return {
    baseName: formatted,
    confidence: confidenceByCategory[category],
    source: "extension-preset",
  };
}
