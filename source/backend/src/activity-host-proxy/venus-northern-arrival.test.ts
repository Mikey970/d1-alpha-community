import { describe, expect, it } from 'vitest';
import { BitReader } from '@blamnetwork/rsat';
import { buildVenusNorthernArrivalEntries, buildVenusNorthernBindingEntries } from './rsat/mocks/sensor-auth';
import { PlayerObjectiveAuth } from './rsat/schemas/sensor';

describe('Northern arrival protocol', () => {
  it('retires the parent and boss prompt and supplies the authored pre-boss gates', () => {
    const entries = buildVenusNorthernArrivalEntries().filter(e => e.clientRef.typeId === 32);
    expect(entries.map(e => e.clientRef.typeIndex)).toEqual([112, 120, 123]);
    const states = entries.map(e => PlayerObjectiveAuth.decode(new BitReader(e.authBody!)));
    expect(states.map(s => s.unk0)).toEqual([0, 0, 1]);
    expect(states[2].slots.slots[0].ref).toEqual({bundle: 0x517641f1, typeId: 2, typeIndex: 129});
    expect(entries.every(e => e.clientRef.typeId === 32)).toBe(true);
  });
  it('binds every native Northern squad without duplicate identities', () => {
    const entries = buildVenusNorthernBindingEntries();
    expect(entries.filter(e => e.clientRef.typeId === 1)).toHaveLength(44);
    expect(new Set(entries.map(e => JSON.stringify(e.clientRef))).size).toBe(entries.length);
  });
});
