import {expect,it} from 'vitest';
import {BitReader,BitWriter} from '@blamnetwork/rsat';
import {HealthAuth,SensorClientRef} from './rsat/schemas/sensor';
import {buildVenusGatekeeperHealthBinding} from './rsat/mocks/sensor-auth';
import {readVenusNorthernSense} from './venus-northern-progress';
import packets from './r409-gatekeeper-fight.fixture.json';

// Synthetic Health80800624 prefix followed by the unmodified captured r409
// actor/squad entry bits. This checks framing, not live health semantics.
function coalesced(value=0x3f000000){
  const w=new BitWriter(2048);w.write(0,2);w.writeBit(1);
  SensorClientRef.encode(w,{bundle:0x517641f1,typeId:19,typeIndex:152});w.writeBit(1);
  w.write(value,32);w.write(0x3f800000,32);w.write(0x80000000,32);w.write(7,32);
  const raw=Buffer.from(packets.find(p=>p.line===889)!.hex,'hex');
  const rows=readVenusNorthernSense(raw)!;expect(rows.actors[0].terminal).toBe(true);
  // Both headers have optional fields; copy all bits and retain original zero
  // padding only until a byte boundary for the newly shifted packet.
  let bits=[...raw].map(b=>b.toString(2).padStart(8,'0')).join('').slice(2);
  // In this captured packet the outer squad sequence is 11, ending in a one;
  // the next zero is the list terminator; remaining zeros are byte padding.
  bits=bits.slice(0,bits.lastIndexOf('1')+2);
  for(const b of bits)w.writeBit(Number(b));
  return w.finish();
}
it('consumes leading Health152 without losing real boss death records',()=>{
  const update=readVenusNorthernSense(coalesced());
  expect(update?.health).toEqual([{index:152,value0:0.5,value1:1,revision:0,sequence:7}]);
  expect(update?.actors).toMatchObject([{index:81,terminal:true,sequence:16}]);
  expect(update?.squads).toMatchObject([{index:80,live:0,sequence:11}]);
  expect(readVenusNorthernSense(coalesced(0x7fc00000))).toBeUndefined();
});
it('binds the boss for observation without changing health-write counters or initializer floats',()=>{
  const entry=buildVenusGatekeeperHealthBinding();
  expect(HealthAuth.decode(new BitReader(entry.authBody!))).toEqual({
    ref:{bundle:0x517641f1,typeId:2,typeIndex:81},unk1:-1,unk2:-1,unk3:0});
  expect(entry.senseBody).toBeUndefined();
});
