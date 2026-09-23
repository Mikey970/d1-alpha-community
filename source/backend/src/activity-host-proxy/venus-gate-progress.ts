import { BitReader } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';
import { PairedDefeatEvidence } from './paired-defeat-evidence';

export const VENUS_GATE_ACTORS = [70, 72, 74, 76] as const;
type GateSense = { index: number; generation?: number; terminal: boolean; bound: boolean; sequence: number; dropSequence?:number; dropping:number };
type SquadSense = { index: number; live?: number; members?:number; valid: boolean; sequence: number };
export type Chapter2MonitorSense = {index:number; anyInside:boolean; allInside:boolean; count:number; revision:number; sequence:number};

/** Native multi-entry packets captured in r401/r404. Unknown fields fail closed. */
export function readVenusGateSense(payload: Buffer) {
  if (payload.length < 12 || payload.length > 2048) return undefined;
  try {
    const br = new BitReader(payload);
    const read = (width: number) => {
      if (br.bitPos + width > br.bitLength) throw new Error('Truncated gate sense');
      return br.readNumber(width);
    };
    const optional = (width: number) => read(1) ? read(width) : undefined;
    if (read(2) !== 0) return undefined;
    const actors: GateSense[] = [];
    const squads: SquadSense[] = [];
    const monitors: Chapter2MonitorSense[] = [];
    let entries = 0;
    while (read(1)) {
      if (++entries > 32) return undefined;
      const ref = SensorClientRef.decode(br);
      if (read(1) !== 1) return undefined;
      if ((ref.bundle >>> 0) === 0x0a6d9003 && ref.typeId === 4 && ref.typeIndex === 8) {
        // r405 line1314 coalesces the real device receipt with gate creation.
        // Native ObjectSense808005F0 and tagged receipt80802DA3 are fixed-width.
        // Consume the whole receipt, but never use it as gate progress.
        read(32); read(1); read(32); read(32); read(32);
        const commands = read(4);
        if (commands > 8) return undefined;
        for (let i = 0; i < commands; i++) {
          if (read(1) !== 1 || read(32) !== 0x80802da3) return undefined;
          read(1); read(32);
        }
        read(32);
        continue;
      }
      if ((ref.bundle >>> 0) !== 0x517641f1) return undefined;
      if (ref.typeId === 28 && ref.typeIndex >= 140 && ref.typeIndex <= 146) {
        // 835B9650: flag0 = nonempty eligible-player intersection; +104 is
        // its population count. Native 80800652 has two bools and two i32s.
        const anyInside=read(1)===1, allInside=read(1)===1;
        const count=read(32)-0x80000000, revision=read(32)-0x80000000;
        if(count<0||count>32||anyInside!==(count>0))return undefined;
        monitors.push({index:ref.typeIndex,anyInside,allInside,count,revision,sequence:read(32)});
        continue;
      }
      const isGate = VENUS_GATE_ACTORS.includes(ref.typeIndex as 70);
      const isGateSquad = VENUS_GATE_ACTORS.some(index => index - 1 === ref.typeIndex);
      if (ref.typeId === 2 && (isGate || ref.typeIndex === 40 || ref.typeIndex === 42)) {
        const generation = optional(31);
        // r401 leaves this scalar absent. Its compressed native format is not
        // the legacy generic f32; don't guess and misalign following entries.
        if (read(1)) return undefined;
        optional(31);
        if (read(1)) { optional(6); optional(31); optional(31); read(1); }
        const dropSequence=optional(31);
        const mode = read(2) - 1;
        optional(31);
        const terminal = read(1) === 1;
        const bound = read(1) === 1;
        const sequence = read(32);
        if (mode !== 0 && mode !== 1) return undefined;
        if (isGate) actors.push({ index: ref.typeIndex, generation, terminal, bound, sequence, dropSequence, dropping:mode });
      } else if (ref.typeId === 1 && (isGateSquad || (ref.typeIndex >= 25 && ref.typeIndex <= 39) || [41,43,44,45,46,47].includes(ref.typeIndex))) {
        optional(31); optional(31); optional(31); const members=optional(6);
        const live = optional(6); // named actors, distinct from population members
        read(3);
        const valid = read(1) === 1;
        optional(7); // native descriptor8242F340
        if (read(1)) { const count = read(4); for (let i = 0; i < count; i++) read(32); }
        if (read(1)) for(let i=0;i<24;i++)optional(7);
        const sequence = read(32);
        squads.push({ index: ref.typeIndex, live, members, valid, sequence });
      } else if (ref.typeId === 3 && ref.typeIndex === 24) {
        // Client receipt state uses 80800671 (24 x 8080066F), matching
        // encodeObjectiveReceivedState. r404 line2044 shares this record with
        // every gate's initial live state; it is not gate progress itself.
        if (read(1)) {
          for (let i = 0; i < 24; i++) {
            optional(7); read(1);
            if (read(1)) for (let j = 0; j < 24; j++) optional(6);
          }
        }
        optional(31); optional(32); read(32);
      } else return undefined;
    }
    const remaining = br.bitLength - br.bitPos;
    if (remaining > 7 || (remaining && read(remaining) !== 0)) return undefined;
    return { actors, squads, monitors };
  } catch { return undefined; }
}

/** Require a live actor followed by terminal and native zero-live squad evidence. */
export class VenusGateProgress {
  private readonly evidence = new PairedDefeatEvidence(VENUS_GATE_ACTORS);
  private readonly defeated = new Set<number>();
  get count() { return this.defeated.size; }
  get defeatedActors(): readonly number[] { return [...this.defeated]; }
  get complete() { return this.count === VENUS_GATE_ACTORS.length; }
  resetObservations() { this.evidence.reset(); }

  observe(payload: Buffer): boolean {
    const update = readVenusGateSense(payload);
    if (!update) return false;
    this.evidence.observe(update.actors, update.squads);
    let changed = false;
    for (const index of VENUS_GATE_ACTORS) {
      // Captured Southern live baselines omit some gate squads, so a prior
      // positive squad is not required here (unlike the Northern encounter).
      if (!this.defeated.has(index) && this.evidence.isDefeated(index, false)) {
        this.defeated.add(index); changed = true;
      }
    }
    return changed;
  }
}
