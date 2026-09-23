import type { readActorSense } from './actor-sense';

type ActorState = ReturnType<typeof readActorSense>;

/** One bound actor lifetime. Completion means native script advancement,
 * not combat success or proof that an animation was visible.
 */
export class ActorScriptProgress {
  private latestSequence: number;
  private cookie?: number;
  private pc?: number;
  private paused = false;
  private valid = true;
  private pending?: { cookie: number; atomCount: number; after: number };

  constructor(private readonly generation: number, initial: ActorState) {
    if (initial.generation !== generation || !initial.bound || initial.terminal) {
      throw new Error('Actor script requires a live bound lifetime');
    }
    this.latestSequence = initial.sequence;
    this.cookie = initial.script?.cookie;
    this.pc = initial.script?.pc;
    this.paused = initial.script?.paused ?? false;
  }

  begin(cookie: number, atomCount: number): void {
    if (!this.valid || (this.pending && !this.complete) || cookie === this.cookie ||
        !Number.isInteger(cookie) || cookie < 1 || cookie > 0x7fffffff ||
        !Number.isInteger(atomCount) || atomCount < 1 || atomCount > 32) {
      throw new Error('Invalid or overlapping actor script');
    }
    this.pending = { cookie, atomCount, after: this.latestSequence };
  }

  observe(state: ActorState): void {
    const delta = (state.sequence - this.latestSequence) >>> 0;
    if (!this.valid || delta === 0 || delta >= 0x80000000) return;
    this.latestSequence = state.sequence;
    if (!state.bound || state.terminal ||
        (state.generation !== undefined && state.generation !== this.generation)) {
      this.valid = false;
      return;
    }
    if (!state.script) return;
    if (state.script.cookie !== undefined && state.script.cookie !== this.cookie) {
      this.cookie = state.script.cookie;
      this.pc = undefined; // never reuse completion PC from the previous script
    }
    if (state.script.pc !== undefined) this.pc = state.script.pc;
    this.paused = state.script.paused;
  }

  get invalidated(): boolean { return !this.valid; }
  get complete(): boolean {
    return this.valid && !!this.pending && !this.paused &&
      this.latestSequence !== this.pending.after && this.cookie === this.pending.cookie &&
      this.pc === this.pending.atomCount;
  }
}
