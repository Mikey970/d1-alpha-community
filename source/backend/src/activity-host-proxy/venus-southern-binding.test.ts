import { describe, expect, it } from 'vitest';
import { buildVenusSouthernBindingEntries, buildVenusFluidCompletionEntries, buildVenusSouthernInteractionEntries, encodeObjectAuth } from './rsat/mocks/sensor-auth';
import { BitReader } from '@blamnetwork/rsat';
import { SquadAuth } from './rsat/schemas/sensor';

describe('Southern bindings from packaged owner23 resources', () => {
  it('sends a native tagged enable command without crediting device activation', () => {
    const entry = buildVenusSouthernInteractionEntries().find(row => row.clientRef.typeId === 4)!;
    expect(entry.clientRef).toEqual({bundle:0x0a6d9003,typeId:4,typeIndex:8});
    expect(entry.authBits).toBe(213);
    const bits = [...entry.authBody!].map(byte => byte.toString(2).padStart(8, '0')).join('');
    const field = (offset:number, length:number) => Number.parseInt(bits.slice(offset,offset+length),2);
    // Offsets derived from native808005EF/8080053D/80800034/80802DA2 descriptors.
    expect(field(0,32)).toBe(0x80000001);
    expect(field(32,1)).toBe(1);
    expect(field(87,4)).toBe(1);
    expect(field(91,1)).toBe(1);
    expect(field(92,32)).toBe(0x80802da2);
    expect(field(124,2)).toBe(3);
    expect(field(126,32)).toBe(0x811c9dc5);
    expect(field(158,6)).toBe(0);
    expect(field(164,16)).toBe(0x7fff);
    expect(field(180,32)).toBe(0x80000000);
    expect(field(212,1)).toBe(0);
    expect(encodeObjectAuth().bitCount).toBe(91);
  });
  it('initializes the exact native member counts with zero enemy allocations', () => {
    const entries = buildVenusSouthernBindingEntries();
    const squads = entries.filter(entry => entry.clientRef.typeId === 1);
    expect(squads).toHaveLength(57);
    let doubleMembers = 0;
    for (const entry of squads) {
      const auth = SquadAuth.decode(new BitReader(entry.authBody!));
      expect(auth.roster.slots.every(slot => slot === 0)).toBe(true);
      if (auth.roster.slots.length === 2) doubleMembers++;
    }
    expect(doubleMembers).toBe(17);
    expect(new Set(entries.map(entry => JSON.stringify(entry.clientRef))).size).toBe(entries.length);
  });
  it('moves the actual collection objective to authored phase02 and disables quest drops', () => {
    expect(buildVenusFluidCompletionEntries().map(entry => entry.clientRef))
      .toEqual([{bundle:0x517641f1,typeId:32,typeIndex:14},
        {bundle:0x517641f1,typeId:32,typeIndex:64},
        {bundle:0x517641f1,typeId:35,typeIndex:17}]);
  });
});
