/**
 * Builds a label for automatic check testing.
 * Use: buildAutomaticCheckLabel("check", 2)
 */
export function buildAutomaticCheckLabel(prefix: string, attempt: number): string {
  const trimmedPrefix = prefix.trim();
  return `${trimmedPrefix}-${attempt}`;
}
