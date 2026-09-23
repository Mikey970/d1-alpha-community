import {expect,it} from 'vitest';
import {BitReader} from '@blamnetwork/rsat';
import {PlayerObjectiveAuth,SquadAuth} from './rsat/schemas/sensor';
import {buildVenusPlayerObjectiveEntry,buildVenusEngineeringAmbientEntries,buildVenusTransitAmbientEntries} from './rsat/mocks/sensor-auth';
it('points the opening HUD to the native Captain position and removes the marker when inactive',()=>{
 const active=PlayerObjectiveAuth.decode(new BitReader(buildVenusPlayerObjectiveEntry(7,1).authBody!));
 expect(active.slots.slots[0].ref).toMatchObject({bundle:0x44fb7aa2,typeId:2,typeIndex:2});
 expect(active.slots.slots[0].unk0).toBe(1);
 expect(Buffer.from(active.slots.slots[0].kind13).toString('hex')).toBe('c3fc8018c38d70ee41c650fc');
 const idle=PlayerObjectiveAuth.decode(new BitReader(buildVenusPlayerObjectiveEntry(7,0).authBody!));
 expect(idle.slots.slots.every(s=>s.unk0===0)).toBe(true);
});
it('restores only the eight native shared Engineering populations with two slots',()=>{
 const entries=buildVenusEngineeringAmbientEntries();expect(entries).toHaveLength(13);
 expect(entries.every(e=>e.clientRef.bundle===0x022112bb && e.nativeBodyFraming && e.senseStateSequence===0)).toBe(true);
 expect(entries.filter(e=>e.clientRef.typeId===1).map(e=>SquadAuth.decode(new BitReader(e.authBody!)).roster.slots))
 .toEqual([[3,1],[3,1],[3,2],[3,1],[3,1],[5,1],[3,1],[3,1]]);
});

it('provides nonzero destination markers through every active travel and combat objective',()=>{
 for(const index of [7,14,18,57,60,64,112,120,123] as const){
  const active=PlayerObjectiveAuth.decode(new BitReader(buildVenusPlayerObjectiveEntry(index,1).authBody!));
  expect(active.slots.slots.some(s=>s.unk0===1)).toBe(true);
  const idle=PlayerObjectiveAuth.decode(new BitReader(buildVenusPlayerObjectiveEntry(index,0).authBody!));
  expect(idle.slots.slots.every(s=>s.unk0===0)).toBe(true);
 }
});
it('uses captured Shattered Coast template lengths and authored populations',()=>{
 const entries=buildVenusTransitAmbientEntries();
 expect(entries.every(e=>e.fullAuthState===true)).toBe(true);
 expect(entries.filter(e=>e.clientRef.typeId===3).map(e=>e.clientRef.typeIndex)).toEqual([14,16,18]);
 expect(entries.filter(e=>e.clientRef.typeId===1).map(e=>SquadAuth.decode(new BitReader(e.authBody!)).roster.slots))
 .toEqual([[2,3],[3,2],[3,2]]);
});
