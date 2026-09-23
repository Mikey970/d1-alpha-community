import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it, vi} from 'vitest';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {...actual, readFileSync: vi.fn(actual.readFileSync)};
});
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

it('reads the dismantle ledger once per catalog and sees the next committed removal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'd1a-catalog-io-')); dirs.push(dir);
  const equipment = join(dir, 'equipment.json'), journal = `${equipment}.dismantle.json`;
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', equipment);
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  writeFileSync(journal, JSON.stringify({schema: 1, policy: 'captured-native-hold-x-v1', version: 1,
    tombstones: [{soid: '000000030000010b', defIndex: 814, actionIndex: 814, removedAt: '2026-09-21T00:00:00Z'}]}));
  const loadout = await import('./loadout');
  vi.mocked(readFileSync).mockClear();
  const before = loadout.inventoryWeapons();
  expect(before.some(item => item.soid === 0x30000010bn)).toBe(false);
  expect(before.some(item => item.soid === 0x300000100n)).toBe(true);
  expect(vi.mocked(readFileSync).mock.calls.filter(([file]) => file === journal)).toHaveLength(1);
  expect(loadout.dismantleInventoryItem(0x300000100n, 935, true).accepted).toBe(true);
  vi.mocked(readFileSync).mockClear();
  expect(loadout.inventoryWeapons().some(item => item.soid === 0x300000100n)).toBe(false);
  expect(vi.mocked(readFileSync).mock.calls.filter(([file]) => file === journal)).toHaveLength(1);
});
