import { BitReader } from '@blamnetwork/rsat';
import { expect, it } from 'vitest';
import { buildCalderaInitialBindingEntries, buildTowerApplySenseEntries, senseEntryPayloadBits } from './rsat/mocks/sensor-auth';
import { PlayerTriggerAuth } from './rsat/schemas/sensor';

it('initializes all forty live pending Caldera refs without activating events', () => {
  const base = buildTowerApplySenseEntries(0x200000002n, 9, 'venus_chapter_2');
  const extra = buildCalderaInitialBindingEntries();
  const key = (e: typeof extra[number]) => `${e.clientRef.bundle}/${e.clientRef.typeId}/${e.clientRef.typeIndex}`;
  const existing = new Set(base.map(key));
  expect(extra).toHaveLength(40);
  expect(extra.every(e => !existing.has(key(e)))).toBe(true);
  const supported = new Set([1,2,3,4,24,28,29]);
  const caldera = [...base,...extra].filter(e => e.clientRef.bundle===0xb63afda3 && supported.has(e.clientRef.typeId));
  // Native client census:68 squads,67 actors,22 objectives,56 objects,
  // 10 Unknown24,4 monitors,6 triggers. Spatial-only40/55/57 are excluded.
  expect(new Set(caldera.map(key)).size).toBe(233);
  for (const e of extra) {
    expect(e.nativeBodyFraming).toBe(e.clientRef.typeId!==24);
    expect(e.fullAuthState).toBe(true);
    // Native 8376EC30/8376ED70: relative Auth cannot clear initial-pending.
    expect(senseEntryPayloadBits(e).slice(0,2)).toEqual(e.clientRef.typeId===24 ? [1,0] : [1,1]);
    expect(e.senseBody).toBeUndefined();
    if (e.clientRef.typeId===29) {
      expect(PlayerTriggerAuth.decode(new BitReader(e.authBody!)).flag).toBe(false);
    } else if (e.clientRef.typeId===24) {
      expect(e.authBody).toBeUndefined();
      expect(e.senseSchemaBound).toBe(true);
    }
  }
  expect(extra.filter(e => e.clientRef.typeId===5).map(e => e.clientRef.typeIndex))
    .toEqual([41,42,43,44,45,46,47,48,49,50,51,52,163,164,165,166,167,169,170,171,172,173]);
  expect(extra.filter(e => e.clientRef.typeId===32).map(e => e.clientRef.typeIndex)).toEqual([40,168]);
});
