import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readVenusGateSense, VenusGateProgress } from './venus-gate-progress';

const capture: {line:number;payload:string}[] = JSON.parse(readFileSync(new URL('./venus-gate-r405.fixture.json', import.meta.url), 'utf8'));
const live = Buffer.from(capture[0].payload, 'hex');

describe('gate live state coalesced with real device receipt', () => {
  it('fully reads the device and all gate live records, then counts the captured kill', () => {
    expect(readVenusGateSense(live)?.actors.map(row => row.index).sort()).toEqual([70,72,74,76]);
    const progress = new VenusGateProgress();
    let changes = 0;
    for (const row of capture) if (progress.observe(Buffer.from(row.payload, 'hex'))) changes++;
    expect(changes).toBe(1);
    expect(progress.defeatedActors).toEqual([70]);
    expect(progress.complete).toBe(false);
    for (const row of capture) expect(progress.observe(Buffer.from(row.payload, 'hex'))).toBe(false);
  });
  it('rejects incomplete receipts and unknown tagged commands', () => {
    expect(readVenusGateSense(live.subarray(0,30))).toBeUndefined();
    const unknown = Buffer.from(live);
    // The native receipt tag occupies bits192..223 in this capture.
    unknown[27] ^= 1;
    expect(readVenusGateSense(unknown)).toBeUndefined();
  });
});
