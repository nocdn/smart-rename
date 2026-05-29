const NOISE_TOKENS = new Set([
  "final",
  "copy",
  "download",
  "downloads",
  "repack",
  "proper",
  "limited",
  "extended",
  "uncut",
  "unrated",
  "remastered",
  "internal",
  "read",
  "nfo",
  "sample",
  "trailer",
  "extras",
  "bonus",
  "subs",
  "subbed",
  "dubbed",
  "multi",
  "complete",
  "retail",
  "cam",
  "telesync",
  "workprint",
  "screener",
  "dvdscr",
  "hdrip",
  "bdrip",
  "brrip",
  "webrip",
  "webdl",
  "web-dl",
  "bluray",
  "blu-ray",
  "x264",
  "x265",
  "h264",
  "h265",
  "hevc",
  "avc",
  "aac",
  "ac3",
  "dts",
  "truehd",
  "atmos",
  "10bit",
  "8bit",
  "hdr",
  "hdr10",
  "dv",
  "remux",
  "yify",
  "rarbg",
  "ettv",
  "fgt",
  "ion10",
  "amzn",
  "nf",
  "hulu",
  "dsnp",
  "atvp",
]);

const STRIP_PATTERNS: RegExp[] = [
  /\[[^\]]+\]/g,
  /\([^)]*\d{3,4}p[^)]*\)/gi,
  /\(\d+\)/g,
  /\b\d{3,4}p\b/gi,
  /\b\d{3,4}x\d{3,4}\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b\d{1,2}x\d{1,2}\b/gi,
  /\b(?:19|20)\d{2}[-_.]?(?:0\d|1[0-2])[-_.]?(?:0\d|[12]\d|3[01])\b/g,
  /\b(?:0\d|1[0-2])[-_.]?(?:0\d|[12]\d|3[01])[-_.]?(?:19|20)\d{2}\b/g,
  /\b(?:19|20)\d{2}\b/g,
  /\b\d{1,2}h\d{1,2}m\b/gi,
  /\b\d{1,3}mb\b/gi,
  /\b\d{1,2}gb\b/gi,
  /\bweb[- ]?dl\b/gi,
  /\bwebrip\b/gi,
  /\bbluray\b/gi,
  /\bblu[- ]?ray\b/gi,
  /\bbdrip\b/gi,
  /\bbrrip\b/gi,
  /\bhdrip\b/gi,
  /\bdvdrip\b/gi,
  /\b\d+bit\b/gi,
  /\bx26[45]\b/gi,
  /\bh\.?26[45]\b/gi,
  /\bhevc\b/gi,
  /\baac\d(?:\.\d)?\b/gi,
  /\bac3\b/gi,
  /\bdts[- ]?hd\b/gi,
  /\btruehd\b/gi,
  /\batmos\b/gi,
  /\b(?:amzn|nf|hulu|dsnp|atvp|hmax|pcok|stvp)\b/gi,
  /\b[a-f0-9]{8,}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\bS\d{1,2}E\d{1,2}E\d{1,2}\b/gi,
  /[-_.]+/g,
];

export function normalizeSeparators(input: string): string {
  return input.replace(/[._]+/g, " ").replace(/-+/g, " ").replace(/\s+/g, " ").trim();
}

export function stripNoiseTokens(input: string): string {
  const tokens = normalizeSeparators(input).split(" ");

  return tokens
    .filter((token) => {
      const lower = token.toLowerCase().replace(/[^a-z0-9+]/g, "");
      return token.length > 0 && !NOISE_TOKENS.has(lower);
    })
    .join(" ");
}

export function applyStripRules(baseName: string): string {
  let value = baseName;

  for (const pattern of STRIP_PATTERNS) {
    value = value.replace(pattern, " ");
  }

  return stripNoiseTokens(value);
}

export function countRemainingNoiseTokens(baseName: string): number {
  const tokens = baseName.toLowerCase().split(/\s+/);
  return tokens.filter((token) => NOISE_TOKENS.has(token.replace(/[^a-z0-9]/g, ""))).length;
}
