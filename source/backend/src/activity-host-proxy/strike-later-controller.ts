/** Offline integration draft. Native scripts25,64,65,66; see STRIKE-LATER-PHASES-LOOT.md.
 * No timers, networking, input or item grants. Adapter observations MUST come from
 * this mission generation's native sensors, not inferred motion/log messages.
 * Group counts cover every bound, loaded child; terminal guards must have been
 * observed alive in that lifetime. The adapter supplies per-event-kind sequences.
 * Unknown direct-actor placement and native completion protocol are effects, not
 * fabricated payloads. Dialogue fallback requires an explicit adapter decision.
 */
export const GLOBAL = 0x0a302429;
export const DIG_SITE = 0x5de7d8e2;
export const DIG_POPULATIONS: Readonly<Record<number, readonly number[]>> = {
  1:[2],2:[3],3:[4],4:[2],5:[1],6:[1],7:[1],8:[2],9:[6],10:[1,3],11:[4],12:[4],
};
export const MINION_POPULATIONS: Readonly<Record<number, readonly number[]>> = {
  54:[4],55:[6],56:[8],57:[8],58:[6],59:[8],60:[4],61:[6],62:[8],
};
const INITIAL_DIG = [1,2,3,4,5,6,7,8,10,12];
const MINIONS = [54,55,56,57,58,59,60,61,62] as const;
type Stamp = {at:number; value:number};
type Scope = {runId:string; generation:number; activityId:4; bundle:number;
  observedAt:number; sequence:number; bound:boolean; loaded:boolean};
export type LaterEvent = Scope & (
  | {kind:'enterDigSite'; physicalBubble:5}
  | {kind:'trigger'; sensor:41|42|75}
  | {kind:'enterRuins'; physicalBubble:28}
  | {kind:'guards'; alive:number; confirmedDeadSquads:readonly number[]; qualifiedSquads:readonly number[]}
  | {kind:'guardTimeout'}
  | {kind:'boss'; actor:46; actorKey:string; fraction:number; ready:boolean; terminal:boolean}
  | {kind:'occupancy'; counts:readonly [number,number,number]} // pm1,pm2,pm3
  | {kind:'minions'; alive:number}
  | {kind:'dropComplete'; token:number; accepted:boolean; pendingWasSeen:boolean;
      nativeComplete:boolean; spawnObserved:boolean}
  | {kind:'dialogue'; cue:'d010'|'d040'; resolution:'nativeDone'|'unavailable'}
  | {kind:'delayElapsed'; token:number}
);
export type LaterEffect =
  | {kind:'placeSquad'; bundle:number; squad:number; population:readonly number[]}
  | {kind:'monitorTrigger'; bundle:number; sensor:number}
  | {kind:'objectiveBegin'|'objectiveEnd'; bundle:number; sensor:30|66|71}
  | {kind:'navEnable'|'navDisable'; bundle:number; sensor:151}
  | {kind:'dialogue'; cue:'d010'|'d040'}
  | {kind:'ammoCacheCycle'; objects:readonly [35,36,37]; periodMs:30000; active:boolean}
  | {kind:'guardTimeout'; delayMs:120000}
  | {kind:'placeDirectBoss'; squad:45; actor:46; health:78}
  | {kind:'authoredDelay'; token:number; delayMs:1000|3000}
  | {kind:'dropSquad'; token:number; stormActor:40|42|44; squad:number; population:readonly number[]}
  | {kind:'removeStorm'; actor:40|42|44}
  | {kind:'removeMinions'; squads:typeof MINIONS}
  | {kind:'bossDefeated'; objective:66; current:1; total:1}
  | {kind:'nativeActivityEnd'; objective:71; phase:158}
  | {kind:'phaseComplete'};
export type LaterState = {
  runId:string; generation:number; maxAgeMs:number;
  phase:'new'|'digSite'|'guards'|'boss'|'outro'|'endDelay'|'complete';
  streams:Record<string,{sequence:number;at:number}>; digStep:0|1|2; digArrived:boolean;
  guardSixSeen:boolean; guardDeaths:number[]; guardTimeoutAt?:number; guards?:Stamp;
  boss?:Stamp & {key:string; dead:boolean}; bossReadyAt?:number;
  objectiveActive:boolean; introDone:boolean;
  occupancy?:{at:number; counts:readonly [number,number,number]}; minions?:Stamp;
  wave:number; queue:number[]; serial:number;
  pending?:{token:number; actor:40|42|44}; delay?:{token:number; due:number};
};
export function createLaterStrike(runId:string,generation:number,maxAgeMs=5000):LaterState {
  if (!runId || !Number.isInteger(generation) || generation<0 || !Number.isFinite(maxAgeMs) || maxAgeMs<=0)
    throw new Error('Invalid strike scope');
  return {runId,generation,maxAgeMs,phase:'new',streams:{},digStep:0,digArrived:false,
    guardSixSeen:false,guardDeaths:[],objectiveActive:false,introDone:false,wave:0,queue:[],serial:0};
}
const count = (n:number) => Number.isInteger(n) && n>=0;
function fresh(s:LaterState,row:{at:number}|undefined,now:number) {
  // Native values are dirty deltas, valid through this binding until explicit unload.
  // Incoming event timestamps remain bounded independently below.
  return !!row && Number.isFinite(row.at) && row.at<=now;
}
export function advanceLaterStrike(previous:LaterState,e:LaterEvent,now:number)
  :{state:LaterState;effects:LaterEffect[]} {
  const unchanged=()=>({state:previous,effects:[] as LaterEffect[]});
  const expectedBundle=e.kind==='enterDigSite' || (e.kind==='trigger' && e.sensor!==75) ? DIG_SITE : GLOBAL;
  const stream=e.kind==='trigger' ? `trigger:${e.sensor}` : e.kind==='dialogue' ? `dialogue:${e.cue}` : e.kind;
  const last=previous.streams[stream];
  if(e.runId!==previous.runId || e.generation!==previous.generation || e.activityId!==4
    || (e.bundle>>>0)!==expectedBundle || !Number.isFinite(now) || !Number.isFinite(e.observedAt)
    || e.observedAt>now || now-e.observedAt>previous.maxAgeMs
    || !count(e.sequence) || (last && (e.sequence<=last.sequence || e.observedAt<last.at))) return unchanged();
  const s:LaterState={...previous,streams:{...previous.streams},queue:[...previous.queue],guardDeaths:[...previous.guardDeaths]};
  if(!e.bound || !e.loaded) {
    // A newer unload invalidates cached evidence; another unrelated event must
    // not advance using counts/health captured before that unload.
    s.streams[stream]={sequence:e.sequence,at:e.observedAt};
    s.guards=undefined; s.minions=undefined; s.occupancy=undefined;
    s.guardSixSeen=false; s.guardDeaths=[]; s.guardTimeoutAt=undefined;
    if(s.boss) s.boss={...s.boss,at:Number.NEGATIVE_INFINITY};
    return {state:s,effects:[]};
  }
  const effects:LaterEffect[]=[];
  const emitObjective=(kind:'objectiveBegin'|'objectiveEnd',sensor:30|66|71) =>
    effects.push({kind,bundle:GLOBAL,sensor});
  const placeBoss=()=>{
    s.phase='boss'; s.bossReadyAt=now+1000;
    effects.push({kind:'placeDirectBoss',squad:45,actor:46,health:78},
      {kind:'authoredDelay',token:++s.serial,delayMs:1000});
  };
  if(e.kind==='enterDigSite' && s.phase==='new' && e.physicalBubble===5) {
    s.phase='digSite'; emitObjective('objectiveBegin',30);
    for(const squad of INITIAL_DIG) effects.push({kind:'placeSquad',bundle:DIG_SITE,squad,population:DIG_POPULATIONS[squad]});
    effects.push({kind:'monitorTrigger',bundle:DIG_SITE,sensor:42},{kind:'monitorTrigger',bundle:GLOBAL,sensor:75});
  } else if(e.kind==='trigger' && s.phase==='digSite') {
    if(e.sensor===42 && s.digStep===0) {
      s.digStep=1;
      effects.push({kind:'placeSquad',bundle:DIG_SITE,squad:11,population:DIG_POPULATIONS[11]},
        {kind:'monitorTrigger',bundle:DIG_SITE,sensor:41});
    } else if(e.sensor===41 && s.digStep===1) {
      s.digStep=2; effects.push({kind:'placeSquad',bundle:DIG_SITE,squad:9,population:DIG_POPULATIONS[9]});
    } else if(e.sensor===75 && !s.digArrived) {
      s.digArrived=true; emitObjective('objectiveEnd',30);
    } else return unchanged();
  } else if(e.kind==='enterRuins' && s.phase==='digSite' && s.digArrived && e.physicalBubble===28) {
    s.phase='guards';
    for(let squad=47;squad<=52;squad++) effects.push({kind:'placeSquad',bundle:GLOBAL,squad,population:[1]});
    effects.push({kind:'dialogue',cue:'d010'},{kind:'ammoCacheCycle',objects:[35,36,37],periodMs:30000,active:true});
  } else if(e.kind==='guards' && s.phase==='guards') {
    const deaths=new Set(e.confirmedDeadSquads);
    const qualified=new Set(e.qualifiedSquads);
    if(!count(e.alive) || e.alive>6 || deaths.size!==e.confirmedDeadSquads.length
      || [...deaths].some(id=>!Number.isInteger(id) || id<47 || id>52)
      || s.guardDeaths.some(id=>!deaths.has(id)) || deaths.size!==6-e.alive
      || qualified.size!==6 || e.qualifiedSquads.length!==6
      || [47,48,49,50,51,52].some(id=>!qualified.has(id))) return unchanged();
    s.guardDeaths=[...deaths];
    s.guards={at:e.observedAt,value:e.alive};
    // Every singleton independently materialized; they need not be alive simultaneously.
    s.guardSixSeen=true;
    if(s.guardSixSeen && e.alive<5 && s.guardTimeoutAt===undefined) {
      s.guardTimeoutAt=now+120000; effects.push({kind:'guardTimeout',delayMs:120000});
    }
    // The timer may have fired while the last count was stale. Reconsider its
    // already-expired deadline on the next actual fresh guard receipt.
    if(s.guardTimeoutAt!==undefined && (e.alive===0 || now>=s.guardTimeoutAt)) placeBoss();
  } else if(e.kind==='guardTimeout' && s.phase==='guards' && s.guardTimeoutAt!==undefined
    && now>=s.guardTimeoutAt && fresh(s,s.guards,now)) {
    placeBoss();
  } else if(e.kind==='dialogue' && (e.resolution==='nativeDone' || e.resolution==='unavailable')) {
    if(e.cue==='d010' && (s.phase==='guards' || s.phase==='boss') && !s.introDone) {
      s.introDone=true; s.objectiveActive=true; emitObjective('objectiveBegin',66);
      effects.push({kind:'navEnable',bundle:GLOBAL,sensor:151});
    } else if(e.cue==='d040' && s.phase==='outro') {
      emitObjective('objectiveEnd',66); effects.push({kind:'navDisable',bundle:GLOBAL,sensor:151});
      s.phase='endDelay'; s.delay={token:++s.serial,due:now+3000};
      effects.push({kind:'authoredDelay',token:s.delay.token,delayMs:3000});
    } else return unchanged();
  } else if(e.kind==='boss' && s.phase==='boss' && e.actor===46 && e.ready
    && e.observedAt>=s.bossReadyAt! && e.actorKey && Number.isFinite(e.fraction) && e.fraction>=0 && e.fraction<=1) {
    if(s.boss && s.boss.key!==e.actorKey) return unchanged();
    if(e.terminal && (!s.boss || e.fraction!==0)) return unchanged();
    if(!e.terminal && e.fraction===0) return unchanged();
    s.boss={at:e.observedAt,value:e.fraction,key:e.actorKey,dead:e.terminal};
  } else if(e.kind==='occupancy' && s.phase==='boss' && e.counts.length===3 && e.counts.every(count)) {
    s.occupancy={at:e.observedAt,counts:[...e.counts]};
  } else if(e.kind==='minions' && s.phase==='boss' && count(e.alive)) {
    s.minions={at:e.observedAt,value:e.alive};
  } else if(e.kind==='dropComplete' && s.phase==='boss' && s.pending?.token===e.token
    && e.accepted && e.pendingWasSeen && e.nativeComplete && e.spawnObserved) {
    effects.push({kind:'removeStorm',actor:s.pending.actor});
    s.pending=undefined;
    // The adapter publishes the reconciled post-allocation cohort before
    // emitting dropComplete. Keep that dirty delta; no unchanged resend is required.
  } else if(e.kind==='delayElapsed' && s.phase==='endDelay' && s.delay?.token===e.token && now>=s.delay.due) {
    s.phase='complete'; s.delay=undefined;
    effects.push({kind:'ammoCacheCycle',objects:[35,36,37],periodMs:30000,active:false},
      {kind:'nativeActivityEnd',objective:71,phase:158},{kind:'phaseComplete'});
  } else return unchanged();
  s.streams[stream]={sequence:e.sequence,at:e.observedAt};
  if(s.phase==='boss' && s.boss?.dead && s.objectiveActive && fresh(s,s.boss,now)) {
    s.phase='outro'; s.queue=[];
    if(s.pending) effects.push({kind:'removeStorm',actor:s.pending.actor});
    s.pending=undefined;
    effects.push({kind:'bossDefeated',objective:66,current:1,total:1},
      {kind:'removeMinions',squads:MINIONS},{kind:'dialogue',cue:'d040'});
  }
  if(s.phase==='boss' && !s.boss?.dead && !s.pending && fresh(s,s.boss,now)) {
    if(!s.queue.length && s.wave<3 && s.boss!.value<[0.75,0.50,0.25][s.wave] && fresh(s,s.occupancy,now)) {
      const [one,two,three]=s.occupancy!.counts;
      const direction=two>=one && two>=three ? 2 : one>=three ? 1 : 3;
      const order=[direction,direction%3+1,(direction+1)%3+1];
      const sizes=s.wave===0 ? [0,0] : s.wave===1 ? [1,1,0] : [2,2,1];
      s.queue=sizes.map((size,index)=>54+(order[index]-1)*3+size); s.wave++;
    }
    if(s.queue.length && fresh(s,s.minions,now) && s.minions!.value<12) {
      const squad=s.queue.shift()!;
      const actor=(40+Math.floor((squad-54)/3)*2) as 40|42|44;
      s.pending={token:++s.serial,actor};
      effects.push({kind:'dropSquad',token:s.pending.token,stormActor:actor,squad,population:MINION_POPULATIONS[squad]});
    }
  }
  return {state:s,effects};
}
