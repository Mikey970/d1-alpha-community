import { describe, expect, it } from 'vitest';
import { BitWriter } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';
import { VenusGateProgress, readVenusGateSense } from './venus-gate-progress';
import { VenusNorthernProgress, readVenusNorthernSense } from './venus-northern-progress';

// Synthetic transport variants of the decoded native Actor/Squad shapes.
// These test independent sensor delivery, not visible gameplay acceptance.
function actor(index: number, sequence: number, terminal = false, generation: number | undefined = 1, bound = true) {
  const w = new BitWriter(512); w.write(0, 2); w.writeBit(1);
  SensorClientRef.encode(w, {bundle: 0x517641f1, typeId: 2, typeIndex: index}); w.writeBit(1);
  w.writeBit(generation === undefined ? 0 : 1);
  if (generation !== undefined) w.write(generation, 31);
  w.write(0, 4); // scalar, revision, script, dropSequence absent
  w.write(1, 2); w.writeBit(0); // idle dropping, dropRevision absent
  w.writeBit(terminal ? 1 : 0); w.writeBit(bound ? 1 : 0); w.write(sequence, 32);
  w.writeBit(0); return w.finish();
}
function squad(index: number, sequence: number, live: number | undefined, valid = true) {
  const w = new BitWriter(512); w.write(0, 2); w.writeBit(1);
  SensorClientRef.encode(w, {bundle: 0x517641f1, typeId: 1, typeIndex: index}); w.writeBit(1);
  w.write(0, 4); w.writeBit(live === undefined ? 0 : 1);
  if (live !== undefined) w.write(live, 6);
  w.write(0, 3); w.writeBit(valid ? 1 : 0); w.write(0, 3);
  w.write(sequence, 32); w.writeBit(0); return w.finish();
}

describe('independent gate and boss sensor streams', () => {
  it('encodes the native fields and independent sequences', () => {
    expect(readVenusGateSense(actor(70, 20))).toMatchObject({actors: [{index: 70, generation: 1, terminal: false, bound: true, sequence: 20}]});
    expect(readVenusNorthernSense(squad(128, 3, 0))).toMatchObject({squads: [{index: 128, live: 0, valid: true, sequence: 3}]});
  });
  it.each([false, true])('counts a Southern gate with split death receipts, squad first=%s', squadFirst => {
    const p = new VenusGateProgress(); p.observe(actor(70, 20));
    const receipts = [actor(70, 21, true), squad(69, 3, 0)];
    if (squadFirst) receipts.reverse();
    expect(p.observe(receipts[0])).toBe(false);
    expect(p.observe(receipts[1])).toBe(true);
    for (const receipt of receipts) expect(p.observe(receipt)).toBe(false);
    expect(p.defeatedActors).toEqual([70]);
  });
  it('does not combine stale zero, invalidated or different-life evidence', () => {
    const p = new VenusGateProgress();
    p.observe(squad(69, 1, 0)); p.observe(actor(70, 1));
    expect(p.observe(actor(70, 2, true))).toBe(false);
    p.observe(squad(69, 3, 1));
    expect(p.observe(squad(69, 2, 0))).toBe(false);
    expect(p.observe(squad(69, 4, undefined))).toBe(false);
    p.observe(actor(70, 3, false, 2)); // invalid generation retires this life
    expect(p.observe(squad(69, 5, 0))).toBe(false);
    expect(p.observe(actor(70, 2, true))).toBe(false);
    p.observe(actor(70, 4));
    expect(p.observe(actor(70, 5, true))).toBe(false);
    expect(p.observe(squad(69, 6, 0))).toBe(true);
  });
  it.each([false, true])('requires live Northern squads and gates before fresh boss receipts, squad first=%s', squadFirst => {
    const p = new VenusNorthernProgress();
    const defeat = (index: number, seq: number) => {
      p.observe(actor(index, seq)); p.observe(squad(index - 1, seq, 1));
      const receipts = [actor(index, seq + 1, true), squad(index - 1, seq + 1, 0)];
      if (squadFirst) receipts.reverse();
      expect(p.observe(receipts[0])).toBe(false);
      return p.observe(receipts[1]);
    };
    expect(defeat(81, 10)).toBe(false);
    expect(defeat(129, 20)).toBe(true);
    expect(defeat(131, 20)).toBe(true);
    expect(p.complete).toBe(false);
    // Replaying the entire premature boss encounter cannot earn progress.
    expect(defeat(81, 10)).toBe(false);
    expect(defeat(81, 30)).toBe(true);
    expect(p.complete).toBe(true);
  });
  it('rejects stale live baselines and invalidated squad or actor evidence', () => {
    const p = new VenusGateProgress();
    p.observe(actor(70, 5, true)); p.observe(actor(70, 4));
    expect(p.observe(squad(69, 1, 0))).toBe(false);
    p.observe(actor(70, 6)); p.observe(squad(69, 2, 0));
    p.observe(squad(69, 3, undefined, false));
    expect(p.observe(actor(70, 7, true))).toBe(false);
    expect(p.observe(squad(69, 4, undefined))).toBe(false);
    p.observe(actor(70, 8, true, undefined, false));
    expect(p.observe(squad(69, 5, 0))).toBe(false);
    expect(p.observe(actor(70, 7, true))).toBe(false);
    expect(p.count).toBe(0);
  });
  it('clears pending Northern evidence on unload but preserves confirmed gates', () => {
    const p = new VenusNorthernProgress();
    for (const index of [129, 131]) {
      p.observe(actor(index, 1)); p.observe(squad(index - 1, 1, 1));
      p.observe(actor(index, 2, true));
    }
    expect(p.observe(squad(128, 2, 0))).toBe(true);
    p.resetObservations();
    expect(p.observe(squad(130, 2, 0))).toBe(false);
    expect(p.observe(actor(131, 2, true))).toBe(false);
    expect(p.defeatedGates).toEqual([129]);
  });
});
