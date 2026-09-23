import { BitReader } from '@blamnetwork/rsat';
import { describe, expect, it } from 'vitest';
import { SquadAuth } from './rsat/schemas/sensor';
import { ActivityBundleItemType } from '../tags/types';
import {
  buildVenusSouthernWarpgateWaveEntries,
  buildVenusSouthernSniperEntries,
  buildTowerSensorAuthRsat,
  VENUS_SOUTHERN_WARPGATE_WAVES,
} from './rsat/mocks/sensor-auth';
import { scenarioClient } from './scenario-client';

describe('Venus Southern warpgate encounter combat recovery', () => {
  it('activates all 14 authored warpgate wave squads with proper groups and firing area sets', () => {
    const initial = buildVenusSouthernWarpgateWaveEntries(true);
    const refresh = buildVenusSouthernWarpgateWaveEntries();

    expect(initial).toHaveLength(14);
    expect(refresh).toHaveLength(14);

    // Verify squads 25..38 exist in sequence
    const squadIndices = initial.map(e => e.clientRef.typeIndex);
    expect(squadIndices).toEqual([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);

    // Verify bundle identity
    expect(initial.every(e => e.clientRef.bundle === 0x517641f1)).toBe(true);
    expect(initial.every(e => e.clientRef.typeId === ActivityBundleItemType.Squad)).toBe(true);

    // Check squad decoded auth bodies for proper groups, firing areas, and rosters
    for (let i = 0; i < initial.length; i++) {
      const entry = initial[i];
      const wave = VENUS_SOUTHERN_WARPGATE_WAVES[i];
      const decoded = SquadAuth.decode(new BitReader(entry.authBody!));

      expect(decoded.ref0).toEqual({
        bundle: 0x517641f1,
        typeId: ActivityBundleItemType.SquadGroup,
        typeIndex: wave.group,
      });
      expect(decoded.ref1).toEqual({
        bundle: 0x517641f1,
        typeId: ActivityBundleItemType.FiringAreaSet,
        typeIndex: wave.area,
      });
      expect(decoded.roster.slots).toEqual(wave.population);
    }

    // Initial placement must carry sense state; refresh must retain native deaths without fabricated resets
    expect(initial.every(e => e.isReceivedSenseState && e.senseStateSequence === 0)).toBe(true);
    expect(refresh.every(e => !e.isReceivedSenseState && e.senseBits === 0)).toBe(true);
    expect(refresh.map(e => e.authBody)).toEqual(initial.map(e => e.authBody));
  });

  it('binds firingAreaSet to all 7 sniper squads to guarantee valid placement', () => {
    const snipers = buildVenusSouthernSniperEntries(true);
    const squads = snipers.filter(e => e.clientRef.typeId === ActivityBundleItemType.Squad);

    expect(squads).toHaveLength(7);
    for (const sq of squads) {
      const decoded = SquadAuth.decode(new BitReader(sq.authBody!));
      expect(decoded.ref0).toEqual({
        bundle: 0x517641f1,
        typeId: ActivityBundleItemType.SquadGroup,
        typeIndex: 336,
      });
      expect(decoded.ref1).toEqual({
        bundle: 0x517641f1,
        typeId: ActivityBundleItemType.FiringAreaSet,
        typeIndex: 238,
      });
    }
  });

  it('includes warpgate waves and snipers during objective 60, but suppresses combat re-injection during objective 112', () => {
    const scenario = scenarioClient('venus_chapter_2');

    // During active warpgate combat (objective 60):
    const activeCombatPayload = buildTowerSensorAuthRsat({
      scenario,
      slice: 23,
      grantTable: false,
      venusMissionObjective: 60,
      venusGateCount: 2,
      venusDefeatedGates: [70, 72],
    });
    expect(activeCombatPayload.length).toBeGreaterThan(5000);

    // After 4/4 gates defeated (objective 112):
    // Southern combat encounter is complete; departure slice 23 must not re-inject live gates/squads
    const postGatePayload = buildTowerSensorAuthRsat({
      scenario,
      slice: 23,
      grantTable: false,
      venusMissionObjective: 112,
      venusGateCount: 4,
      venusDefeatedGates: [70, 72, 74, 76],
    });
    expect(postGatePayload.length).toBeLessThan(activeCombatPayload.length);
  });
});
