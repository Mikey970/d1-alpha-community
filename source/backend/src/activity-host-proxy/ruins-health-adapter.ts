/** Analysis only. Actual native receipts -> existing pure later-strike model.
 * No sockets, timers, processes or input. Boss death deliberately cannot be emitted:
 * Health0 and ActorSense terminal flags have no proven terminal correlation yet.
 */
import type {BossKillProof} from './ruins-boss-kill-gate';
import {decodeStrikeSense,StrikeSquadObservations} from './ruins-sense';
import {advanceLaterStrike,GLOBAL,MINION_POPULATIONS} from './strike-later-controller';
import type {LaterState,LaterEvent,LaterEffect} from './strike-later-controller';
export const GUARDS=[47,48,49,50,51,52] as const;
export const MINIONS=[54,55,56,57,58,59,60,61,62] as const;
export type RuinsScope={runId:string;generation:number;activityId:4;physicalBubble:28;
  observedAt:number;bound:boolean;loaded:boolean};
export class RuinsSenseAdapter {
  private observations=new StrikeSquadObservations();
  private tokens:Record<number,string>={};
  private allocations=new Map<number,readonly number[]>();
  private zeroReceipts=new Map<number,{sequence:number}>();
  private monitors=new Map<number,{sequence:number;count:number}>();
  private actor?:{token:string;generation:number;sequence:number;bound:boolean};
  private healthSequence=-1;
  private eventSequence=0;
  private epoch:string;
  state:LaterState;
  constructor(state:LaterState) {
    this.state=state;
    this.epoch=`${state.runId}/${state.generation}`;this.observations.reset(this.epoch);
  }
  /** Called only after the matching native binding/allocation Auth was actually issued.
   * Retain token for cumulative refills; replacing token invalidates previous receipts.
   */
  bindSquad(squad:number,token:string,population:readonly number[],sequenceFloor=-1):void {
    if(![...GUARDS,...MINIONS].includes(squad as never) || !token || population.length!==1 ||
      population.some(n=>!Number.isSafeInteger(n)||n<0||n>0x7fffffff)) throw Error('Invalid Ruins allocation');
    if(this.tokens[squad]===token && this.allocations.get(squad)?.[0]!==0 && population[0]>0) {
      this.observations.updateAllocation(squad,token,population);
    } else {
      this.observations.invalidate(squad);
      if(population[0]>0)this.observations.bind(squad,token,population,sequenceFloor);
    }
    this.tokens[squad]=token;this.allocations.set(squad,[...population]);this.zeroReceipts.delete(squad);
  }
  bindBoss(token:string,nativeGeneration:number,sequenceFloor=-1):void {
    if(!token||!Number.isInteger(nativeGeneration)||nativeGeneration<0)throw Error('Missing actual Actor46 generation');
    this.actor={token,generation:nativeGeneration,sequence:sequenceFloor,bound:false};this.healthSequence=-1;
  }
  private dispatch(input:Record<string,unknown>,now:number):LaterEffect[] {
    const event={...input,runId:this.state.runId,generation:this.state.generation,activityId:4,bundle:GLOBAL,
      observedAt:now,sequence:++this.eventSequence,bound:true,loaded:true} as LaterEvent;
    const result=advanceLaterStrike(this.state,event,now);this.state=result.state;return result.effects;
  }
  nativePopulation(squad:number,now:number){const p=this.observations.validatedPopulation(squad,this.tokens[squad],now);
    return p; /* Same-binding dirty delta remains authoritative until invalidation. */}
  /** Initial zero cohort must be a real receipt, not its sent Sense template. */
  initialZeroSeen(squad:number){return this.allocations.get(squad)?.[0]===0&&this.zeroReceipts.has(squad);}
  acceptQualifiedBossKill(proof:BossKillProof,now:number):LaterEffect[] {
    if(!this.actor || proof.actorKey!==`${this.actor.token}/${this.actor.generation}` ||
      proof.provenance!=='actual_ead_kill_plus_unique_authored_boss_binding' || proof.killAt>now ||
      now-proof.killAt>this.state.maxAgeMs)return [];
    return this.dispatch({kind:'boss',actor:46,actorKey:proof.actorKey,fraction:0,ready:true,terminal:true},now);
  }
  /** Optional pure hook for real phase/arrival/drop acknowledgements owned by the integrator.
   * This does not schedule authored delays, create a boss or claim a drop has completed.
   */
  control(event:LaterEvent,now:number):LaterEffect[] {
    if(event.kind==='boss'||event.kind==='guards'||event.kind==='minions'||event.kind==='occupancy')
      throw Error('Combat observations must come from decoded native receipts');
    const result=advanceLaterStrike(this.state,event,now);this.state=result.state;return result.effects;
  }
  observe(payload:Buffer,scope:RuinsScope,now:number):LaterEffect[] {
    if(scope.runId!==this.state.runId||scope.generation!==this.state.generation||scope.activityId!==4||
      scope.physicalBubble!==28||!Number.isFinite(now)||!Number.isFinite(scope.observedAt)||
      scope.observedAt>now||now-scope.observedAt>this.state.maxAgeMs)return [];
    if(!scope.bound||!scope.loaded) {
      this.observations.reset(this.epoch);this.tokens={};this.allocations.clear();this.zeroReceipts.clear();
      this.monitors.clear();this.actor=undefined;this.healthSequence=-1;
      const result=advanceLaterStrike(this.state,{kind:'minions',alive:0,...scope,bundle:GLOBAL,
        sequence:++this.eventSequence} as LaterEvent,now);this.state=result.state;return [];
    }
    const decoded=decodeStrikeSense(payload);if(!decoded)return [];
    const effects:LaterEffect[]=[];
    const rows=this.observations.observe(payload,{epoch:this.epoch,tokens:this.tokens,bound:true,loaded:true,now:scope.observedAt});
    for(const r of decoded.squads) {
      if(this.allocations.get(r.index)?.[0]!==0||!r.valid||r.currentCohortCount!==0||
        r.retirementRoster?.length!==1||r.retirementRoster[0]!==0)continue;
      if(r.sequence>(this.zeroReceipts.get(r.index)?.sequence??-1))this.zeroReceipts.set(r.index,{sequence:r.sequence});
    }
    for(const r of decoded.rows) {
      if(r.bundle!==GLOBAL)continue;
      if(r.type===2 && r.index===46 && this.actor && r.sequence>this.actor.sequence) {
        if(r.generation!==undefined && r.generation!==this.actor.generation){this.actor=undefined;continue;}
        this.actor.sequence=r.sequence;this.actor.bound=r.bound===true && r.terminal!==true;
      }
      if(r.type===28 && r.occupancy!==undefined && r.sequence>(this.monitors.get(r.index)?.sequence??-1))
        this.monitors.set(r.index,{sequence:r.sequence,count:r.occupancy});
    }
    const guards=GUARDS.map(s=>this.observations.validatedPopulation(s,this.tokens[s],now));
    if(rows.some(r=>GUARDS.includes(r.squad as never))&&guards.every(Boolean)) {
      const dead=GUARDS.filter((s,i)=>guards[i]!.currentCohortCount===0&&guards[i]!.retirementRoster[0]===1);
      effects.push(...this.dispatch({kind:'guards',alive:guards.reduce((n,r)=>n+r!.currentCohortCount,0),confirmedDeadSquads:dead,qualifiedSquads:GUARDS},now));
    }
    if([79,80,81].every(s=>this.monitors.has(s))&&decoded.rows.some(r=>r.type===28&&r.bundle===GLOBAL))
      effects.push(...this.dispatch({kind:'occupancy',counts:[80,79,81].map(s=>this.monitors.get(s)!.count)},now));
    const minions=MINIONS.map(s=>this.allocations.get(s)?.[0]===0
      ?this.zeroReceipts.has(s)?0:undefined:this.observations.count(s,now));
    if(minions.every(n=>n!==undefined)&&decoded.squads.some(r=>MINIONS.includes(r.index as never)))
      effects.push(...this.dispatch({kind:'minions',alive:minions.reduce<number>((n,v)=>n+v!,0)},now));
    for(const r of decoded.rows) {
      if(r.bundle!==GLOBAL||r.type!==19||r.index!==78||r.sequence<=this.healthSequence||
        !this.actor?.bound||r.healthRevision!==0||r.health===undefined||r.health<=0||r.health>1||
        r.shield===undefined||r.shield<0||r.shield>1)continue;
      this.healthSequence=r.sequence;
      effects.push(...this.dispatch({kind:'boss',actor:46,actorKey:`${this.actor.token}/${this.actor.generation}`,
        fraction:r.health,ready:true,terminal:false},now));
    }
    return effects;
  }
}

/** Exact native Auth bodies, not game state writes or SensorPublish packets. */
class Bits {
  values:number[]=[];
  number(value:number,width:number){for(let i=width-1;i>=0;i--)this.values.push(Math.floor(value/2**i)%2);}
  ref(type:number,index:number){this.number(GLOBAL,32);this.number(type+1,6);this.number(index+0x8000,16);}
  finish(){const bytes=Buffer.alloc(Math.ceil(this.values.length/8));this.values.forEach((v,i)=>bytes[i>>3]|=v<<(7-(i&7)));return {bytes,bitCount:this.values.length};}
}
export function encodeRuinsHealthBinding(){const b=new Bits();b.ref(2,46);b.number(0xbf800000,32);b.number(0xbf800000,32);b.number(0x80000000,32);return b.finish();}
export function encodeRuinsAssignedSquad(squad:number,cumulativePopulation?:number) {
  const base=GUARDS.includes(squad as never)?1:MINION_POPULATIONS[squad]?.[0];
  if(base===undefined)throw Error('Direct boss/storm requires Actor placement, not fabricated population');
  const n=cumulativePopulation??base;if(!Number.isInteger(n)||n<base||n>0x7fffffff)throw Error('Invalid cumulative population');
  const task=GUARDS.includes(squad as never)?1:2; // HostObjective38 tasks:guard group181, thenwildcard.
  const b=new Bits();b.number(1,1);b.ref(3,38);b.number(0,1);b.number(0,1);
  b.number(1,1);b.number(1,4);b.number(n+0x80000000,32);b.number(0,1); // Epoch omitted.
  b.number(1,1);b.number(1,31);b.number(0,1);b.number(0,1);b.number(1,1);b.number(task+1,5);
  b.number(1,2);b.number(1,3);return b.finish();
}
