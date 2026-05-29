/** Characters illegal in filenames on macOS and Windows. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

const PRESERVE_TOKEN_PATTERN =
  /^(S\d{1,2}E\d{1,2}|S\d{1,2}|E\d{1,2}|\d{3,4}p|HDR10|HDR10\+|HDR|AC3|AAC|DD5\.1|DD2\.0|HEVC|H\.264|H\.265|x264|x265|WEB-DL|WEBRip|BluRay)$/i;

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
]);

export function sanitizeBaseName(name: string): string {
  return name
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(ILLEGAL_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeForComparison(name: string): string {
  return sanitizeBaseName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function toTitleCase(name: string): string {
  const words = sanitizeBaseName(name).split(" ");

  return words
    .map((word, index) => {
      if (!word) {
        return word;
      }

      if (PRESERVE_TOKEN_PATTERN.test(word)) {
        if (/^S\d{1,2}E\d{1,2}$/i.test(word)) {
          const match = word.match(/^S(\d{1,2})E(\d{1,2})$/i);
          if (match) {
            return `S${match[1].padStart(2, "0")}E${match[2].padStart(2, "0")}`;
          }
        }

        if (/^\d{3,4}p$/i.test(word)) {
          return word.toLowerCase();
        }

        return word.replace(/h\.?264/i, "H.264").replace(/h\.?265/i, "H.265");
      }

      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function formatSeasonEpisode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}
