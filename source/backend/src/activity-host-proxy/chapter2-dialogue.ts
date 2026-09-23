import {BitReader,BitWriter} from '@blamnetwork/rsat';
import {SequenceAuth,PlayerTriggerAuth,SensorClientRef} from './rsat/schemas/sensor';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import type {readVenusGateSense} from './venus-gate-progress';

/** Packaged Chapter 2 timelines, verified against all 26 extracted WAV events.
 * Timing serializes audio only: it never acknowledges native mission completion. */
export const CHAPTER2_DURATIONS: Readonly<Record<number,number>> = {
  5:12.975970268249512,
  6:2.8817501068115234,
  11:10.272171020507812,
  12:1.0272899866104126,
  13:6.25862979888916,
  21:7.184959888458252,
  22:6.321809768676758,
  49:2.5183300971984863,
  50:3.16510009765625,
  51:2.442349910736084,
  52:2.1914799213409424,
  53:2.1772100925445557,
  54:1.0247700214385986,
  55:3.272900104522705,
  67:8.501900672912598,
  68:5.96435022354126,
  113:1.9983099699020386,
  114:1.3706300258636475,
  115:1.9935599565505981,
  116:2.2016899585723877,
  117:6.517940044403076,
  118:4.862880229949951
};
export function chapter2SequenceEntry(index:number,tick:number,play=false):SensorAuthSenseEntry {
  if(!(index in CHAPTER2_DURATIONS)||!Number.isInteger(tick)||tick<0||tick>0x7fffffff)throw Error('Invalid Chapter2 cue');
  const w=new BitWriter(256);
  SequenceAuth.encode(w,{unk0:tick,unk1:play?1:255,
    pair:{a:{f0:0x811c9dc5,f1:0x811c9dc5},b:{f0:0x811c9dc5,f1:0x811c9dc5}},
    ref:{bundle:0x811c9dc5,typeId:-1,typeIndex:-1}});
  return {clientRef:{bundle:0x517641f1,typeId:5,typeIndex:index},authSchemaBound:true,senseSchemaBound:false,
    nativeBodyFraming:true,fullAuthState:true,isReceivedSenseState:false,isSenseUpdateRelative:true,authBody:w.finish(),authBits:w.bitCount};
}
export function chapter2TriggerEntry(index:number,tick:number):SensorAuthSenseEntry {
  if(![134,138,139,141,142,148,149,155].includes(index))throw Error('Unknown Chapter2 dialogue trigger');
  const w=new BitWriter(64);PlayerTriggerAuth.encode(w,{flag:true,unk:tick});
  return {clientRef:{bundle:0x517641f1,typeId:29,typeIndex:index},authSchemaBound:true,senseSchemaBound:false,
    nativeBodyFraming:true,fullAuthState:true,isReceivedSenseState:false,isSenseUpdateRelative:true,authBody:w.finish(),authBits:w.bitCount};
}
export function readChapter2DialogueTrigger(payload:Buffer):number|undefined {
  if(payload.length!==50)return;
  try {
    const r=new BitReader(payload);
    if(r.readNumber(4)!==1||(r.readNumber(32)>>>0)!==0xdd6d986f)return;
    while(r.bitPos<310)r.readBit();const ref=SensorClientRef.decode(r);
    if((ref.bundle>>>0)!==0x517641f1||ref.typeId!==29||
      (r.readNumber(32)>>>0)!==0x811c9dc5||r.readNumber(4)!==0)return;
    return ref.typeIndex;
  }catch{return;}
}

/** Which area each dialogue trigger belongs to, and the line it requests. */
export const CHAPTER2_TRIGGER_CUES: Readonly<Record<number,readonly [number,number]>> = {
  134:[8,11],138:[10,21],139:[10,22],141:[23,49],
  142:[23,50],148:[23,67],149:[23,68],155:[14,113]
};

/** r545 capture: over a full Captain run the native emitted exactly one
 * PlayerTrigger incident (44FB7AA2/29/35, the entrance pt_reinf). The dialogue
 * volumes in 517641F1 are armed, correctly addressed and simply never reported,
 * so a line that waits only on its incident stays queued for the whole mission.
 * Once the player is demonstrably in the matching area, fall back to the
 * server's own arrival state. A native incident still wins outright: it plays
 * immediately and enqueue dedupes on `seen`, so the fallback becomes a no-op. */
const TRIGGER_FALLBACK_MS = 20000;

/** Triggers armed by a progress event rather than by entering an area. The
 * event they answer has already happened, so the long area-arrival grace puts
 * the reply well after the player has moved on to the next objective. */
const EVENT_ARMED_TRIGGERS = new Set([139]);
const EVENT_FALLBACK_MS = 3000;

/** The native does report some dialogue triggers: r545 captured 517641F1/29/142
 * arriving in Southern Tides. These four answer mid-encounter beats — the
 * device test, Fallen reinforcements — so a fallback that fires them off the
 * arrival timer narrates events that have not happened yet, and it fired all
 * four inside twenty seconds. The native drives them; we wait for it. */
const NATIVE_ONLY_TRIGGERS = new Set([141,142,148,149]);

/** Authored ch2m1_collect_loot timeout that releases the post-Captain line. */
const CAPTAIN_LOOT_TIMEOUT_MS = 120000;

/** Only verified arrivals, pickups, device use, gate defeats and native trigger
 * incidents request speech. Unknown spatial/boss conditions remain unrequested.
 * Authored duration is an audio queue estimate, never a native is_done receipt. */
export class Chapter2Dialogue {
  private slice:number|undefined;
  private seen=new Set<number>();
  private pending:{index:number,due:number}[]=[];
  private gateObjective=false;
  private gateCount=0;
  private fluidCount=0;
  private readonly monitors=new Map<number,{sequence:number;inside:boolean}>();
  private readonly snipers=new Map<number,{sequence:number;live:number}>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private delayed:number|undefined;
  private captainLoot:ReturnType<typeof setTimeout>|undefined;
  private readonly fallbacks=new Map<number,ReturnType<typeof setTimeout>>();
  private stopped=false;
  private completion=new Map<number,()=>void>();
  readonly retained=new Map<string,SensorAuthSenseEntry>();
  constructor(private readonly tick:()=>number,private readonly send:(entry:SensorAuthSenseEntry,label:string)=>void){}
  private emit(entry:SensorAuthSenseEntry,label:string){
    this.retained.set(`${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`,entry);this.send(entry,label);
  }
  private arm(index:number){
    const key=`29/${index}`;if(this.retained.has(key))return;
    this.emit(chapter2TriggerEntry(index,this.tick()),`trigger=${index} armed; native incident required`);
    this.scheduleFallback(index);
  }
  /** A trigger only counts as reachable once the player is in its own area,
   * so the line cannot play early from an area the script has not reached.
   * 138 is deliberately strict here even though a native 138 incident may
   * satisfy from anywhere: phase01 arms it before Headlands, so a fallback
   * that ignored the area played the Headlands line beside the dead Captain. */
  private inTriggerArea(index:number):boolean {
    const target=CHAPTER2_TRIGGER_CUES[index];
    return !!target&&target[0]===this.slice;
  }
  private scheduleFallback(index:number){
    if(this.stopped||NATIVE_ONLY_TRIGGERS.has(index))return;
    if(this.fallbacks.has(index)||this.seen.has(CHAPTER2_TRIGGER_CUES[index]?.[1] ?? -1))return;
    if(!this.inTriggerArea(index))return;
    this.fallbacks.set(index,setTimeout(()=>{
      this.fallbacks.delete(index);
      if(this.stopped||!this.retained.has(`29/${index}`)||!this.inTriggerArea(index))return;
      this.enqueue(CHAPTER2_TRIGGER_CUES[index]![1]);
    },EVENT_ARMED_TRIGGERS.has(index)?EVENT_FALLBACK_MS:TRIGGER_FALLBACK_MS));
  }
  enter(slice:number){
    if(this.stopped||slice===this.slice)return;
    this.slice=slice;
    // Occupancy and combat observations belong to this loaded area lifetime.
    this.monitors.clear();this.snipers.clear();
    // Session has already waited for area loading to settle.
    if(slice===16||slice===8)this.enqueue(5);
    if(slice===10)this.arm(138);
    if(slice===23)for(const n of [148,149,141,142])this.arm(n);
    if(slice===14)this.arm(155);
    // Triggers armed in an earlier area become reachable on arriving here.
    for(const index of Object.keys(CHAPTER2_TRIGGER_CUES).map(Number))
      if(this.retained.has(`29/${index}`))this.scheduleFallback(index);
  }
  incident(payload:Buffer){
    const trigger=readChapter2DialogueTrigger(payload);
    if(trigger===undefined||!this.retained.has(`29/${trigger}`))return;
    const fallback=this.fallbacks.get(trigger);
    if(fallback){clearTimeout(fallback);this.fallbacks.delete(trigger);}
    const target=CHAPTER2_TRIGGER_CUES[trigger];
    // A real native incident is authoritative, and a captured 138 legitimately
    // satisfies from the approach. Only the fallback is area-strict.
    if(target&&(this.inTriggerArea(trigger)||trigger===138))this.enqueue(target[1]);
  }
  // Phase01 script enables this spatial dialogue trigger before entering Headlands.
  phaseOne(){if(!this.stopped)this.arm(138);}
  /** phase00.md_c2_m1_d030. Once the Captain's alive_count reaches zero the
   * script ends ch2m1_collect_loot on its completion **or** an authored
   * 120-second timeout, then wakes d030. Loot completion is not modelled on
   * this server, so we honour the timeout branch — the script's own
   * alternative, not an invented condition. Storage order is 5,6,11 but this
   * line belongs after the Captain, never in the opening exchange. */
  captainDefeated(){
    if(this.stopped||this.captainLoot||this.seen.has(6))return;
    this.captainLoot=setTimeout(()=>{
      this.captainLoot=undefined;
      this.enqueue(6);
    },CAPTAIN_LOOT_TIMEOUT_MS);
  }
  /** phase03.md_c2_m5_d030 and _d040. The boss worker starts d030 once the
   * Gatekeeper is alive, then starts d040 after d030 reports done. The
   * playback queue already serialises on each cue's duration, so enqueueing
   * both here reproduces that ordering without inventing a second timer. */
  gatekeeperSpawned(){
    if(this.stopped||this.slice!==14)return;
    this.enqueue(115);this.enqueue(116);
  }
  /** Completion uses the same packaged-duration estimate as all other cues. */
  endGateDialogue(done:()=>void){this.completion.set(117,done);this.enqueue(117,4000);}
  endMissionDialogue(done:()=>void){this.completion.set(118,done);this.enqueue(118);}
  fluids(count:number){
    if(this.stopped||this.slice!==10||!Number.isInteger(count)||count<0||count>10)return;
    this.fluidCount=Math.max(this.fluidCount,count);
    count=this.fluidCount;
    if(count>=10){
      // The half-way progress line is obsolete once the set is complete: queued
      // behind the arrival line it had Ghost ask for samples already collected.
      this.drop(12);
      // The shipped script enables 139 here, but its actual WAV instructs the
      // player to kill Vex and collect samples. Restore that instruction before
      // collection, after the device-identification exchange (21), instead.
      this.seen.add(22);this.drop(22);
      const fallback=this.fallbacks.get(139);
      if(fallback){clearTimeout(fallback);this.fallbacks.delete(139);}
    }
    this.flushFluidDialogue();
  }
  /** Observed progress waits for its introduction; pickups do not synthesize
   * a spatial incident. The existing native/arrival trigger releases cue 21.
   * If collection is already complete, the now-obsolete instruction is skipped. */
  private flushFluidDialogue(){
    if(this.stopped||this.slice!==10)return;
    if(this.fluidCount>=10){if(this.seen.has(21))this.enqueue(13);}
    else if(this.fluidCount>=5&&this.seen.has(22))this.enqueue(12);
  }
  device(){if(this.slice===23){this.gateObjective=true;this.enqueue(51);this.spatialDialogue();}}
  southernSense(update:ReturnType<typeof readVenusGateSense>){
    if(this.stopped||this.slice!==23||!update)return;
    for(const m of update.monitors){
      if(m.sequence>(this.monitors.get(m.index)?.sequence??-1))
        this.monitors.set(m.index,{sequence:m.sequence,inside:m.anyInside});
    }
    for(const s of update.squads){
      if(![39,41,43,44,45,46,47].includes(s.index)||!s.valid||s.live===undefined)continue;
      if(s.sequence>(this.snipers.get(s.index)?.sequence??-1))
        this.snipers.set(s.index,{sequence:s.sequence,live:s.live});
    }
    this.spatialDialogue();
  }
  private spatialDialogue(){
    if(!this.gateObjective||this.slice!==23||this.gateCount>=4)return;
    // script31 d020: native count<4, followed by gate01 OR gate03 inside.
    if(this.monitors.get(144)?.inside||this.monitors.get(146)?.inside)this.enqueue(52);
    // script31 d040: gate02 inside, sniper group alive_count>1, count==2.
    // Unknown squad counts contribute nothing; no spawn request counts as life.
    if(this.gateCount===2&&this.monitors.get(145)?.inside&&
       [...this.snipers.values()].reduce((sum,s)=>sum+s.live,0)>1)this.enqueue(54);
  }
  gates(count:number){
    if(this.slice!==23)return;
    this.gateCount=count;
    if(count===2)this.enqueue(53,8000);
    if(count!==2)this.drop(54);
    if(count===4){this.drop(52);this.drop(53);this.enqueue(55,4000);}
    this.spatialDialogue();
  }
  bossGates(){if(this.slice===14)this.enqueue(114);}
  stop(){
    this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.pending=[];
    if(this.captainLoot)clearTimeout(this.captainLoot);this.captainLoot=undefined;
    for(const fallback of this.fallbacks.values())clearTimeout(fallback);
    this.fallbacks.clear();this.completion.clear();
  }
  private enqueue(index:number,delay=0){
    if(this.stopped||this.seen.has(index))return;
    this.seen.add(index);this.pending.push({index,due:Date.now()+delay});
    // An authored delay does not occupy the audio channel. Reconsider it
    // when another native condition releases a line that is ready now.
    if(this.delayed!==undefined){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.delayed=undefined;}
    if(!this.timer)this.next();
  }
  /** Retire a line the mission has already moved past. It stays in `seen`, so
   * it is never requeued. A line already being spoken cannot be unspoken. */
  private drop(index:number){
    this.pending=this.pending.filter(item=>item.index!==index);
    if(this.delayed===index){
      if(this.timer)clearTimeout(this.timer);
      this.timer=undefined;this.delayed=undefined;this.next();
    }
  }
  private next(){
    if(!this.pending.length||this.stopped)return;
    const ready=this.pending.findIndex(item=>item.due<=Date.now());
    if(ready<0){
      const first=this.pending.reduce((a,b)=>a.due<=b.due?a:b);
      this.delayed=first.index;
      this.timer=setTimeout(()=>{this.timer=undefined;this.delayed=undefined;this.next();},Math.max(0,first.due-Date.now()));
      return;
    }
    const [item]=this.pending.splice(ready,1);
    const play=()=>{
      this.delayed=undefined;
      if(this.stopped)return;
      this.emit(chapter2SequenceEntry(item.index,this.tick(),true),`sequence=${item.index}; packaged timeline; audible completion unverified`);
      this.timer=setTimeout(()=>{
        this.timer=undefined;
        // This arms a spatial trigger only; no automatic speech or progress.
        if(item.index===5)this.arm(134);
        // Audio 80B0C020 explicitly requests the samples; it is not a response
        // to collecting them. Never release it after the objective completes.
        if(item.index===21&&!this.seen.has(22))this.arm(139);
        const complete=this.completion.get(item.index);this.completion.delete(item.index);complete?.();
        if(!this.timer)this.next();
      },Math.ceil(CHAPTER2_DURATIONS[item.index]*1000)+250);
      // Install the audio timer first so this cannot start overlapping speech.
      if(item.index===21||item.index===22)this.flushFluidDialogue();
    };
    play();
  }
}
