import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let directory: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (directory) rmSync(directory, {recursive: true, force: true});
});

it('persists the native Ghost Gun selections and projects its real modifier through equipped GearCF', async () => {
  directory = mkdtempSync(join(tmpdir(), 'd1a-ghost-grid-'));
  const base = join(directory, 'talent.json');
  const arc = `${base}.hunter-arc.json`;
  writeFileSync(arc, 'unrelated Hunter Arc save');
  vi.stubEnv('D1A_CHARACTER_LEVEL15', '1');
  vi.stubEnv('D1A_HUNTER_ARC', '1');
  vi.stubEnv('D1A_TALENT_PROBE', '1');
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_TALENT_STATE_PATH', base);
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', join(directory, 'equipment.json'));
  vi.resetModules();
  const ghost = await import('./hunter-ghost-state');
  const router = await import('./talent-state');
  for (const node of [0, 25, 5]) {
    expect(router.activateTalentStep(ghost.TALENT_ITEM_SOID, node).accepted).toBe(true);
  }
  ghost.resetTalentStateForTests();
  expect(ghost.talentAbilityRecords().map(r => r.unknown0)).toEqual([23, 6, 9, 3, 20]);
  expect(ghost.talentAbilityRecords()[1]!.unknown1.unknown0[0]).toBe(0x43111bfd);
  expect(readFileSync(arc, 'utf8')).toBe('unrelated Hunter Arc save');
  // Avoid loading the deliberately unrelated Arc fixture through other inventory readers.
  vi.stubEnv('D1A_TALENT_STATE_PATH', '');
  const loadout = await import('./loadout');
  const values = await import('./values');
  expect(loadout.equipInventoryProbe(ghost.TALENT_ITEM_SOID)).toBe(true);
  expect(values.stubGearCf().unknown1.unknown0[1]!.unknown0).toBe(6);
  expect(values.stubGearCf().unknown1.unknown0[1]!.unknown1.unknown0[0]).toBe(0x43111bfd);
  expect(values.stubInventoryItem(ghost.TALENT_ITEM_SOID, 438, 1).unknown4?.unknown0).toBe(247);
  expect(values.stubGearCf().unknown3.unknown0[1]).toMatchObject({defIndex:438, unknown2:-1, unknown3:-1});
  expect(router.activateTalentStep(0x300000999n, 25).accepted).toBe(false);
});
