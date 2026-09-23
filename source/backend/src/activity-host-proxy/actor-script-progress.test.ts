import { describe, expect, it } from 'vitest';
import { ActorScriptProgress } from './actor-script-progress';
import type { readActorSense, ActorScriptSense } from './actor-sense';

const state = (sequence: number, script?: ActorScriptSense): ReturnType<typeof readActorSense> => ({
  generation: 1, revision: undefined, script, dropSequence: undefined, dropping: 0,
  dropRevision: undefined, terminal: false, bound: true, sequence,
});

describe('native actor script receipt and advancement', () => {
  it('waits for the new cookie and its own PC, including split delta updates', () => {
    const progress = new ActorScriptProgress(1, state(5, { cookie: 1, pc: 1, paused: false }));
    progress.begin(2, 1);
    progress.observe(state(6));
    expect(progress.complete).toBe(false);
    progress.observe(state(7, { cookie: 2, paused: false }));
    expect(progress.complete).toBe(false);
    progress.observe(state(8, { pc: 1, paused: false }));
    expect(progress.complete).toBe(true);
    progress.begin(3, 1);
    expect(progress.complete).toBe(false);
  });

  it('rejects reordered completion and overlapping commands', () => {
    const progress = new ActorScriptProgress(1, state(10));
    progress.begin(2, 1);
    expect(() => progress.begin(3, 1)).toThrow();
    progress.observe(state(9, { cookie: 2, pc: 1, paused: false }));
    expect(progress.complete).toBe(false);
    progress.observe(state(11, { cookie: 2, pc: 1, paused: true }));
    expect(progress.complete).toBe(false);
    progress.observe(state(12, { paused: false }));
    expect(progress.complete).toBe(true);
  });

  it('invalidates pending work on actor death or replacement', () => {
    for (const changed of [{ terminal: true }, { generation: 2 }, { bound: false }]) {
      const progress = new ActorScriptProgress(1, state(5));
      progress.begin(2, 1);
      progress.observe({ ...state(6, { cookie: 2, pc: 1, paused: false }), ...changed });
      expect(progress.invalidated).toBe(true);
      expect(progress.complete).toBe(false);
      expect(() => progress.begin(3, 1)).toThrow();
    }
  });
});
