import { BitReader } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';
import { readActorSense } from './actor-sense';
import { PairedDefeatEvidence } from './paired-defeat-evidence';

export const NORTHERN_ACTORS = [81, 129, 131] as const;
type GateSense = ReturnType<typeof readActorSense> & { index: number };
type SquadSense = { index: number; live?: number; members?:number;valid: boolean; sequence: number };

/** Native multi-entry packets captured in r401/r404. Unknown fields fail closed. */
export function readVenusNorthernSense(payload: Buffer) {
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
    const devices:{index:number;position:number;revision:number;sequence:number}[]=[];
    const squads: SquadSense[] = [];
    const monitors:{index:number;anyInside:boolean;allInside:boolean;count:number;revision:number;sequence:number}[]=[];
    const health: {index:number;value0:number;value1:number;revision:number;sequence:number}[]=[];
    let entries = 0;
    while (read(1)) {
      if (++entries > 64) return undefined; // r547 initial Northern roster has more than 32 entries
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
      // r547 live gate roster coalesces the loaded Northern ambient bundle.
      // Consume its captured Squad/Objective shapes without earning boss credit.
      const ambient=(ref.bundle>>>0)===0xee5b8c2a;
      if ((ref.bundle >>> 0) !== 0x517641f1 && !ambient) return undefined;
      if(ambient&&!(ref.typeId===1&&ref.typeIndex>=1&&ref.typeIndex<=7||ref.typeId===3&&ref.typeIndex===0))return undefined;
      if(ref.typeId===4&&ref.typeIndex===77){
        read(32);read(1);read(32);read(32);read(32);
        const count=read(4);if(count>8)return undefined;
        let position:number|undefined,revision=0;
        for(let i=0;i<count;i++){
          if(read(1)!==1||read(32)!==0x80802d89)return undefined;
          read(32);read(32);read(32);read(32);
          revision=read(32)-0x80000000;
          const b=Buffer.alloc(4);b.writeUInt32BE(read(32));position=b.readFloatBE();
          if(!Number.isFinite(position))return undefined;
        }
        const sequence=read(32);
        if(position!==undefined)devices.push({index:77,position,revision,sequence});
        continue;
      }
      if(ref.typeId===19&&ref.typeIndex===152){
        // HealthSense80800624: two IEEE floats and a biased signed command
        // counter, followed by the independent outer sensor sequence.
        const f32=()=>{const b=Buffer.alloc(4);b.writeUInt32BE(read(32));const v=b.readFloatBE();
          if(!Number.isFinite(v))throw Error('Invalid HealthSense');return v;};
        health.push({index:152,value0:f32(),value1:f32(),revision:read(32)-0x80000000,sequence:read(32)});
        continue;
      }
      if (ref.typeId === 28 && [151,154].includes(ref.typeIndex)) {
        const anyInside=!!read(1),allInside=!!read(1),count=read(32)-0x80000000,revision=read(32)-0x80000000,sequence=read(32);
        if(count<0||count>32||anyInside!==(count>0))return undefined;
        monitors.push({index:ref.typeIndex,anyInside,allInside,count,revision,sequence});continue;
      }
      const isGate = NORTHERN_ACTORS.includes(ref.typeIndex as 81);
      const isGateSquad = NORTHERN_ACTORS.some(index => index - 1 === ref.typeIndex);
      if (ref.typeId === 2 && (isGate || ref.typeIndex === 40 || ref.typeIndex === 42)) {
        const actor = readActorSense(br);
        if (isGate) actors.push({ index: ref.typeIndex, ...actor });
      } else if (ref.typeId === 1 && (ambient || isGateSquad || (ref.typeIndex>=82&&ref.typeIndex<=111))) {
        optional(31); optional(31); optional(31); const members=optional(6);
        const live = optional(6); // named actors, distinct from population members
        read(3);
        const valid = read(1) === 1;
        optional(7); // native descriptor8242F340
        if (read(1)) { const count = read(4); for (let i = 0; i < count; i++) read(32); }
        if (read(1)) for(let i=0;i<24;i++)optional(7);
        const sequence = read(32);
        if (!ambient) squads.push({ index: ref.typeIndex, live, members, valid, sequence });
      } else if (ref.typeId === 3 && (ambient||ref.typeIndex === 79)) {
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
    return { actors, squads, health, monitors, devices };
  } catch { return undefined; }
}


/** Require independently fresh actor and squad evidence, after both were live. */
export class VenusNorthernProgress {
  private readonly evidence = new PairedDefeatEvidence(NORTHERN_ACTORS);
  private readonly defeated = new Set<number>();
  get liveGateActors() { return [129,131].filter(index => this.evidence.hasLiveActor(index) && !this.defeated.has(index)); }
  get bossDefeated() { return this.defeated.has(81); }
  get defeatedGates(): readonly number[] { return [129,131].filter(i => this.defeated.has(i)); }
  get complete() { return this.bossDefeated && this.defeatedGates.length === 2; }
  resetObservations() { this.evidence.reset(); }

  observe(payload: Buffer): boolean {
    const update = readVenusNorthernSense(payload);
    if (!update) return false;
    const bossActive = this.defeatedGates.length === 2;
    this.evidence.observe(update.actors, update.squads);
    // Do not bank an early boss kill for later, or accept its delayed replay.
    // Boss activation is sent after the packet completing both authored gates.
    if (!bossActive) this.evidence.discard(81);
    let changed = false;
    for (const index of NORTHERN_ACTORS) {
      if (!this.defeated.has(index) && this.evidence.isDefeated(index, true)) {
        this.defeated.add(index); changed = true;
      }
    }
    return changed;
  }
}
