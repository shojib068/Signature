import { describe, expect, it } from 'vitest';
import { JobQueue } from './queue.ts';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('JobQueue', () => {
  it('runs at most maxRunning jobs and queues the rest in order', async () => {
    const queue = new JobQueue(1, 5);
    const order: number[] = [];
    const gate = deferred();
    const first = queue.run(async () => {
      await gate.promise;
      order.push(1);
    });
    const second = queue.run(async () => {
      order.push(2);
    });
    expect(queue.size).toEqual({ running: 1, waiting: 1 });
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(queue.size).toEqual({ running: 0, waiting: 0 });
  });

  it('rejects with SERVER_BUSY when the waiting list is full', async () => {
    const queue = new JobQueue(1, 0);
    const gate = deferred();
    const running = queue.run(() => gate.promise);
    await expect(queue.run(async () => undefined)).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    gate.resolve();
    await running;
  });

  it('frees the slot when a job fails', async () => {
    const queue = new JobQueue(1, 0);
    await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });
});
