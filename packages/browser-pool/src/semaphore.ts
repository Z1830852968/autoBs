export class Semaphore {
  private current = 0;
  private readonly max: number;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current += 1;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.current += 1;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.current -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

