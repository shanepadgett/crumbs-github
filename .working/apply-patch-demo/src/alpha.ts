export function alpha(name: string): string {
  const normalized = name.trim().toLowerCase();
  return `alpha:${normalized}:v3`;
}

