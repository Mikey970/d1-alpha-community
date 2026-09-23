import { decode } from '@blamnetwork/rsat';
import { describe, expect, it } from 'vitest';
import fixture from './action-registry-r549.fixture.json';
import { buildTowerApplySenseEntries, playerKeyFromCharacter } from './sensor-auth';
import { LootAuth, PlayerAuth, PlayerTriggerAuth, SquadSense } from '../schemas/sensor';

const key = (bundle: number, typeId: number, typeIndex: number) =>
  `${(bundle >>> 0).toString(16).toUpperCase()}/${typeId}/${typeIndex}`;

describe('Action Mock initial registry binding', () => {
  it('covers the captured native registry exactly, keeping unplaced actors and triggers inactive', () => {
    const playerKey = playerKeyFromCharacter(0x200000002n);
    const entries = buildTowerApplySenseEntries(playerKey, 0, 'action_mock');
    const keys = entries.map(e => key(e.clientRef.bundle, e.clientRef.typeId, e.clientRef.typeIndex));
    expect(keys.length).toBe(fixture.count);
    expect(new Set(keys).size).toBe(fixture.count);
    expect(keys.sort()).toEqual(fixture.rows.map(r => key(parseInt(r.bundle, 16), r.typeId, r.typeIndex)).sort());
    for (const entry of entries) {
      if (entry.clientRef.typeId === 12) expect(decode(PlayerAuth, entry.authBody!).key)
        .toBe(entry.clientRef.typeIndex === 5 ? playerKey : 0n);
      if (entry.clientRef.typeId === 29) expect(decode(PlayerTriggerAuth, entry.authBody!).flag).toBe(false);
      if (entry.clientRef.typeId === 35) expect(decode(LootAuth, entry.authBody!).flag).toBe(false);
      if (entry.clientRef.typeId === 1) expect(decode(SquadSense, entry.senseBody!).valid).toBe(false);
    }
  });

  it('does not replay these initialized rows after Action combat has activated', () => {
    const entries = buildTowerApplySenseEntries(playerKeyFromCharacter(), 0, 'action_mock', true, false);
    const pending = new Set(fixture.initialPending.map(index => fixture.rows[index])
      .map(r => key(parseInt(r.bundle, 16), r.typeId, r.typeIndex)));
    expect(entries.filter(e => pending.has(key(e.clientRef.bundle, e.clientRef.typeId, e.clientRef.typeIndex)))).toEqual([]);
  });
});
