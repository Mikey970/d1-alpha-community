import {expect, it} from 'vitest';
import {
  VENUS_SOUTHERN_WARPGATE_WAVES,
  VENUS_SOUTHERN_WARPGATE_WAVE_COUNT,
  buildVenusSouthernWarpgateWave,
  buildVenusSouthernWarpgateWaveEntries,
  venusSouthernWarpgateWaveSquads,
} from './rsat/mocks/sensor-auth';

it('keeps every authored squad reachable across the wave ordinals', () => {
  const all = VENUS_SOUTHERN_WARPGATE_WAVES.map(row => row.squad).sort((a, b) => a - b);
  const staged: number[] = [];
  for (let wave = 0; wave < VENUS_SOUTHERN_WARPGATE_WAVE_COUNT; wave++) {
    staged.push(...venusSouthernWarpgateWaveSquads(wave));
  }
  // Staging must not silently drop reinforcements the encounter authored.
  expect(staged.sort((a, b) => a - b)).toEqual(all);
  expect(all).toHaveLength(14);
});

it('opens with one wave per gate instead of all fourteen squads at once', () => {
  expect(venusSouthernWarpgateWaveSquads(0)).toEqual([25, 27, 31, 35]);
  expect(buildVenusSouthernWarpgateWave(0, [], true)).toHaveLength(4);
  // The unfiltered builder is what produced the single mass delivery.
  expect(buildVenusSouthernWarpgateWaveEntries(true)).toHaveLength(14);
});

it('stops feeding reinforcements from a gate that has been destroyed', () => {
  // Gate 70 owns squads 25 and 26 only.
  expect(venusSouthernWarpgateWaveSquads(1, [70])).toEqual([28, 32, 36]);
  expect(venusSouthernWarpgateWaveSquads(1, [])).toEqual([26, 28, 32, 36]);
  // Gate 70 has no wave beyond ordinal 1, so later waves are unaffected by it.
  expect(venusSouthernWarpgateWaveSquads(2, [70])).toEqual([29, 33, 37]);
  // With every gate down nothing further is sent.
  expect(venusSouthernWarpgateWaveSquads(2, [70, 72, 74, 76])).toEqual([]);
  expect(buildVenusSouthernWarpgateWave(2, [70, 72, 74, 76], true)).toEqual([]);
});

it('binds each wave to its own gate group and firing area', () => {
  for (const row of VENUS_SOUTHERN_WARPGATE_WAVES) {
    expect([70, 72, 74, 76]).toContain(row.gate);
    expect(row.wave).toBeGreaterThanOrEqual(0);
    expect(row.wave).toBeLessThan(VENUS_SOUTHERN_WARPGATE_WAVE_COUNT);
  }
  // Gates 02 and 03 share SquadGroup 335 and are separated by firing area.
  const g74 = VENUS_SOUTHERN_WARPGATE_WAVES.filter(r => r.gate === 74);
  const g76 = VENUS_SOUTHERN_WARPGATE_WAVES.filter(r => r.gate === 76);
  expect(new Set(g74.map(r => r.area))).toEqual(new Set([236]));
  expect(new Set(g76.map(r => r.area))).toEqual(new Set([237]));
});
