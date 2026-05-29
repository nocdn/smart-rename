import { normalizeForComparison } from "../rename-sanitize";
import { countRemainingNoiseTokens } from "./strip-rules";
import type { LocalRenameContext, RenameCandidate } from "./types";

const MIN_CONFIDENCE = 42;

function improvementScore(candidate: string, currentBaseName: string): number {
  const currentNorm = normalizeForComparison(currentBaseName);
  const candidateNorm = normalizeForComparison(candidate);

  if (!candidateNorm || candidateNorm === currentNorm) {
    return 0;
  }

  let score = 10;

  if (candidateNorm.length < currentNorm.length) {
    score += 8;
  }

  if (currentNorm.includes(candidateNorm) || candidateNorm.includes(currentNorm)) {
    score += 6;
  }

  score -= countRemainingNoiseTokens(candidate) * 4;

  return score;
}

export function pickBestLocalCandidate(
  candidates: RenameCandidate[],
  context: LocalRenameContext,
): RenameCandidate | undefined {
  const scored = candidates
    .map((candidate) => ({
      candidate,
      total: candidate.confidence + improvementScore(candidate.baseName, context.currentBaseName),
    }))
    .filter((entry) => entry.total >= MIN_CONFIDENCE && entry.candidate.baseName !== context.currentBaseName)
    .sort((a, b) => b.total - a.total);

  return scored[0]?.candidate;
}
