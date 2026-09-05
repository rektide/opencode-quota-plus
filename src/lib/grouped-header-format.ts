/**
 * Normalize grouped provider headers so toast and /quota use the same title style.
 */
export function formatGroupedHeader(group: string): string {
  const trimmed = group.trim();
  if (!trimmed) return "[]";
  if (trimmed.startsWith("[")) return trimmed;

  // Tolerate a trailing default-account marker after the parenthetical
  // (e.g. "OpenAI (Pro)*") so the name-only bracketing still applies.
  const match = trimmed.match(/^([^()]+?)\s*(\(.+\))(\s*\*?)\s*$/);
  if (match) {
    return `[${match[1]!.trim()}] ${match[2]!.trim()}${match[3] ? match[3].trim() : ""}`;
  }

  return `[${trimmed}]`;
}
