import {eadPlayerIdentity} from './ead-kill-decoder';
import { describe, expect, it, vi } from 'vitest';
import { VenusStrikeEngineeringRuntime } from './venus-strike-engineering-runtime';
import { advanceVenusStrikeEngineering as advance, createVenusStrikeEngineering as create,
  STRIKE_ENGINEERING_BUNDLE as bundle, type VenusStrikeEngineeringEvent as Event } from './venus-strike-engineering';

type Payload = Event extends infer E ? E extends Event ? Omit<E,'runId'|'activityId'|'bundle'|'observedAt'> : never : never;
function harness() {
  let state=create('test'), now=1000;
  const send=(e:Payload)=>{const result=advance(state,{...e,runId:'test',activityId:4,bundle,observedAt:now},now);state=result.state;return result.effects;};
  const snapshot=(squad:number,alive:number)=>send({kind:'snapshot',squad,token:state.squads[squad].token,
    bindingLifetimeId:'test/'+squad,sequence:state.squads[squad].sequence+1,bound:true,loaded:true,
    alive,aliveCountValidated:true});
  const start=()=>{send({kind:'start'});send({kind:'arrival',sensor:74,bound:true,loaded:true});return send({kind:'dialogueResolved',sequence:22,resolution:'unavailable'});};
  const requested=(squad:number)=>send({kind:'spawnRequested',squad,token:state.squads[squad].token});
  return {send,snapshot,start,requested,get state(){return state;},get now(){return now;},set now(value:number){now=value;}};
}

describe('Engineering native request and combat boundaries',()=>{
  it('starts authored spacing on transmission without fabricating materialization',()=>{
    const h=harness();h.start();
    expect(h.state.squads[2].observed).toBe(false);
    expect(h.requested(2)).toEqual([expect.objectContaining({kind:'authoredDelay',minMs:3000,maxMs:6000})]);
    expect(h.state.squads[2].alive).toBeUndefined();
    const delay=h.state.pending!;h.now+=2999;
    expect(h.send({kind:'delayElapsed',token:delay.token})).toEqual([]);
    h.now++;expect(h.send({kind:'delayElapsed',token:delay.token})).toEqual([expect.objectContaining({kind:'respawn',squad:3})]);
  });
  it('retains validated unchanged counts and rejects initial zero',()=>{
    const h=harness();h.start();h.requested(2);
    expect(h.snapshot(2,0)).toEqual([]);h.snapshot(2,6);
    const delay=h.state.pending!;h.now+=6000;h.send({kind:'delayElapsed',token:delay.token});h.requested(3);h.snapshot(3,6);
    h.now+=60000;h.snapshot(2,1);
    expect(h.state.squads[10]).toBeUndefined();
    expect(h.snapshot(3,2)).toEqual([expect.objectContaining({kind:'respawn',squad:10})]);
    expect(h.state.defeated).toEqual([]);
  });
  it('cancelled runtime cannot emit its scheduled second squad',()=>{
    vi.useFakeTimers();
    try {
      const effects:any[]=[];
      const runtime=new VenusStrikeEngineeringRuntime('cancel',effect=>effects.push(effect),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
      runtime.start();runtime.stop();vi.advanceTimersByTime(10000);
      expect(effects.filter(e=>e.kind==='respawn').map(e=>e.squad)).toEqual([2]);
    } finally {vi.useRealTimers();}
  });
  it('runtime spaces the second squad without inventing kill credit',()=>{
    vi.useFakeTimers();
    try {
      const effects:any[]=[];
      const runtime=new VenusStrikeEngineeringRuntime('spacing',effect=>effects.push(effect),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
      runtime.start();vi.advanceTimersByTime(2999);
      expect(runtime.allocatedSquads).toEqual([2]);
      vi.advanceTimersByTime(3001);
      expect(runtime.allocatedSquads).toEqual([2,3]);
      expect(runtime.servitorKills).toBe(0);
      expect(effects.filter(e=>e.kind==='progress').every(e=>e.current===0)).toBe(true);
      runtime.stop();
    } finally {vi.useRealTimers();}
  });
});

