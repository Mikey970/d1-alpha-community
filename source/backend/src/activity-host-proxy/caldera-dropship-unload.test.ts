import { expect, it } from 'vitest';
import { unloadCalderaDropship, DropshipUnloadPort } from './caldera-dropship-unload';

function harness() {
  const calls: string[] = [];
  let resolve: (() => void) | undefined;
  const pending = (name: string) => {
    calls.push(name);
    return new Promise<void>(done => { resolve = done; });
  };
  const port: DropshipUnloadPort = {
    attachToObjective: (s, o) => { calls.push(`objective:${s}:${o}`); },
    addToGroup: (s, g) => { calls.push(`group:${s}:${g}`); },
    execute: command => { calls.push(`execute:${command}`); },
    drop: s => { calls.push(`drop:${s}`); },
    waitFor: (condition, interval) => pending(`wait:${condition}:${interval}`),
    sleep: ms => pending(`sleep:${ms}`),
    setPublicEventActive: () => { calls.push('active'); },
    removePilotSquad: () => { calls.push('remove-pilot'); },
    restartEnemyNavpoints: () => { calls.push('navpoints'); },
  };
  return { calls, port, release: async () => {
    const done = resolve;
    resolve = undefined;
    if (!done) throw new Error('No pending native wait');
    done();
    // Flush the bounded await chain without advancing any next native wait.
    for (let i = 0; i < 6; i++) await Promise.resolve();
  } };
}
const wave = { objective: 100, group: 200, squadA: 1, squadB: 2, leader: 3, exitCommand: 300 };

it('does not drop ahead of native completion and removes ship only after exit', async () => {
  const h = harness();
  const running = unloadCalderaDropship(h.port, wave, new AbortController().signal);
  expect(h.calls.filter(x => x.startsWith('drop:'))).toEqual([]);
  await h.release(); // doors finished
  expect(h.calls.slice(-2)).toEqual(['drop:1', 'wait:drop-idle:1000']);
  await h.release(); // A finished
  expect(h.calls.slice(-2)).toEqual(['sleep:1000', 'active']);
  await h.release(); // tail's initial delay
  await h.release(); // command and drop idle
  expect(h.calls.slice(-2)).toEqual(['drop:2', 'wait:drop-idle:1000']);
  await h.release(); // B finished
  expect(h.calls.slice(-2)).toEqual(['drop:3', 'wait:drop-idle:1000']);
  await h.release(); // leader finished
  await h.release(); // door delay
  await h.release(); // close doors finished
  await h.release(); // command and drop idle
  expect(h.calls.slice(-2)).toEqual(['execute:300', 'wait:command-idle:200']);
  expect(h.calls).not.toContain('remove-pilot');
  await h.release();
  await running;
  expect(h.calls.slice(-2)).toEqual(['remove-pilot', 'navpoints']);
});

it('stops issuing commands when the area unloads during a drop', async () => {
  const h = harness();
  const abort = new AbortController();
  const running = unloadCalderaDropship(h.port, wave, abort.signal);
  const rejected = expect(running).rejects.toThrow('encounter stopped');
  await h.release(); // A begins
  abort.abort();
  await h.release();
  await rejected;
  expect(h.calls.filter(x => x.startsWith('drop:'))).toEqual(['drop:1']);
  expect(h.calls).not.toContain('active');
});
