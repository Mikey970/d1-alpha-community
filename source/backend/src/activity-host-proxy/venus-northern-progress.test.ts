import { describe, expect, it } from 'vitest';
import { VenusNorthernProgress, readVenusNorthernSense } from './venus-northern-progress';
import packets from './r409-gatekeeper-fight.fixture.json';
import { buildVenusNorthernGateEntries } from './rsat/mocks/sensor-auth';

describe('captured Gatekeeper death progression', () => {
  it('does not credit an out-of-order boss before the two authored gates', () => {
    const progress = new VenusNorthernProgress();
    let changes = 0;
    for (const packet of packets) changes += Number(progress.observe(Buffer.from(packet.hex,'hex')));
    expect(changes).toBe(0);
    expect(progress.bossDefeated).toBe(false);
    expect(progress.complete).toBe(false);
    for (const packet of packets) expect(progress.observe(Buffer.from(packet.hex,'hex'))).toBe(false);
  });
  it('does not credit a terminal packet without a previously live encounter', () => {
    const dead = packets.find(p => p.line === 889)!;
    expect(readVenusNorthernSense(Buffer.from(dead.hex,'hex'))).toMatchObject({
      actors:[{index:81,terminal:true,sequence:16}],squads:[{index:80,live:0,sequence:11}],
    });
    const progress = new VenusNorthernProgress();
    expect(progress.observe(Buffer.from(dead.hex,'hex'))).toBe(false);
    expect(progress.bossDefeated).toBe(false);
  });
  it('uses the two authored utility gates and never reactivates a defeated gate', () => {
    expect(buildVenusNorthernGateEntries().filter(e => e.clientRef.typeId===2).map(e => e.clientRef.typeIndex)).toEqual([129,131]);
    expect(buildVenusNorthernGateEntries([129]).filter(e => e.clientRef.typeId===2).map(e => e.clientRef.typeIndex)).toEqual([131]);
    expect(buildVenusNorthernGateEntries([129,131]).filter(e => e.clientRef.typeId===2)).toEqual([]);
  });
});
