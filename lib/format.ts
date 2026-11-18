/** Formats part/total as a whole-number percentage, e.g. 7 of 10 -> "70%". */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
