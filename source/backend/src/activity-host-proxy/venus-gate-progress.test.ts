import { describe, expect, it } from 'vitest';
import { BitReader } from '@blamnetwork/rsat';
import { readVenusGateSense, VenusGateProgress } from './venus-gate-progress';
import { buildVenusGateProgressEntries } from './rsat/mocks/sensor-auth';
import { PlayerObjectiveAuth } from './rsat/schemas/sensor';

// Unmodified r401 server.stdout.log lines2047/2237. One real gate was shot.
const live = Buffer.from('2a2ec83e21c0266000000041200000005517641f10a012e10464400000002a8bb20f8870095800000010480000001545d907c438048c00000008240000000aa2ec83e214023c208c2800000005517641f10e011b000000020900000002a8bb20f885008b0823020000000100', 'hex');
const dead = Buffer.from('2a2ec83e21c02340b00000003a8bb20f885008b0803fe000000018', 'hex');

// Synthetic index variants test four distinct identities; not runtime proof.
function deathFor(actor: number) {
  const bits = [...dead].map(b => b.toString(2).padStart(8, '0')).join('').split('');
  const write = (at: number, width: number, value: number) => bits.splice(at, width, ...value.toString(2).padStart(width, '0'));
  write(41, 16, actor + 0x8000);
  // second client-ref starts after the first 92-bit entry plus framing
  const ref = (0x517641f1).toString(2).padStart(32, '0');
  const secondBundle = bits.join('').indexOf(ref, 36);
  if (secondBundle < 0) throw new Error('fixture ref missing');
  write(secondBundle + 38, 16, actor - 1 + 0x8000);
  return Buffer.from(bits.join('').match(/.{8}/g)!.map(b => parseInt(b, 2)));
}

describe('real transfer-gate progression', () => {
  it('decodes all four live actors and the paired terminal packet', () => {
    expect(readVenusGateSense(live)?.actors.map(a => a.index).sort()).toEqual([70,72,74,76]);
    expect(readVenusGateSense(dead)).toMatchObject({
      actors: [{index:70, terminal:true, bound:true, sequence:3}],
      squads: [{index:69, live:0, valid:true, sequence:3}],
    });
  });
  it('counts the actual kill once, with no full-mission completion', () => {
    const progress = new VenusGateProgress();
    expect(progress.observe(live)).toBe(false);
    expect(progress.observe(dead)).toBe(true);
    expect(progress.observe(dead)).toBe(false);
    expect(progress.count).toBe(1);
    expect(progress.complete).toBe(false);
  });
  it('rejects terminal state without a fresh live observation or after unloading', () => {
    const progress = new VenusGateProgress();
    expect(progress.observe(dead)).toBe(false);
    progress.observe(live); progress.resetObservations();
    expect(progress.observe(dead)).toBe(false);
    expect(progress.count).toBe(0);
  });
  it('rejects truncated, foreign, trailing and unpaired data', () => {
    const foreign = Buffer.from(dead); foreign[1] ^= 1;
    for (const packet of [dead.subarray(0,-1), foreign, Buffer.concat([dead, Buffer.from([1])])]) {
      expect(readVenusGateSense(packet)).toBeUndefined();
      const progress = new VenusGateProgress(); progress.observe(live);
      expect(progress.observe(packet)).toBe(false);
    }
  });
  it('requires all four distinct gate deaths and retains confirmed count across observation resets', () => {
    const progress = new VenusGateProgress(); progress.observe(live);
    for (const actor of [70,72,74]) expect(progress.observe(deathFor(actor))).toBe(true);
    expect(progress.complete).toBe(false);
    progress.resetObservations();
    expect(progress.observe(deathFor(76))).toBe(false);
    // A fresh area binding resets sequence space. Within one binding, the
    // older live baseline must not override the newer terminal observation.
    progress.resetObservations();
    progress.observe(live);
    expect(progress.observe(deathFor(76))).toBe(true);
    expect(progress.complete).toBe(true);
    expect(progress.count).toBe(4);
  });
  it('uses a four-gate HUD target and the authored next objective only at four', () => {
    const partial = buildVenusGateProgressEntries(1);
    expect(partial.map(e => e.clientRef.typeIndex)).toEqual([60]);
    const body = PlayerObjectiveAuth.decode(new BitReader(partial[0].authBody!));
    expect(body).toMatchObject({unk0:1,unk4:1,unk5:1,unk6:4});
    expect(buildVenusGateProgressEntries(4).map(e => e.clientRef.typeIndex)).toEqual([60,112]);
    expect(() => buildVenusGateProgressEntries(5)).toThrow();
  });
  it('removes the defeated identity marker when gates are killed out of order', () => {
    const progress = new VenusGateProgress(); progress.observe(live);
    progress.observe(deathFor(74));
    const entry = buildVenusGateProgressEntries(progress.count, progress.defeatedActors)[0];
    const body = PlayerObjectiveAuth.decode(new BitReader(entry.authBody!));
    const markers = body.slots.slots.filter(slot => slot.unk0 !== 0);
    expect(markers.map(slot => slot.ref.typeIndex)).toEqual([70,72,76]);
    expect(markers.every(slot => slot.ref.typeId === 2 && slot.ref.bundle === 0x517641f1)).toBe(true);
    // Packaged gate00 position, not the Guardian or the device marker.
    expect(markers[0].kind13.readFloatBE(0)).toBeCloseTo(458.699371, 4);
    expect(body.unk5).toBe(1);
  });
});
