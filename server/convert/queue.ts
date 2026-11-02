import { ConvertError } from './errors.ts';

/**
 * Runs at most `maxRunning` jobs at once with at most `maxWaiting` queued behind them.
 * Beyond that callers get SERVER_BUSY instead of piling up LibreOffice processes.
 */
export class JobQueue {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly maxRunning: number;
  private readonly maxWaiting: number;

  constructor(maxRunning: number, maxWaiting: number) {
    this.maxRunning = Math.max(1, maxRunning);
    this.maxWaiting = Math.max(0, maxWaiting);
  }

  get size() {
    return { running: this.running, waiting: this.waiting.length };
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxRunning) {
      if (this.waiting.length >= this.maxWaiting) throw new ConvertError('SERVER_BUSY');
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }

    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      // Hand the slot straight to the next job; otherwise free it.
      if (next) next();
      else this.running--;
    }
  }
}
