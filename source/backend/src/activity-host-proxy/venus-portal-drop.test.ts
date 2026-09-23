import { BitReader } from '@blamnetwork/rsat';
import { expect, it } from 'vitest';
import { SensorClientRef, SquadAuth } from './rsat/schemas/sensor';
import { buildVenusPortalOpeningDrop, encodeVenusPortalDrop } from './rsat/mocks/sensor-auth';

it('encodes the native counted squad-ref vector and independent drop sequence', () => {
  const encoded=encodeVenusPortalDrop(104,1);
  const br=new BitReader(encoded.bytes);
  expect(br.readBit()).toBe(0);
  expect(br.readNumber(2)).toBe(1);
  expect(br.readNumber(3)).toBe(1);
  expect(br.readBit()).toBe(1);
  expect(br.readNumber(3)).toBe(0);
  expect(br.readBit()).toBe(1);
  expect(br.readNumber(4)).toBe(1);
  expect(SensorClientRef.decode(br)).toEqual({bundle:0x517641f1,typeId:1,typeIndex:104});
  expect(br.readNumber(31)).toBe(1);
  expect(br.bitPos).toBe(encoded.bitCount);
  expect(encoded.bitCount).toBe(100);
});

it('allocates only authored opening populations, with no fabricated placement sense', () => {
  for(const [gate,squad,population] of [[129,104,[2,1]],[131,108,[2]]] as const){
    const entries=buildVenusPortalOpeningDrop(gate);
    const spawn=entries.find(e=>e.clientRef.typeId===1)!;
    expect(spawn.clientRef.typeIndex).toBe(squad);
    expect(SquadAuth.decode(new BitReader(spawn.authBody!)).roster.slots).toEqual(population);
    expect(spawn.senseBody).toBeUndefined();
    expect(entries.filter(e=>e.clientRef.typeId===2).map(e=>e.clientRef.typeIndex)).toEqual([gate]);
  }
  expect(()=>encodeVenusPortalDrop(81,1)).toThrow();
});
