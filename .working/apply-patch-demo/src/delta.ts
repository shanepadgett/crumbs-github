export function delta(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return delta(values) / values.length;
}

export function max(values: number[]): number {
  return values.reduce((current, value) => (value > current ? value : current), Number.NEGATIVE_INFINITY);
}

