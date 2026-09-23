// Analysis fork of exact r428 decoder; native additions Health78/Monitor79..81 and one-slot Ruins rosters.
// Native AH kind6 framing. Counts are bounded Engineering observations, not a recovered script VM.
import type { ActorScriptSense } from './actor-sense';
export const ENGINEERING = 0x0a302429;
export const ROSTER_LENGTHS: Readonly<Record<number, number>> = Object.freeze({2:2,3:2,4:3,5:4,6:4,7:4,8:3,9:2,10:3,11:2,12:2,13:1,14:1,15:1,16:1,17:1,18:1,19:1,39:1,41:1,43:1,45:1,47:1,48:1,49:1,50:1,51:1,52:1,53:3,54:1,55:1,56:1,57:1,58:1,59:1,60:1,61:1,62:1});
export type StrikeSenseRow = {
  script?: ActorScriptSense;
  bundle:number; type:number; index:number; startBit:number; endBit:number; sequence:number;
  counters?:(number|undefined)[]; activationCount?:number; currentCohortCount?:number;
  flags?:number[]; valid?:boolean; scalarCode?:number; retirementRoster?:number[];
  dropSequence?:number;dropPending?:number;generation?:number; terminal?:boolean; bound?:boolean; health?:number; shield?:number; healthRevision?:number; occupancy?:number; monitorFlags?:number[]; monitorRevision?:number;
};
export type StrikeSensePacket = {rows:StrikeSenseRow[]; squads:StrikeSenseRow[]};
export type StrikeSenseScope = {epoch:string; tokens:Readonly<Record<number,string>>; loaded:boolean; bound:boolean; now:number};
export type StrikeSquadObservation = {
  squad:number; token:string; sequence:number; currentCohortCount:number;
  activationCount?:number; retirementRoster:number[]; observedAt:number; populationCleared:boolean;
};
type State = {
  token:string; allocation:number[]; sequence:number; ready:boolean; readyTarget:number; retirementRoster?:number[];
  currentCohortCount?:number; activationCount?:number; at?:number;
  zeroRetirementObserved?:boolean; positiveCohortObserved?:boolean;
};
const sum = (values:readonly number[]) => values.reduce((a,b)=>a+b,0);
function validAllocation(squad:number, allocation:readonly number[]):boolean {
  return !!ROSTER_LENGTHS[squad] && allocation.length===ROSTER_LENGTHS[squad] &&
    allocation.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=0x7fffffff) && sum(allocation)>0;
}
export function decodeStrikeSense(payload: Buffer): StrikeSensePacket | undefined {
  if (!Buffer.isBuffer(payload) || payload.length < 12 || payload.length > 2048) return undefined;
  let p = 0;
  function read(n: number): number {
    if (p + n > payload.length * 8) throw Error('truncated');
    let v = 0;
    for (let i=0; i<n; i++,p++) v=v*2+((payload[p>>3]>>(7-(p&7)))&1);
    return v;
  }
  const opt = (n: number): number | undefined => read(1) ? read(n) : undefined;
  try {
    const prefix=read(2);
    if (prefix!==0 && prefix!==2) return undefined; // Both observed; preserve framing, infer no reset.
    const rows: StrikeSenseRow[]=[];
    while (read(1)) {
      if (rows.length>=64) return undefined; // r422 initial packet has40 native entries.
      const startBit=p, bundle=read(32), type=read(6)-1, index=read(16)-0x8000;
      if (read(1)!==1) return undefined;
      const row: StrikeSenseRow={bundle,type,index,startBit,sequence:0,endBit:0};
      if (type===1) {
        row.counters=[opt(31),opt(31),opt(31)];
        row.activationCount=opt(6); row.currentCohortCount=opt(6);
        row.flags=[read(1),read(1),read(1)]; row.valid=read(1)===1;
        row.scalarCode=opt(7); // 8242F340: kind11, 0..2040, seven wire bits.
        if (read(1)) {
          const count=read(4);
          if (count>8) return undefined; // Native maxLen table80800E4C.
          row.retirementRoster=Array.from({length:count},()=>read(32)-0x80000000);
          if (row.retirementRoster.some(n=>n<0)) return undefined;
          if (bundle===ENGINEERING && ROSTER_LENGTHS[index]!==undefined && count!==ROSTER_LENGTHS[index]) return undefined;
        }
        if (read(1)) for(let i=0;i<24;i++) opt(7); // Proven native823B0644..654, same as r432.
      } else if(type===19) {
        if(bundle!==ENGINEERING || index!==78) return undefined;
        const f32=()=>{const b=Buffer.alloc(4);b.writeUInt32BE(read(32));const v=b.readFloatBE();if(!Number.isFinite(v))throw Error('invalid health');return v;};
        row.health=f32();row.shield=f32();row.healthRevision=read(32)-0x80000000;
      } else if(type===28) {
        if(bundle!==ENGINEERING || ![79,80,81].includes(index)) return undefined;
        row.monitorFlags=[read(1),read(1)];row.occupancy=read(32)-0x80000000;row.monitorRevision=read(32)-0x80000000;
        if(row.occupancy<0 || row.occupancy>32) return undefined;
      } else if (type===3) {
        // Objective client receipt80800671; existing r404/r419 framing.
        if (read(1)) for (let i=0;i<24;i++) {
          opt(7); read(1);
          if (read(1)) for (let j=0;j<24;j++) opt(6);
        }
        opt(31); opt(32);
      } else if (type===2) {
        row.generation=opt(31);
        // Native825091EC field1: optional kind11, 32 wire bits. r441 Actor46
        // damage updates exercise it; consume the real float without kill credit.
        if (read(1)) {const b=Buffer.alloc(4);b.writeUInt32BE(read(32));if(!Number.isFinite(b.readFloatBE()))return undefined;}
        opt(31);
        if (read(1)) {
          row.script = {pc:opt(6),cookie:opt(31),revision:opt(31),paused:read(1)===1};
        }
        row.dropSequence=opt(31); row.dropPending=read(2)-1; if(row.dropPending<0||row.dropPending>1)return undefined; opt(31);
        row.terminal=read(1)===1; row.bound=read(1)===1;
      } else if (type===4) {
        // Narrow global exit Object0 receipt808005F0. This prevents its
        // coalesced updates from hiding otherwise valid squad observations.
        // Private objects and unknown kind33 payloads remain fail-closed.
        if(!((bundle===ENGINEERING && [0,35,36,37].includes(index)) || (bundle===0x9cf47ad5 && index>=5 && index<=24)))return undefined;
        read(32); read(1); read(32); read(32); read(32);
        const count=read(4);
        if (count>1) return undefined;
        if (count===1) {
          if (read(1)!==1 || read(32)!==0x80802d89) return undefined;
          for(let channel=0;channel<3;channel++) {
            read(32); // Signed version, preserved only as framing here.
            const word=read(32), bytes=Buffer.allocUnsafe(4);
            bytes.writeUInt32BE(word);
            if (!Number.isFinite(bytes.readFloatBE())) return undefined;
          }
        }
      } else if (type===12) {
        // Native PlayerSense8080052B / descriptor825835CC. Type12 mapping is
        // verified from native sensor header, not the unrelated Lifetime schema.
        read(32);
        const count=read(4); //8080052A/80800E3F: up to8 u32s.
        if(count>8) return undefined;
        for(let i=0;i<count;i++) read(32);
        read(1); read(32); read(32); read(1); read(1);
        // Kind11 scalar descriptor82583660 has32 wire bits at+14.
      } else return undefined;
      row.sequence=read(32); row.endBit=p;
      rows.push(row);
    }
    const remaining=payload.length*8-p;
    if (remaining>7 || (remaining && read(remaining)!==0)) return undefined;
    return {rows,squads:rows.filter(r=>r.bundle===ENGINEERING && r.type===1 && ROSTER_LENGTHS[r.index]!==undefined)};
  } catch { return undefined; }
}

// Epoch includes the TCP session and slice lifetime. Tokens identify actual binding/cohort
// continuity; a host spawn counter alone is not proof that old packets belong to a new lifetime.
export class StrikeSquadObservations {
  private epoch = "unbound";
  private states = new Map<number,State>();
  reset(epoch:string):void {
    if(!epoch) throw Error('missing epoch');
    this.epoch=epoch; this.states.clear();
  }
  bind(squad:number,token:string,cumulativeAllocation:readonly number[],sequenceFloor=-1):void {
    if(!token || !validAllocation(squad,cumulativeAllocation) || sum(cumulativeAllocation)>63 || !Number.isInteger(sequenceFloor) ||
      sequenceFloor < -1 || sequenceFloor > 0xffffffff) throw Error('invalid authored binding');
    this.states.set(squad,{token,allocation:[...cumulativeAllocation],sequence:sequenceFloor,ready:false,readyTarget:sum(cumulativeAllocation)});
  }
  updateAllocation(squad:number,token:string,cumulativeAllocation:readonly number[]):void {
    const s=this.states.get(squad);
    if(!s || s.token!==token || !validAllocation(squad,cumulativeAllocation) ||
      cumulativeAllocation.some((n,i)=>n<s.allocation[i])) throw Error('invalid cumulative allocation');
    if(cumulativeAllocation.some((n,i)=>n!==s.allocation[i])) {
      // Cumulative signed32 requested/retired totals can exceed63 after refills.
      // Only the actual remaining cohort uses the native six-bit count.
      const readyTarget=sum(cumulativeAllocation)-sum(s.retirementRoster??s.allocation.map(()=>0));
      if (readyTarget<1 || readyTarget>63) throw Error('materialized cohort exceeds native count bound');
      s.readyTarget=readyTarget;
      s.allocation=[...cumulativeAllocation]; s.ready=false;
    }
  }
  /** A copy of the latest settled native state, never initial/template retirement.
   * Valid only until actual binding invalidation; omitted deltas retain state. */
  validatedPopulation(squad:number, token:string, now?:number): {
    allocation:number[]; retirementRoster:number[]; currentCohortCount:number;
    sequence:number; observedAt:number;
  } | undefined {
    const s=this.states.get(squad);
    if(!s || s.token!==token || !this.eligible(s) || s.at===undefined ||
      (now!==undefined && (!Number.isFinite(now) || now<s.at))) return undefined;
    return {allocation:[...s.allocation], retirementRoster:[...s.retirementRoster!],
      currentCohortCount:s.currentCohortCount!, sequence:s.sequence, observedAt:s.at};
  }
  invalidate(squad:number):void { this.states.delete(squad); }
  private eligible(s:State):boolean {
    return s.ready && s.currentCohortCount!==undefined && s.retirementRoster!==undefined &&
      s.currentCohortCount===sum(s.allocation)-sum(s.retirementRoster);
  }
  observe(payload:Buffer,{epoch,tokens,loaded,bound,now}:StrikeSenseScope):StrikeSquadObservation[] {
    if(epoch!==this.epoch || !Number.isFinite(now)) return [];
    if(!loaded || !bound) {this.states.clear(); return [];}
    const decoded=decodeStrikeSense(payload);
    if(!decoded) return []; // Never apply a valid prefix from an unsupported packet.
    const touched=new Set<number>();
    for(const row of decoded.squads) {
      const s=this.states.get(row.index);
      if(!s) continue;
      if(tokens[row.index]!==s.token) {this.states.delete(row.index);continue;}
      if(row.sequence<=s.sequence || (s.at!==undefined && now<s.at)) continue;
      if(!row.valid) {this.states.delete(row.index);continue;}
      if(row.currentCohortCount===undefined && row.retirementRoster===undefined) {
        // Native initial receipt and first populated state can both use sequence1.
        // Scalar/activation-only receipts do not advance the cohort delta stream.
        if(row.activationCount!==undefined) s.activationCount=row.activationCount;
        continue;
      }
      s.sequence=row.sequence; s.at=now;
      if(row.retirementRoster && row.retirementRoster.some((n,i)=>n>s.allocation[i] ||
        (s.retirementRoster!==undefined && n<s.retirementRoster[i]))) {
        this.states.delete(row.index); continue;
      }
      if(row.currentCohortCount!==undefined && row.currentCohortCount>sum(s.allocation)) {
        this.states.delete(row.index); continue;
      }
      if(row.retirementRoster) s.retirementRoster=[...row.retirementRoster];
      if(row.activationCount!==undefined) s.activationCount=row.activationCount;
      if(row.currentCohortCount!==undefined) s.currentCohortCount=row.currentCohortCount;
      if (row.retirementRoster?.every(n=>n===0)) s.zeroRetirementObserved=true;
      if (row.currentCohortCount!==undefined && row.currentCohortCount>0) s.positiveCohortObserved=true;
      // Native staggered creation can lose members before the full cohort is alive.
      // Account for every requested member using live plus monotonic retired count.
      // The alternative requires a zero-retirement baseline and positive cohort
      // from this binding; an unexplained first retired/empty receipt cannot qualify.
      if(s.currentCohortCount!==undefined && s.retirementRoster!==undefined &&
        ((s.currentCohortCount===s.readyTarget && s.currentCohortCount>0) ||
          (s.zeroRetirementObserved && s.positiveCohortObserved)) &&
        s.currentCohortCount===sum(s.allocation)-sum(s.retirementRoster)) s.ready=true;
      if(row.currentCohortCount!==undefined || row.retirementRoster!==undefined) touched.add(row.index);
    }
    // Evaluate only final merged state after the entire decoded packet. A complementary
    // retirement/count delta may arrive later; retain it but expose no inconsistent count.
    const observations:StrikeSquadObservation[]=[];
    for(const squad of touched) {
      const s=this.states.get(squad);
      if(!s || !this.eligible(s)) continue;
      observations.push({squad,token:s.token,sequence:s.sequence,currentCohortCount:s.currentCohortCount!,
        activationCount:s.activationCount,retirementRoster:[...s.retirementRoster!],observedAt:now,
        populationCleared:s.currentCohortCount===0});
    }
    return observations;
  }
  count(squad:number,now?:number):number|undefined {
    const s=this.states.get(squad);
    if(!s || !this.eligible(s) || (now!==undefined && (!Number.isFinite(now) || (s.at!==undefined&&now<s.at)))) return undefined;
    return s.currentCohortCount;
  }
}
