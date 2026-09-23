import { decode } from '@blamnetwork/rsat';
import { describe, expect, it } from 'vitest';
import pending from './pvp-factory-pending-r576.fixture.json';
import { buildTowerApplySenseEntries, buildTowerBinderSenseEntries, encodeLifetimeAuth, senseEntryPayloadBits } from './sensor-auth';
import { LifetimeAuth, PlayerAuth } from '../schemas/sensor';

describe('native PvP initialization', () => {
  it('acknowledges every pending Factory sensor captured from the native client', () => {
    const entries = buildTowerApplySenseEntries(1n, 0, 'pvp_factory');
    const refs = entries.map(({clientRef:r}) => r.bundle.toString(16).padStart(8,'0') +
      r.typeId.toString(16).padStart(2,'0') + r.typeIndex.toString(16).padStart(6,'0'));
    expect(pending).toHaveLength(53);
    expect(pending.every(ref => refs.includes(ref))).toBe(true);
    expect(new Set(refs).size).toBe(refs.length);
    expect(entries.some(e => e.clientRef.bundle === 0x4786c0e0 || e.clientRef.bundle === 0xf2d88bd0)).toBe(false);
    const picker = entries.find(e => e.clientRef.bundle === 0xc2dacaf7 && e.clientRef.typeId === 14)!;
    expect(picker.authSchemaBound).toBe(false);
    // Native Sense header: present, received, absolute/reset, Option present;
    // then empty four-bit team count and unchanged 32-bit sequence zero.
    expect(senseEntryPayloadBits(picker)).toEqual([1,1,1,1,...Array(36).fill(0)]);
  });

  it.each(['pvp_factory','pvp_greenhouse','pvp_marsbattle'])('uses %s native binder and unset phase metadata', name => {
    const entries = buildTowerBinderSenseEntries(1n, name);
    expect(entries).toHaveLength(13);
    expect(entries.every(e => e.clientRef.bundle === 0xc2dacaf7)).toBe(true);
    expect(entries.filter(e => e.clientRef.typeId === 12)).toHaveLength(12);
    for (const rows of [entries, buildTowerApplySenseEntries(1n, 0, name)]) {
      const players = rows.filter(e => e.clientRef.typeId === 12);
      const occupied = players.filter(e => decode(PlayerAuth, e.authBody!).key !== 0n);
      expect(occupied).toHaveLength(1);
      expect(occupied[0].clientRef).toEqual({bundle: 0xc2dacaf7, typeId: 12, typeIndex: 4});
      expect(decode(PlayerAuth, occupied[0].authBody!)).toMatchObject({key: 1n, unk1: 16});
      expect(players.filter(e => e !== occupied[0]).every(e =>
        decode(PlayerAuth, e.authBody!).key === 0n)).toBe(true);
    }
    // All three native FAHs contain zero phase rows; Factory component
    // before Auth has index -1, hash 811C9DC5 and field4 -1.
    const lifetime = decode(LifetimeAuth, encodeLifetimeAuth(2, name).bytes);
    expect(lifetime).toMatchObject({
      state:2, flag1:true, phaseIndex:-1, field4:-1,
    });
    expect(lifetime.phaseHash >>> 0).toBe(0x811c9dc5);
  });

  it('preserves cooperative teams outside PvP', () => {
    for (const name of ['city_tower_default1', 'action_mock', 'venus_chapter_2']) {
      const players = buildTowerBinderSenseEntries(1n, name).filter(e => e.clientRef.typeId === 12);
      expect(players.length).toBeGreaterThan(0);
      expect(players.every(e => decode(PlayerAuth, e.authBody!).unk1 === 0)).toBe(true);
    }
  });
});
