export function epsilon(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function epsilonSet(input: string): Set<string> {
  return new Set(epsilon(input));
}

