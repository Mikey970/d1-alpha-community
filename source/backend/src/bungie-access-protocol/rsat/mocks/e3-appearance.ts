import {characterSetting} from '../../character-context';
import presets from './e3-appearance.native.json';

export function e3AppearancePreset() {
  const selection = characterSetting('D1A_E3_ABILITY_PRESET');
  if (!selection) return undefined;
  if (!/^(18|19|20|21|22|23|24|25)$/.test(selection)) {
    throw new Error('E3 appearance requires an authored preset18-25');
  }
  return presets.find(p => p.index === Number(selection))!;
}

export function e3ArmorAppearance(slot: number) {
  const armor = e3AppearancePreset()?.armor.find(a => a.slot === slot);
  if (!armor) return undefined;
  return {
    art: armor.art,
    dyes: { unknown0: Array.from({length: 6}, (_, i) => ({
      unknown0: armor.dyes[i]?.channel ?? -1,
      unknown1: armor.dyes[i]?.index ?? -1,
    })) },
  };
}
