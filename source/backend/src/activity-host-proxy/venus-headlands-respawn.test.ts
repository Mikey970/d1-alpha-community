import { describe, expect, it } from 'vitest';
import fixtures from './venus-headlands-sense.fixture.json';
import { readHeadlandsSquad, VenusHeadlandsRespawn, RECOVERY_RESPAWN_DELAY_MS } from './venus-headlands-respawn';

describe('Headlands native replenishment from r390 fight traffic', () => {
  it('replenishes each cleared authored population once without crediting loot', () => {
    const progress = new VenusHeadlandsRespawn();
    for (const row of fixtures) progress.observe(Buffer.from(row.payload, 'hex'), 1000);
    expect(progress.takeReady(1000 + RECOVERY_RESPAWN_DELAY_MS - 1)).toEqual([]);
    expect(progress.takeReady(1000 + RECOVERY_RESPAWN_DELAY_MS).sort((a,b) => a.squad-b.squad))
      .toEqual([{ squad: 24, allocation: 8 }, { squad: 26, allocation: 8 },
        { squad: 28, allocation: 4 }, { squad: 30, allocation: 2 }]);
    for (const row of fixtures) progress.observe(Buffer.from(row.payload, 'hex'), 100000);
    expect(progress.takeReady(1000000)).toEqual([]);
  });
  it('does not interpret unload, terminal-only, truncation, or leaving as a fresh clear', () => {
    const terminal = fixtures.filter(row => row.members === 0);
    const progress = new VenusHeadlandsRespawn();
    for (const row of terminal) progress.observe(Buffer.from(row.payload, 'hex'), 0);
    expect(progress.takeReady(100000)).toEqual([]);
    for (const row of fixtures) progress.observe(Buffer.from(row.payload, 'hex'), 0);
    progress.resetObservations();
    expect(progress.takeReady(100000)).toEqual([]);
    expect(readHeadlandsSquad(Buffer.from(terminal[0].payload, 'hex').subarray(0, 10))).toBeUndefined();
  });
  it('decodes actual full clears as 4/4/2/1 unavailable with zero remaining members', () => {
    const cleared = fixtures.map(row => readHeadlandsSquad(Buffer.from(row.payload, 'hex')))
      .filter(row => row?.members === 0 && row.roster?.length === 1);
    expect(cleared.map(row => [row!.squad, row!.roster![0]]).sort((a,b) => a[0]-b[0]))
      .toEqual([[24,4],[26,4],[28,2],[30,1]]);
  });
});
