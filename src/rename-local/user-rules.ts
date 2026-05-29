import { toTitleCase } from "../rename-sanitize";
import type { RenameCandidate } from "./types";

interface ParsedUserRule {
  pattern: RegExp;
  replacement: string;
}

function parseRuleLine(line: string): ParsedUserRule | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const arrowMatch = trimmed.match(/^(.+?)\s*=>\s*(.+)$/);
  if (arrowMatch) {
    return { pattern: new RegExp(arrowMatch[1], "gi"), replacement: arrowMatch[2] };
  }

  const slashMatch = trimmed.match(/^\/(.+)\/([a-z]*)\s*=>\s*(.+)$/i);
  if (slashMatch) {
    return { pattern: new RegExp(slashMatch[1], slashMatch[2] || "i"), replacement: slashMatch[3] };
  }

  const replaceMatch = trimmed.match(/^replace:(.+?)=>(.+)$/i);
  if (replaceMatch) {
    const literal = replaceMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { pattern: new RegExp(literal, "gi"), replacement: replaceMatch[2] };
  }

  return undefined;
}

export function parseUserRules(renamePrompt: string): ParsedUserRule[] {
  if (!renamePrompt.trim()) {
    return [];
  }

  return renamePrompt
    .split("\n")
    .map(parseRuleLine)
    .filter((rule): rule is ParsedUserRule => rule !== undefined);
}

export function candidatesFromUserRules(baseName: string, renamePrompt: string): RenameCandidate[] {
  const rules = parseUserRules(renamePrompt);
  if (rules.length === 0) {
    return [];
  }

  let value = baseName;
  for (const rule of rules) {
    value = value.replace(rule.pattern, rule.replacement);
  }

  const formatted = toTitleCase(value);
  if (!formatted || formatted === baseName) {
    return [];
  }

  return [{ baseName: formatted, confidence: 62, source: "user-rules" }];
}
