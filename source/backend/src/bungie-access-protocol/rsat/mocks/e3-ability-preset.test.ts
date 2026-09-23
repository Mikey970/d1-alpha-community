import {afterEach, expect, it, vi} from 'vitest';
import {e3AbilityRecords} from './e3-ability-preset';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('preserves mixed E3 abilities and rejects mismatched character classes', () => {
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '21');
  expect(e3AbilityRecords(1)?.map(a => a.unknown0)).toEqual([5,4,8,3,16]);
  expect(() => e3AbilityRecords(2)).toThrow('requires character class 1');
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '19');
  const booth = e3AbilityRecords(3)!;
  expect(booth.map(a => a.unknown0)).toEqual([19,12,9,7,20]);
  expect(booth[0]!.unknown1.unknown0.filter(h => h !== 0x811c9dc5)).toHaveLength(2);
  expect(booth[1]!.unknown1.unknown0.filter(h => h !== 0x811c9dc5)).toHaveLength(1);
});

it('projects the Hunter E3 abilities through GearCF only when opted in', async () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_HUNTER_ARC', '1');
  vi.stubEnv('D1A_TALENT_STATE_PATH', '');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', '');
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '20');
  const {stubGearCf} = await import('./values');
  const before = stubGearCf();
  expect(before.unknown1.unknown0.map(a => a.unknown0)).toEqual([18,6,9,3,20]);
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '');
  expect(e3AbilityRecords(2)).toBeUndefined();
  // E3 now restores armor art as well as abilities; disabling it restores
  // the original Hunter appearance instead of preserving the E3 colors.
  expect(stubGearCf().unknown3.unknown0[2]).toMatchObject({defIndex:204,unknown3:211});
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '20junk');
  expect(() => stubGearCf()).toThrow(/authored preset/);
});
