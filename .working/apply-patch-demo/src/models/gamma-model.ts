export class Gamma {
  value = 10;

  bump(): number {
    this.value += 1;
    return this.value;
  }

  reset(): number {
    this.value = 0;
    return this.value;
  }

  snapshot(): string {
    return `gamma:${this.value}`;
  }

  load(value: number): number {
    this.value = value;
    return this.value;
  }
}

