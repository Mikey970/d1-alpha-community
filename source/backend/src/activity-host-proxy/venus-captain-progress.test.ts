import { describe, expect, it } from 'vitest';
import { readCaptainSquad, VenusCaptainProgress } from './venus-captain-progress';

// Unmodified client packets from r367-captain-health-target, 2026-09-05.
const packet = (hex: string) => Buffer.from(hex, 'hex');
const active = packet('289f6f54414000c4108000000050');
const terminal = packet('289f6f54414000c406ffc6000000040000001a');
const proximity = packet('289f6f54414000c0308000000010');
const readiness = packet('31986286c14001c2088000000070');

describe('Captain progression from captured native traffic', () => {
  it('accepts the real r536 Captain death coalesced behind a minion record', () => {
    // r536 server.stdout.log lines930/1015, unmodified native payloads.
    const live = packet('289f6f54414004441680000000fa27dbd5105000f105a00000004289f6f544140034416800000013a27dbd5105000b104200000003e89f6f54414002443080000000ca27dbd51050007105a00000004689f6f54414000c41680000000c00');
    const death = packet('289f6f544140024030600000009513edea8828001881037fe3000000020000001000');
    expect(readCaptainSquad(live)).toMatchObject({memberCount:1, sequence:12});
    expect(readCaptainSquad(death)).toMatchObject({memberCount:0,roster:[1],sequence:16,singleEntry:false});
    const progress = new VenusCaptainProgress();
    expect(progress.observe(death)).toBe(false);
    const fresh = new VenusCaptainProgress();
    expect(fresh.observe(live)).toBe(false);
    expect(fresh.observe(death)).toBe(true);
    expect(fresh.observe(death)).toBe(false);
    expect(readCaptainSquad(death.subarray(0,-2))).toBeUndefined();
  });
  it('decodes the seven-bit field without corrupting sequence or roster', () => {
    expect(readCaptainSquad(proximity)).toMatchObject({ sequence: 2, valid: true });
    expect(readCaptainSquad(active)).toMatchObject({ memberCount: 1, sequence: 5 });
    expect(readCaptainSquad(terminal)).toMatchObject({
      memberCount: 0, roster: [1], sequence: 13, valid: true, singleEntry: true,
    });
  });
  it('advances once after the observed active-to-terminal transition', () => {
    const progress = new VenusCaptainProgress();
    expect(progress.observe(active)).toBe(false);
    expect(progress.observe(terminal)).toBe(true);
    expect(progress.observe(terminal)).toBe(false);
  });
  it('does not advance on readiness, proximity, or terminal state without prior activity', () => {
    const progress = new VenusCaptainProgress();
    for (const payload of [readiness, proximity, terminal]) expect(progress.observe(payload)).toBe(false);
  });
  it('rejects truncated or foreign packets', () => {
    expect(readCaptainSquad(terminal.subarray(0, -1))).toBeUndefined();
    const foreign = Buffer.from(terminal); foreign[1] ^= 1;
    expect(readCaptainSquad(foreign)).toBeUndefined();
  });
  it('requires fresh activity after leaving the encounter and rejects stale ordering', () => {
    const progress = new VenusCaptainProgress();
    progress.observe(active); progress.resetEncounter();
    expect(progress.observe(terminal)).toBe(false);
    expect(progress.observe(active)).toBe(false);
    expect(progress.observe(terminal)).toBe(false);
  });
});
