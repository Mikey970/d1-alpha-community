import type {TargetBatchEvidence} from './servitor-target-batch';
/** Pure first-phase controller, decoded native script63 (mission1).
 * No packets, timers or persistence are performed here. The adapter must bind
 * native receipts to this run, spawn token and actor lifetime before dispatch. bindingLifetimeId is supplied by the validated adapter,
 * never synthesized from a native packet sequence/generation counter.
 */
// FNV1("strike_kill_servitors"), authored objective matching identifier.
// EAD transport does not retain a wire victim squad identifier.
export const STRIKE_SERVITOR_VICTIM_SQUAD_IDENTIFIER = 0xed8bf764;
export const STRIKE_ENGINEERING_BUNDLE = 0x0a302429;
export const STRIKE_ENGINEERING_POPULATIONS: Readonly<Record<number, readonly number[]>> = {
  2:[3,3], 3:[3,3], 4:[2,2,2], 5:[2,0,0,4], 6:[2,0,0,2],
  7:[3,0,0,3], 8:[3,0,3], 9:[1,3], 10:[0,2,4], 11:[3,3],
  12:[3,1], 16:[1], 17:[1], 18:[1], 19:[1],
};
const targets = [19,16,17,18];
type Pair = readonly [number,number];
type Step = {kind:'spawn'; squad:number} | {kind:'delay'; minMs:number; maxMs:number}
  | {kind:'count'; squads:readonly number[]; maximum:number}
  | {kind:'refill'; targets:readonly number[]; pair:Pair}
  | {kind:'clear'; squads:readonly number[]; maximum:number; targets:readonly number[]};
const pair = ([a,b]:Pair):Step[] => [{kind:'spawn',squad:a},
  {kind:'delay',minMs:3000,maxMs:6000},{kind:'spawn',squad:b}];
function formation(floor:Pair, opening:Pair, auxiliary:Pair, targetIds:number[], refill:Pair):Step[] {
  return [...pair(opening),{kind:'delay',minMs:5000,maxMs:5000},...pair(auxiliary),
    {kind:'count',squads:floor,maximum:3},{kind:'refill',targets:targetIds,pair:refill},
    {kind:'clear',squads:floor,maximum:4,targets:targetIds}];
}
type Squad = {token:number; requested:boolean; bindingLifetimeId?:string; sequence:number; observed:boolean;
  alive?:number; observedAt:number; };
export type VenusStrikeEngineeringState = {
  runId:string; maxAgeMs:number;
  phase:'new'|'arrival'|'dialogue20'|'combat'|'dialogue30'|'complete';
  program:Step[]; pc:number; serial:number;
  pending?:{kind:'spawn'|'delay'; token:number; notBefore?:number};
  squads:Record<number,Squad>; defeated:number[]; killIds:string[]; victimLifetimeIds:string[];
};
type Scope = {runId:string; activityId:number; bundle:number; observedAt:number};
export type VenusStrikeEngineeringEvent = Scope & (
  {kind:'start'}
  | {kind:'arrival'; sensor:number; bound:boolean; loaded:boolean}
  | {kind:'dialogueResolved'; sequence:number; resolution:'nativeDone'|'unavailable'}
  | {kind:'spawnRequested'; squad:number; token:number}
  | {kind:'snapshot'; squad:number; token:number; bindingLifetimeId:string; sequence:number;
      bound:boolean; loaded:boolean; alive:number; aliveCountValidated:true}
  | {kind:'targetGroupKillEvidence'; evidence:TargetBatchEvidence}
  | {kind:'killCredit'; squad:number; token:number; bindingLifetimeId:string;
      bound:boolean; loaded:boolean; credited:true; victimSquadIdentifier:number;
      killId:string; victimLifetimeId:string}
  | {kind:'delayElapsed'; token:number});
export type VenusStrikeEngineeringEffect =
  | {kind:'respawn'; squad:number; population:readonly number[]; token:number}
  | {kind:'authoredDelay'; minMs:number; maxMs:number; token:number}
  | {kind:'objectiveBegin'|'objectiveEnd'|'navEnable'|'navDisable'|'arrivalMonitor'; sensor:number}
  | {kind:'createDoor'|'deleteDoor'|'doorOpen'; sensor:0}
  | {kind:'progress'; sensor:27; current:number; total:4}
  | {kind:'dialogue'; sequence:number}
  | {kind:'startEngineeringTrash'|'phaseComplete'};

export function createVenusStrikeEngineering(runId:string, maxAgeMs=5000):VenusStrikeEngineeringState {
  if (!runId || !Number.isFinite(maxAgeMs) || maxAgeMs<=0) throw new Error('Invalid strike observation scope');
  return {runId,maxAgeMs,phase:'new',pc:0,serial:0,squads:{},defeated:[],killIds:[],victimLifetimeIds:[],program:[
    ...pair([2,3]),{kind:'count',squads:[2,3],maximum:3},
    // Native 1B5C: floor_encounter, formation(3), formation(1), formation(2).
    ...formation([10,11],[10,11],[12,19],[19],[10,11]),
    ...formation([4,5],[4,5],[6,16],[16],[4,5]),
    ...formation([7,8],[7,17],[9,18],[17,18],[7,8]),
  ]};
}

function alive(s:VenusStrikeEngineeringState, squad:number, nowMs:number):number|undefined {
  const row=s.squads[squad];
  if (!row) return 0; // Never requested is distinct from requested/unobserved.
  // Native delta omission preserves the last verified count within this binding.
  // Adapter discards this controller on actual slice exit / binding invalidation.
  return row.observed ? row.alive : undefined;
}
function below(s:VenusStrikeEngineeringState, ids:readonly number[], maximum:number, nowMs:number) {
  const counts=ids.map(id=>alive(s,id,nowMs));
  return counts.every(count=>count!==undefined) && counts.reduce<number>((sum,count)=>sum+(count??0),0)<=maximum;
}

export function advanceVenusStrikeEngineering(
  previous:VenusStrikeEngineeringState, event:VenusStrikeEngineeringEvent, nowMs:number,
):{state:VenusStrikeEngineeringState; effects:VenusStrikeEngineeringEffect[]} {
  const unchanged=()=>({state:previous,effects:[] as VenusStrikeEngineeringEffect[]});
  if (event.runId!==previous.runId || event.activityId!==4 || (event.bundle>>>0)!==STRIKE_ENGINEERING_BUNDLE
      || !Number.isFinite(nowMs) || !Number.isFinite(event.observedAt)
      || event.observedAt>nowMs || nowMs-event.observedAt>previous.maxAgeMs) return unchanged();
  if (event.kind==='dialogueResolved' && !['nativeDone','unavailable'].includes(event.resolution)) return unchanged();
  const s:VenusStrikeEngineeringState={...previous,program:[...previous.program],
    defeated:[...previous.defeated],killIds:[...previous.killIds],
    victimLifetimeIds:[...previous.victimLifetimeIds],squads:Object.fromEntries(Object.entries(previous.squads)
      .map(([id,row])=>[id,{...row}]))};
  const effects:VenusStrikeEngineeringEffect[]=[];
  if (event.kind==='start' && s.phase==='new') {
    s.phase='arrival';
    return {state:s,effects:[{kind:'createDoor',sensor:0},{kind:'objectiveBegin',sensor:24},
      {kind:'navEnable',sensor:149},{kind:'arrivalMonitor',sensor:74},{kind:'dialogue',sequence:21}]};
  }
  if (event.kind==='arrival' && s.phase==='arrival' && event.sensor===74 && event.bound && event.loaded) {
    s.phase='dialogue20';
    return {state:s,effects:[{kind:'objectiveEnd',sensor:24},{kind:'navDisable',sensor:149},{kind:'dialogue',sequence:22}]};
  }
  if (event.kind==='dialogueResolved' && event.sequence===22 && s.phase==='dialogue20') {
    // `unavailable` is an explicit adapter decision, never a combat timeout.
    s.phase='combat'; effects.push({kind:'objectiveBegin',sensor:27},{kind:'navEnable',sensor:153},
      {kind:'progress',sensor:27,current:0,total:4});
  } else if (event.kind==='spawnRequested' && s.phase==='combat') {
    const row=s.squads[event.squad];
    if (!row || row.requested || row.token!==event.token
        || event.observedAt<row.observedAt
        || s.pending?.kind!=='spawn' || s.pending.token!==event.token) return unchanged();
    // Acknowledges host transmission, not actor creation, an alive count or kill.
    row.requested=true;
    s.pending=undefined; s.pc++;
  } else if (event.kind==='snapshot' && s.phase==='combat') {
    const row=s.squads[event.squad];
    if (!row || row.token!==event.token || !event.bound || !event.loaded || event.aliveCountValidated!==true
        || typeof event.bindingLifetimeId!=='string' || !event.bindingLifetimeId.trim()
        || !Number.isInteger(event.sequence) || event.sequence<=row.sequence
        || event.observedAt<row.observedAt || (row.bindingLifetimeId!==undefined && row.bindingLifetimeId!==event.bindingLifetimeId)
        || !Number.isInteger(event.alive) || event.alive<0 || (!row.observed && event.alive===0 && row.bindingLifetimeId!==event.bindingLifetimeId)) return unchanged();
    row.bindingLifetimeId=event.bindingLifetimeId; row.sequence=event.sequence; row.observed=true;
    row.observedAt=event.observedAt; row.alive=event.alive;
  } else if (event.kind==='targetGroupKillEvidence' && s.phase==='combat') {
    const e=event.evidence;
    const ids=e.targets.map(t=>t.squad);
    if (e.runId!==s.runId || e.connectionLifetime!==s.runId
      || e.provenance!=='closed_census_ead_plus_qualified_cohort_batch'
      || e.wireVictimSquadIdentifier!==null || e.authoredIdentifier!==STRIKE_SERVITOR_VICTIM_SQUAD_IDENTIFIER
      || !['19','16','17,18'].includes(ids.join(','))
      || e.packetIds.length!==ids.length || new Set(e.packetIds).size!==ids.length
      || e.packetIds.some(id=>!/^[0-9a-f]{64}$/.test(id) || s.killIds.includes(id))
      || e.targets.some(t=> {
        const row=s.squads[t.squad];
        return !row?.requested || !row.observed || row.alive!==0 || s.defeated.includes(t.squad)
          || t.allocationToken!==`${s.runId}/${t.squad}/${row.token}`;
      })) return unchanged();
    // Atomic set-level correlation, not fabricated packet-to-actor assignment.
    // The adapter has observed each authored single allocation full1 ->0/[1]
    // and actual player-to-Servitor EAD packets under its closed issued census.
    s.killIds.push(...e.packetIds); s.defeated.push(...ids);
    effects.push({kind:'progress',sensor:27,current:s.defeated.length,total:4});
  } else if (event.kind==='killCredit' && s.phase==='combat') {
    const row=s.squads[event.squad];
    if (!targets.includes(event.squad) || !row?.observed || row.token!==event.token
        || row.bindingLifetimeId!==event.bindingLifetimeId || !event.bound || !event.loaded
        || event.credited!==true || event.victimSquadIdentifier!==STRIKE_SERVITOR_VICTIM_SQUAD_IDENTIFIER
        || typeof event.killId!=='string' || !event.killId.trim()
        || typeof event.victimLifetimeId!=='string' || !event.victimLifetimeId.trim()
        || event.observedAt<row.observedAt || s.killIds.includes(event.killId)
        || s.victimLifetimeIds.includes(event.victimLifetimeId) || s.defeated.includes(event.squad)) return unchanged();
    // Adapter validates the native incident against the actual victim/binding lifetime.
    // A wire counter is not a lifetime. Kill credit never fabricates a SquadSense zero.
    s.killIds.push(event.killId); s.victimLifetimeIds.push(event.victimLifetimeId);
    s.defeated.push(event.squad);
    effects.push({kind:'progress',sensor:27,current:s.defeated.length,total:4});
  } else if (event.kind==='delayElapsed' && s.phase==='combat' && s.pending?.kind==='delay'
      && s.pending.token===event.token && nowMs>=s.pending.notBefore!) {
    s.pending=undefined; s.pc++;
  } else if (event.kind==='dialogueResolved' && event.sequence===23 && s.phase==='dialogue30') {
    s.phase='complete';
    return {state:s,effects:[{kind:'objectiveEnd',sensor:27},{kind:'navDisable',sensor:153},
      {kind:'deleteDoor',sensor:0},{kind:'phaseComplete'}]};
  } else return unchanged();

  // Main kill objective completes independently of leftover floor trash.
  if (s.defeated.length===4 && s.phase==='combat') {
    s.phase='dialogue30'; s.pending=undefined;
    return {state:s,effects:[...effects,{kind:'doorOpen',sensor:0},
      {kind:'startEngineeringTrash'},{kind:'dialogue',sequence:23}]};
  }
  while (s.phase==='combat' && !s.pending && s.pc<s.program.length) {
    const step=s.program[s.pc];
    if (step.kind==='spawn') {
      const token=++s.serial;
      const retained=s.squads[step.squad];
      // An authored refill retains the native binding. Keep its proven identity
      // and sequence floor, while waiting for a new adapter-validated count.
      s.squads[step.squad]={token,requested:false,
        bindingLifetimeId:retained?.observed ? retained.bindingLifetimeId : undefined,
        sequence:retained?.observed ? retained.sequence : -1,
        observed:false,observedAt:nowMs};
      s.pending={kind:'spawn',token};
      effects.push({kind:'respawn',squad:step.squad,population:STRIKE_ENGINEERING_POPULATIONS[step.squad],token}); break;
    }
    if (step.kind==='delay') {
      const token=++s.serial; s.pending={kind:'delay',token,notBefore:(event.kind==='spawnRequested' ? event.observedAt : nowMs)+step.minMs};
      effects.push({kind:'authoredDelay',minMs:step.minMs,maxMs:step.maxMs,token}); break;
    }
    if (step.kind==='count' && !below(s,step.squads,step.maximum,nowMs)) break;
    if (step.kind==='clear' && (!below(s,step.squads,step.maximum,nowMs)
        || !step.targets.every(id=>alive(s,id,nowMs)===0))) break;
    if (step.kind==='refill') {
      const counts=step.targets.map(id=>alive(s,id,nowMs));
      if (counts.some(count=>count===undefined)) break;
      // Corner native condition requires BOTH objective actors still alive.
      if (counts.every(count=>count!==undefined && count>0)) s.program.splice(s.pc+1,0,...pair(step.pair));
    }
    s.pc++;
  }
  return {state:s,effects};
}
