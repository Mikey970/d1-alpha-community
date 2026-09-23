import { BitReader } from '@blamnetwork/rsat';
import { describe, expect, it } from 'vitest';
import { buildVenusDeviceCompletionEntries } from './rsat/mocks/sensor-auth';

describe('mission transfer-gate activation', () => {
  it('uses the native actor creation prefix without a squad allocation or sense override', () => {
    const entries = buildVenusDeviceCompletionEntries();
    expect(entries.filter(e => e.clientRef.typeId === 1)).toHaveLength(0);
    const gates = entries.filter(e => e.clientRef.typeId === 2);
    expect(gates.map(e => e.clientRef)).toEqual([70,72,74,76].map(typeIndex =>
      ({bundle:0x517641f1, typeId:2, typeIndex})));
    for (const gate of gates) {
      expect(gate.authBits).toBe(42);
      const reader = new BitReader(gate.authBody!);
      expect([reader.read(1), reader.read(31), reader.read(2), reader.read(3), reader.read(1), reader.read(4)])
        .toEqual([1n,1n,1n,1n,1n,0n]);
    }
  });
});
