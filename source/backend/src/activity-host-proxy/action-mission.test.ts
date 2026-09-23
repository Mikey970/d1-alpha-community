import {describe,it,expect} from 'vitest';
import {BitWriter,decode} from '@blamnetwork/rsat';
import {ActionMission} from './action-mission';
import {ACTION_BUNDLE,ACTION_OBJECTIVES,actionIncident} from './action-mission-wire';
import {LifetimeAuth,PlayerAuth,PlayerObjectiveAuth,SensorClientRef,SquadAuth} from './rsat/schemas/sensor';
import {decodeStrikeSense} from './strike-squad-sense';
import captured from './action-sense-r550.fixture.json';
import fixture from './action-mission.fixture.json';
import {buildTowerApplySenseEntries,buildTowerBinderSenseEntries,preserveActionMissionApply, type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';

// Protocol test inputs only. These are never injected into a live game.
function incident(index:number,serial:number,bundle=ACTION_BUNDLE):Buffer {
  const o=ACTION_OBJECTIVES[index],w=new BitWriter(64);
  w.write(1,4);w.write(o.kind==='travel'?0xdd6d986f:0xe882d22f,32);
  w.write(serial,32);while(w.bitCount<310)w.writeBit(0);
  if(o.trigger!==null){SensorClientRef.encode(w,{bundle,typeId:29,typeIndex:o.trigger});w.write(0x811c9dc5,32);w.write(0,4);}
  else {w.write(o.incidentHash!,32);w.write(0,10);}
  return w.finish();
}
function setup(){
  let now=0;const sent:{entries:SensorAuthSenseEntry[];label:string}[]=[];
  const mission=new ActionMission(()=>now,()=>now*60/1000,(entries,label)=>sent.push({entries,label}),()=>0);
  const advance=(ms:number)=>{now+=ms;mission.update();};
  mission.sense(Buffer.from(captured.initial,'hex'));mission.sense(Buffer.from(captured.root,'hex'));
  return {mission,sent,advance};
}
describe('native Activity1 mission',()=>{
  it('binds one occupied native player while acknowledging all sixteen Action slots',()=>{
    const key=0x200000002n;
    for(const entries of [buildTowerBinderSenseEntries(key,'action_mock'),
      buildTowerApplySenseEntries(key,0,'action_mock')]){
      const players=entries.filter(e=>e.clientRef.typeId===12);
      expect(players.map(e=>e.clientRef.typeIndex)).toEqual(Array.from({length:16},(_,i)=>i+5));
      expect(players.every(e=>e.clientRef.bundle===0x4786c0e0&&e.authSchemaBound&&e.senseSchemaBound)).toBe(true);
      const occupied=players.filter(e=>decode(PlayerAuth,e.authBody!).key!==0n);
      expect(occupied).toHaveLength(1);
      expect(occupied[0].clientRef.typeIndex).toBe(5);
      expect(decode(PlayerAuth,occupied[0].authBody!)).toMatchObject({key,unk1:0});
    }
  });
  it('starts from captured native readiness, preserves the five-second introduction and full populations',()=>{
    const native=decodeStrikeSense(Buffer.from(captured.initial,'hex'))!;
    expect(native.rows.filter(r=>r.bundle===ACTION_BUNDLE&&r.type===1).map(r=>r.index).sort()).toEqual([1,2,3,4,5]);
    const {mission,sent,advance}=setup();expect(mission.started).toBe(true);
    advance(4999);expect(mission.currentObjective).toBeUndefined();
    advance(1);advance(2000);expect(mission.currentObjective).toBe(22);
    const entries=sent.flatMap(x=>x.entries),squad=entries.find(e=>e.clientRef.typeId===1)!;
    expect(decode(SquadAuth,squad.authBody!).roster?.slots).toEqual([5]);
    expect(squad.senseBody).toBeUndefined(); // Placement is returned by the game.
    advance(60000);expect(sent.flatMap(x=>x.entries).filter(e=>e.clientRef.typeId===1)).toHaveLength(1);
    const hud=entries.find(e=>e.clientRef.typeId===32&&e.clientRef.typeIndex===22&&
      decode(PlayerObjectiveAuth,e.authBody!).slots.slots[0].unk0===1)!;
    expect(decode(PlayerObjectiveAuth,hud.authBody!).slots.slots[0].kind13.toString('hex')).toBe('c43878e2c3bd53b64279803a');
  });
  it('requires the seven authored incidents in order, including a fresh repeated travel event',()=>{
    const {mission,sent,advance}=setup();advance(5000);advance(2000);
    mission.incident(incident(22,1,0x517641f1));mission.incident(incident(18,2));advance(60000);
    expect(mission.currentObjective).toBe(22);expect(mission.completed).toBe(false);
    fixture.orderedObjectives.forEach((index,n)=>{
      expect(mission.currentObjective).toBe(index);
      if(n===5){mission.incident(incident(22,10));expect(mission.currentObjective).toBe(22);}
      mission.incident(incident(index,10+n));expect(mission.currentObjective).toBeUndefined();
      advance(n===6?9999:1000);
    });
    expect(mission.completed).toBe(false);
    expect(sent.flatMap(x=>x.entries).some(e=>e.clientRef.typeId===16)).toBe(false);
    advance(1);expect(mission.completed).toBe(true);
    const ending=sent.at(-1)!.entries;
    expect(ending.map(e=>e.clientRef)).toEqual([
      {bundle:0x4786c0e0,typeId:16,typeIndex:3},
      {bundle:ACTION_BUNDLE,typeId:32,typeIndex:11},
    ]);
    const initial=buildTowerBinderSenseEntries(0x200000004n,'action_mock');
    const original=initial.find(e=>e.clientRef.typeId===16)!;
    expect(decode(LifetimeAuth,ending[0].authBody!)).toEqual({
      ...decode(LifetimeAuth,original.authBody!),state:6,
    });
    expect(ending[0].senseBody).toBeUndefined();
    // A replayed ready apply cannot replace completed Lifetime with state2.
    const refreshed=preserveActionMissionApply(initial,[...mission.retained.values()]);
    const lifetimes=refreshed.filter(e=>e.clientRef.typeId===16);
    expect(lifetimes).toHaveLength(1);
    expect(decode(LifetimeAuth,lifetimes[0].authBody!).state).toBe(6);
    expect(refreshed.filter(e=>e.clientRef.typeId===12)).toEqual(initial.filter(e=>e.clientRef.typeId===12));
    const count=sent.length;advance(120000);expect(sent).toHaveLength(count);
  });
  it('rejects malformed events and cancels outstanding progression on stop',()=>{
    const event=incident(22,8);expect(actionIncident(event)).toEqual({kind:'travel',id:62});
    expect(actionIncident(event.subarray(1))).toBeUndefined();
    const {mission,sent,advance}=setup();mission.stop();const n=sent.length;advance(120000);
    expect(sent).toHaveLength(n);expect(mission.completed).toBe(false);
  });
});
