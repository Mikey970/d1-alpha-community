import { describe, expect, it } from 'vitest';
import pickups from './venus-fluid-pickups.fixture.json';
import { decodeVenusFluidPickup, VenusFluidProgress } from './venus-fluid-progress';
import { buildVenusFluidProgressEntry } from './rsat/mocks/sensor-auth';
import { BitReader } from '@blamnetwork/rsat';
import { PlayerObjectiveAuth } from './rsat/schemas/sensor';

describe('native Venus fluid collection', () => {
  it('credits nine captured pickups once, without treating nine as complete', () => {
    const progress = new VenusFluidProgress();
    for (const hex of pickups) {
      expect(progress.accept(Buffer.from(hex, 'hex'))).toBe(true);
      expect(progress.accept(Buffer.from(hex, 'hex'))).toBe(false);
    }
    expect(progress.count).toBe(9);
    expect(progress.complete).toBe(false);
  });

  it('rejects unrelated, malformed and truncated native incidents', () => {
    const original = Buffer.from(pickups[0], 'hex');
    expect(decodeVenusFluidPickup(original.subarray(1))).toBeUndefined();
    for (const [byte, mask] of [[0, 0x20], [1, 1], [55, 1], [72, 1]]) {
      const wrong = Buffer.from(original);
      wrong[byte] ^= mask;
      expect(decodeVenusFluidPickup(wrong)).toBeUndefined();
    }
    expect(new VenusFluidProgress().count).toBe(0);
  });

  it('caps the authored requirement even if additional distinct incidents arrive', () => {
    const progress = new VenusFluidProgress();
    for (let i = 0; i < 12; i++) {
      const fixture = Buffer.from(pickups[0], 'hex');
      fixture[7] = i; // Synthetic event-context variations for this unit test only.
      expect(progress.accept(fixture)).toBe(i < 10);
    }
    expect(progress.count).toBe(10);
    expect(progress.complete).toBe(true);
  });

  it('rejects invalid display counts', () => {
    for (const n of [-1, 11, NaN, 1.5]) expect(() => buildVenusFluidProgressEntry(n)).toThrow();
    expect(buildVenusFluidProgressEntry(9).clientRef.typeIndex).toBe(14);
  });

  it('sends native active state and integer progress in the HUD fields', () => {
    const entry = buildVenusFluidProgressEntry(9);
    const auth = PlayerObjectiveAuth.decode(new BitReader(entry.authBody!));
    expect([auth.unk0, auth.unk4, auth.unk5, auth.unk6]).toEqual([1, 1, 9, 10]);
  });
});
