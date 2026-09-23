import { decode } from '@blamnetwork/rsat';
import { describe, expect, it } from 'vitest';
import { ActivityBundleItemType } from '../../../tags/types';
import { SquadAuth, SquadSense, PlayerObjectiveAuth } from '../schemas/sensor';
import { buildVenusStrikeEngineeringSquadEntry as engineering,
  buildVenusStrikeFirstWaveSquadEntry as first, buildVenusStrikeCombatObjective as objective,
  encodeSquadAuth, encodeSquadSense } from './sensor-auth';

describe('native Engineering squad encoder', () => {
  it('preserves both proven first-pair packet bodies and framing', () => {
    for (const squad of [2,3] as const) {
      const e=first(squad), a=encodeSquadAuth(2,[3,3],{group:{bundle:0x0a302429,
        typeId:ActivityBundleItemType.SquadGroup,typeIndex:165}}), s=encodeSquadSense(2,true,[3,3]);
      expect(e.authBody).toEqual(a.bytes);expect(e.authBits).toBe(a.bitCount);
      expect(e.senseBody).toEqual(s.bytes);expect(e.senseBits).toBe(s.bitCount);
      expect(e).toMatchObject({nativeBodyFraming:true,isSenseUpdateRelative:false,senseStateSequence:0});
      expect(engineering(squad)).toEqual(e);
    }
    expect(()=>first(4 as 2)).toThrow();
  });
  it('uses native direct groups and exact template category vectors for every Engineering squad', () => {
    const rows:readonly [number,number,readonly number[]][] = [
      [4,166,[2,2,2]],[5,166,[2,0,0,4]],[6,171,[2,0,0,2]],
      [7,167,[3,0,0,3]],[8,167,[3,0,3]],[9,172,[1,3]],
      [10,168,[0,2,4]],[11,168,[3,3]],[12,173,[3,1]],
      [13,170,[1]],[14,170,[1]],[15,171,[1]],[16,171,[1]],
      [17,172,[1]],[18,172,[1]],[19,173,[1]],[20,173,[1]],
    ];
    for (const [squad,group,population] of rows) {
      const e=engineering(squad), a=decode(SquadAuth,e.authBody!), s=decode(SquadSense,e.senseBody!);
      expect(a.ref0).toEqual({bundle:0x0a302429,typeId:ActivityBundleItemType.SquadGroup,typeIndex:group});
      expect(a.ref1).toBeUndefined();expect(a.roster?.slots).toEqual(population);
      expect(s.roster?.slots).toEqual(population);expect(s.valid).toBe(true);
    }
  });
  it('sends cumulative Auth allocations without resetting the native Sense/death state', () => {
    const e=engineering(5,[4,0,0,8]);
    expect(decode(SquadAuth,e.authBody!).roster?.slots).toEqual([4,0,0,8]);
    expect(decode(SquadAuth,e.authBody!).ref0?.typeIndex).toBe(166);
    expect(e.senseBody).toBeUndefined();expect(e.senseStateSequence).toBeUndefined();
    expect(e.isSenseUpdateRelative).toBe(true);expect(e.nativeBodyFraming).toBe(true);
    expect(engineering(2,[3,3]).senseBody).toBeUndefined();
    for (const squad of [0,1,21,2.5]) expect(()=>engineering(squad)).toThrow();
    for (const p of [[2,0,4],[2,1,0,4],[1,0,0,4],[2,0,0,-1],[2,0,0,4.5],
      [2,0,0,Number.NaN],[2,0,0,0x80000000]]) expect(()=>engineering(5,p)).toThrow();
  });
  it('preserves verified HUD credit and references native Nav153 with its exact packaged coordinates', () => {
    const active=decode(PlayerObjectiveAuth,objective(27,1,3).authBody!);
    expect([active.unk0,active.unk5,active.unk6]).toEqual([1,3,4]);
    expect(active.slots.slots[0]).toMatchObject({unk0:1,
      ref:{bundle:0x0a302429,typeId:ActivityBundleItemType.NavPoint,typeIndex:153},kind13:Buffer.from('c36325ffc39912ad4225fbba','hex')});
    expect(decode(PlayerObjectiveAuth,objective(27,0,4).authBody!).slots.slots[0].unk0).toBe(0);
    expect(decode(PlayerObjectiveAuth,objective(24,0).authBody!).unk0).toBe(0);
    for(const n of [-1,5,0.5])expect(()=>objective(27,1,n)).toThrow();
    expect(()=>objective(24,1,1)).toThrow();
  });
});

