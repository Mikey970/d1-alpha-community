type ActorSense = {index: number; sequence: number; generation?: number; bound: boolean; terminal: boolean};
type SquadSense = {index: number; sequence: number; valid: boolean; live?: number};
type ActorState = {sequence: number; seenLive: boolean; terminal: boolean};
type SquadState = {sequence: number; valid: boolean; live?: number; seenLive: boolean};

/** Named actor N is paired with squad N-1. Each sensor has its own sequence
 * and may arrive in a separate packet. Optional live counts are deltas.
 */
export class PairedDefeatEvidence {
  private readonly actors = new Map<number, ActorState>();
  private readonly squads = new Map<number, SquadState>();
  constructor(private readonly actorIndices: readonly number[]) {}

  reset() { this.actors.clear(); this.squads.clear(); }
  hasLiveActor(index: number) { return this.actors.get(index)?.seenLive === true; }

  /** Retire evidence while retaining sequence floors against delayed replays. */
  discard(index: number) {
    const actor = this.actors.get(index);
    if (actor) this.actors.set(index, {sequence: actor.sequence, seenLive: false, terminal: false});
    const squad = this.squads.get(index - 1);
    if (squad) this.squads.set(index - 1, {sequence: squad.sequence, valid: false, seenLive: false});
  }

  observe(actors: readonly ActorSense[], squads: readonly SquadSense[]) {
    for (const actor of actors) {
      if (!this.actorIndices.includes(actor.index)) continue;
      const old = this.actors.get(actor.index);
      if (old && actor.sequence <= old.sequence) continue;
      if (!actor.bound || (actor.generation !== undefined && actor.generation !== 1)) {
        this.actors.set(actor.index, {sequence: actor.sequence, seenLive: false, terminal: false});
        this.discard(actor.index);
        continue;
      }
      const seenLive = old?.seenLive === true || (!actor.terminal && actor.generation === 1);
      const squad = this.squads.get(actor.index - 1);
      // A new life cannot inherit an old zero count. A terminal->live change
      // also retires the prior life's positive-squad observation.
      if (!actor.terminal && seenLive && squad &&
          (old?.terminal || (!old?.seenLive && squad.live === 0))) {
        this.squads.set(actor.index - 1, {sequence: squad.sequence, valid: false, seenLive: false});
      }
      this.actors.set(actor.index, {sequence: actor.sequence, seenLive, terminal: actor.terminal});
    }
    for (const squad of squads) {
      if (!this.actorIndices.includes(squad.index + 1)) continue;
      const old = this.squads.get(squad.index);
      if (old && squad.sequence <= old.sequence) continue;
      this.squads.set(squad.index, squad.valid
        ? {sequence: squad.sequence, valid: true, live: squad.live ?? old?.live,
          seenLive: old?.seenLive === true || (squad.live !== undefined && squad.live > 0)}
        : {sequence: squad.sequence, valid: false, seenLive: false});
    }
  }

  isDefeated(index: number, requireLiveSquad: boolean) {
    const actor = this.actors.get(index), squad = this.squads.get(index - 1);
    return actor?.seenLive === true && actor.terminal && squad?.valid === true &&
      squad.live === 0 && (!requireLiveSquad || squad.seenLive);
  }
}
