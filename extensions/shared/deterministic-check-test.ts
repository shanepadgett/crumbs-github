/**
 * Builds a stable label for a deterministic check test.
 * Use: buildDeterministicCheckLabel("check", 2) // "check-2"
 */
export function buildDeterministicCheckLabel(prefix: string, attempt: number): string {
  const trimmedPrefix = prefix.trim();
  return `${trimmedPrefix}-${attempt}`;
}
