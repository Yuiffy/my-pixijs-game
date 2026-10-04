/** Choose once per event, without repeating the last option for that scene. */
export class VariantPicker {
  private last = new Map<string, string>();
  constructor(private random = Math.random) {}

  pick<T>(key: string, options: T[], identity: (item: T) => string): T | undefined {
    if (!options.length) return undefined;
    const alternatives = options.filter((item) => identity(item) !== this.last.get(key));
    const pool = alternatives.length ? alternatives : options;
    const selected = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    this.last.set(key, identity(selected));
    return selected;
  }
}
