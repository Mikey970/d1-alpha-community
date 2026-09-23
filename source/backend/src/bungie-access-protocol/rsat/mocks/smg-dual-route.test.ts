import {afterEach, expect, it, vi} from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('equips independent SMG and original laser-blaster routes without conflating their SOIDs', async () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', '');
  vi.stubEnv('D1A_TALENT_STATE_PATH', '');
  vi.resetModules();
  const loadout = await import('./loadout');
  const values = await import('./values');
  for (const [soid, pattern, art] of [[0x300000401n, 26, 707], [0x300000403n, 11, 547], [0x300000401n, 26, 707]] as const) {
    expect(loadout.inventoryWeapons().find(w => w.soid === soid)?.sandboxPattern).toBe(pattern);
    expect(loadout.equipInventoryProbe(soid)).toBe(true);
    expect(values.stubGearCf().unknown3.unknown0[8]).toMatchObject({soid, unknown2: pattern, unknown3: art});
  }
});
