import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readVenusGateSense, VenusGateProgress } from './venus-gate-progress';

// Exact r404 server.stdout.log packets; the native gate terminal was missed
// because its live observation shared a packet with newly activated enemies.
const capture = JSON.parse(readFileSync(new URL('./venus-gate-r404.fixture.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const packet = (line: number) => Buffer.from(capture[line], 'hex');

describe('gate progression alongside Southern enemies', () => {
  it('reads the entire mixed live packet and counts the captured kill once', () => {
    expect(readVenusGateSense(packet(2044))?.actors.map(row => row.index).sort()).toEqual([70,72,74,76]);
    const progress = new VenusGateProgress();
    expect(progress.observe(packet(2044))).toBe(false);
    expect(progress.observe(packet(2049))).toBe(false);
    expect(progress.observe(packet(2051))).toBe(false);
    expect(progress.observe(packet(2152))).toBe(true);
    expect(progress.observe(packet(2152))).toBe(false);
    expect(progress.defeatedActors).toEqual([70]);
    expect(progress.complete).toBe(false);
  });
  it('does not count enemy records or accept a truncated mixed live packet', () => {
    const enemies=readVenusGateSense(packet(2049))!;
    expect(enemies.actors).toEqual([]);
    expect(enemies.monitors).toEqual([]);
    expect(enemies.squads.map(s=>[s.index,s.live,s.valid])).toEqual([[45,1,true],[44,1,true],[43,1,true],[41,1,true]]);
    expect(readVenusGateSense(packet(2044).subarray(0,-1))).toBeUndefined();
    const progress = new VenusGateProgress();
    expect(progress.observe(packet(2049))).toBe(false);
    expect(progress.count).toBe(0);
    progress.observe(packet(2044).subarray(0,-1));
    expect(progress.observe(packet(2152))).toBe(false);
    expect(progress.count).toBe(0);
  });
});
