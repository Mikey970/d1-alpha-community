import {afterEach, expect, it, vi} from 'vitest';
import {configuredCharacterClass} from './configured-character-class';
import {inventoryWeapons, INVENTORY_BUCKET_BAG_COUNT} from './loadout';
afterEach(()=>vi.unstubAllEnvs());
it.each([
  ['hunter-arc',2,[437,438]], ['hunter-ghost',2,[437,438]],
  ['warlock-nova',3,[441,442]], ['warlock-radiance',3,[441,442]],
  ['titan-arc',1,[434]],
] as const)('publishes %s with its native class and subclasses inside the five-slot bag', (character, klass, definitions)=>{
  vi.stubEnv('D1A_DIRECTOR_CHARACTER',character);
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');
  expect(configuredCharacterClass()).toBe(klass);
  const subclasses=inventoryWeapons().filter(item=>item.slot===1);
  expect(subclasses.map(item=>item.defIndex).sort()).toEqual([...definitions].sort());
  expect(subclasses.length+1).toBeLessThanOrEqual(INVENTORY_BUCKET_BAG_COUNT[7]);
});
