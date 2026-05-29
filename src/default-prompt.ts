export const DEFAULT_RENAME_PROMPT = `You rename files to clean, human-readable titles.

Rules:
- Remove resolution tags (1080p, 4K, 2160p), dates, timestamps, version numbers, build numbers, download IDs, UUIDs, and random hashes.
- Remove redundant words like "final", "copy", "download", and "(1)".
- Replace dots, underscores, and dashes with spaces.
- Use Title Case for words.
- Keep meaningful descriptive words.`;

export const RENAME_OUTPUT_INSTRUCTION = `Return exactly one line of plain text: the new base filename only.
Do not include the file extension, path, JSON, markdown, code fences, quotes, labels, or any explanation.`;

export function buildRenamePrompt(renamePrompt: string, currentFilename: string): string {
  const instructions = renamePrompt.trim() || DEFAULT_RENAME_PROMPT;

  return `${instructions}

Current filename: ${currentFilename}

${RENAME_OUTPUT_INSTRUCTION}`;
}

export function parseSuggestedBaseName(text: string): string {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";

  if (!firstLine.startsWith("{") && !firstLine.startsWith("[")) {
    return firstLine;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidate =
      parsed.newBaseName ?? parsed.new_base_filename ?? parsed.new_base_name ?? parsed.filename ?? parsed.name;

    if (typeof candidate === "string") {
      return candidate.trim();
    }
  } catch {
    // Treat the first line as plain text if JSON parsing fails.
  }

  return firstLine;
}
