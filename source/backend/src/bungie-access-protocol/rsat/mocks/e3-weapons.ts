import rows from './e3-weapons.native.json';
import {e3AppearancePreset} from './e3-appearance';

export function e3WeaponItems() {
  const preset = e3AppearancePreset();
  return preset ? rows.filter(row => row.preset === preset.index).map(row => ({
    ...row, soid: BigInt(`0x${row.soid}`), stats: row.stats as [number,number][],
  })) : undefined;
}
export function e3WeaponDefault(slot:number):bigint|undefined {
  const items=e3WeaponItems();
  const preset=e3AppearancePreset();
  // Compiled E3 super assignments: Nova18/19/23, Radiance22,
  // Ghost Gun20/25, Fist of Havoc21/24. These SOIDs own native subclass items.
  if (preset && slot===1) return ({18:0x300000200n,19:0x300000200n,
    20:0x300000204n,21:0x300000203n,22:0x300000201n,23:0x300000200n,
    24:0x300000203n,25:0x300000204n} as Record<number,bigint>)[preset.index];
  return items && slot>=7 && slot<=9 ? items.find(item=>item.slot===slot)?.soid ?? 0n : undefined;
}
