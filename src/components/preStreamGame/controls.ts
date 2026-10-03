// Each physical key or pointer owns its hold. Only the last deliberate release
// finishes a pour; browser cancellation and lifecycle cleanup never submit it.
export class PrepHoldControls {
  private sources = new Set<string>();

  get held() { return this.sources.size > 0; }

  press(source: string) { this.sources.add(source); }

  release(source: string, cancelled = false) {
    const existed = this.sources.delete(source);
    return existed && !this.held && !cancelled;
  }

  clear() { this.sources.clear(); }
}
