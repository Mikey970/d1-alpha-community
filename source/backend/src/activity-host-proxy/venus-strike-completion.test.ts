import {eadPlayerIdentity} from './ead-kill-decoder';
import {BitReader} from '@blamnetwork/rsat';
import {expect,it,vi} from 'vitest';
import {advanceVenusStrikeEngineering,createVenusStrikeEngineering} from './venus-strike-engineering';
import {VenusStrikeEngineeringRuntime} from './venus-strike-engineering-runtime';
import type {TargetBatchEvidence} from './servitor-target-batch';
import {buildVenusStrikeExitDoorEntry,buildTowerSensorAuthRsat,buildVenusStrikeObjectiveAssignedSquadEntry} from './rsat/mocks/sensor-auth';
import {ObjectAuth,SensorClientRef,SquadAuth} from './rsat/schemas/sensor';
import {scenarioClient} from './scenario-client';

function fixtureState(){
  const s=createVenusStrikeEngineering('test');s.phase='combat';s.pc=s.program.length;
  for(const squad of [19,16,17,18]) s.squads[squad]={token:squad,requested:true,observed:true,
    sequence:2,alive:0,observedAt:1000,bindingLifetimeId:`test/${squad}`};
  return s;
}
// Synthetic reducer contract only. Actual EAD plus native cohorts are tested
// separately; this does not substitute for a real in-world Servitor kill.
function evidence(ids:(19|16|17|18)[]):TargetBatchEvidence{return {
  kind:'targetGroupKillEvidence',provenance:'closed_census_ead_plus_qualified_cohort_batch',
  runId:'test',connectionLifetime:'test',authoredIdentifier:0xed8bf764,wireVictimSquadIdentifier:null,
  targets:ids.map(squad=>({squad,allocationToken:`test/${squad}/${squad}`,fullAt:0,terminalAt:1000})),
  packetIds:ids.map(squad=>squad.toString(16).padStart(64,'0')),
  proof:{classHash:0x6adf06ae,classEvidence:'synthetic',closedCensusEvidence:'synthetic',retirementSemanticsEvidence:'synthetic'}};
}
it('credits qualified target groups atomically; duplicate or still-alive corner cannot partially advance',()=>{
  let s=fixtureState();
  for(const ids of [[19],[16],[17,18]] as (19|16|17|18)[][]){
    const result=advanceVenusStrikeEngineering(s,{kind:'targetGroupKillEvidence',evidence:evidence(ids),
      runId:'test',activityId:4,bundle:0x0a302429,observedAt:1000},1000);
    s=result.state;expect(result.effects.some(e=>e.kind==='progress')).toBe(true);
  }
  expect(s.defeated).toEqual([19,16,17,18]);expect(s.phase).toBe('dialogue30');
  const alive=fixtureState();alive.squads[18].alive=1;
  const event={kind:'targetGroupKillEvidence' as const,evidence:evidence([17,18]),runId:'test',activityId:4,bundle:0x0a302429,observedAt:1000};
  expect(advanceVenusStrikeEngineering(alive,event,1000).state).toBe(alive);
  const duplicate=fixtureState();duplicate.killIds.push(event.evidence.packetIds[0]);
  expect(advanceVenusStrikeEngineering(duplicate,event,1000).state).toBe(duplicate);
});
it('explicit unavailable dialogue completes objective while opened door survives until lifetime exit',()=>{
  const emitted:any[]=[],logs:string[]=[];
  const r=new VenusStrikeEngineeringRuntime('test',e=>emitted.push(e),m=>logs.push(m),eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
  const x=r as any;x.state=fixtureState();x.state.defeated=[19,16];
  x.state.killIds=evidence([19,16]).packetIds;
  x.acceptBatch(evidence([17,18]));
  expect(r.completed).toBe(true);expect(r.exitDoorStage).toBe('open');
  expect(emitted.filter(e=>e.kind==='doorOpen')).toHaveLength(1);
  expect(emitted.some(e=>e.kind==='objectiveEnd'&&e.sensor===27)).toBe(true);
  expect(emitted.some(e=>e.kind==='deleteDoor')).toBe(false);
  expect(logs.some(m=>m.includes('DIALOGUE23_UNAVAILABLE'))).toBe(true);
  r.stop();
});
it('device position command preserves generation1, uses only position version1 and survives refresh',()=>{
  const create=buildVenusStrikeExitDoorEntry('create'),open=buildVenusStrikeExitDoorEntry('open');
  expect(create.authBits).toBe(91);expect(open.authBits).toBe(316);
  expect(open.senseBody).toBeUndefined();
  expect(open.clientRef).toEqual({bundle:0x0a302429,typeId:4,typeIndex:0});
  expect(ObjectAuth.decode(new BitReader(create.authBody!)).flag).toBe(true);
  const bits=new BitReader(open.authBody!);
  expect(Number(bits.read(32))).toBe(0x80000001);expect(Number(bits.read(1))).toBe(1);
  SensorClientRef.decode(bits);expect(Number(bits.read(4))).toBe(1);
  expect(Number(bits.read(1))).toBe(1);expect(Number(bits.read(32))).toBe(0x80802d88);
  expect(Array.from({length:6},()=>Number(bits.read(32)))).toEqual([0x80000000,0,0x80000000,0,0x80000001,0x3f800000]);
  const binary=(bytes:Buffer)=>[...bytes].map(b=>b.toString(2).padStart(8,'0')).join('');
  const body=binary(open.authBody!).slice(0,open.authBits);
  const refresh=buildTowerSensorAuthRsat({scenario:scenarioClient('venus_portal_1')!,slice:7,grantTable:false,
    playerKey:0x200000002n,strikeEngineeringStarted:true,strikeEngineeringAllocatedSquads:[2,3,19,16,17,18],
    strikeEngineeringServitorKills:4,strikeEngineeringCompleted:true,strikeEngineeringExitDoorStage:'open'});
  expect(binary(refresh).split(body)).toHaveLength(2);
});
it('corner hypothesis uses task4 and refill sends authored Objective assignment without Sense reset',()=>{
  for(const squad of [7,8,9,17,18]){
    const entry=buildVenusStrikeObjectiveAssignedSquadEntry(squad);
    const auth=SquadAuth.decode(new BitReader(entry.authBody!));
    expect(auth.unk8).toBe(4);expect(auth.ref0).toEqual({bundle:0x0a302429,typeId:3,typeIndex:1});
    const refill=buildVenusStrikeObjectiveAssignedSquadEntry(squad,auth.roster.slots);
    expect(refill.senseBody).toBeUndefined();
  }
});
it.each([[0.1,3000],[0.4,4000],[0.7,5000],[0.99,6000]])('uses integer-second authored delay for roll %s',(roll,delay)=>{
  vi.useFakeTimers();const random=vi.spyOn(Math,'random').mockReturnValue(roll);
  const r=new VenusStrikeEngineeringRuntime('delay',()=>{},()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
  try{r.start();vi.advanceTimersByTime(delay-1);expect(r.allocatedSquads).toEqual([2]);
    vi.advanceTimersByTime(1);expect(r.allocatedSquads).toEqual([2,3]);
  }finally{r.stop();random.mockRestore();vi.useRealTimers();}
});
